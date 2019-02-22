import {
  addressEvent,
  configurationValue,
  HandlerResult,
  HttpClientFactory,
  HttpMethod,
  logger,
  MappedParameter,
  MappedParameters,
  menuForCommand,
  MenuSpecification,
  Parameter,
  Parameters,
} from "@atomist/automation-client";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage, slackSuccessMessage, slackTs} from "@atomist/sdm";
import { SelectOption, SlackMessage } from "@atomist/slack-messages";
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import { getMappedProjectsbyChannel } from "../helpers/channelLookup";
import { getJiraDetails } from "../jiraDataLookup";
import { lookupJiraProjectDetails } from "./getCurrentChannelMappings";
import { JiraProject } from "./shared";

@Parameters()
export class JiraProjectMappingParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @Parameter({
        description: "JIRA Project ID to link",
        displayName: "JIRA Project ID",
        type: "string",
        required: true,
    })
    public projectId: string;

    @Parameter({
        required: false,
        displayable: false,
        type: "boolean",
    })
    public enabled: boolean = true;
}

@Parameters()
class JiraProjectRemoveMappingOptionsParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @Parameter({
        required: false,
        type: "boolean",
        displayable: false,
    })
    public enabled: boolean = false;
}

@Parameters()
class JiraProjectMappingOptionsParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @Parameter()
    public cmd: string = "CreateProjectChannelMapping";

    @Parameter({
        required: false,
        displayable: false,
        type: "boolean",
    })
    public enabled: boolean = true;
}

export function createProjectChannelMapping(
    ci: CommandListenerInvocation<JiraProjectMappingParams>,
    ): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
            logger.debug(`JIRA createProjectChannelMapping: enabled => ${ci.parameters.enabled}`);

            const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
            const payload = {
                channel: ci.parameters.slackChannelName,
                projectId: ci.parameters.projectId,
                active: ci.parameters.enabled,
            };
            await ci.context.messageClient.send(payload, addressEvent("JiraProjectMap"));
            const projectDetails =
                await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`);

            const subject = ci.parameters.enabled ? `New JIRA Project mapping created successfully!` : `JIRA Project mapping removed successfully!`;
            const message = ci.parameters.enabled ?
                `Added new mapping from Project *${projectDetails.name}* to *${ci.parameters.slackChannelName}*` :
                `Removed mapping from Project *${projectDetails.name}* to *${ci.parameters.slackChannelName}*`;

            await ci.addressChannels(slackSuccessMessage(
                subject,
                message,
            ));

            resolve({ code: 0 });
        } catch (error) {
            logger.error(`JIRA removeProjectMapping: Error completing command => ${error}`);
            reject({
                code: 1,
                message: error,
            });
        }
    });
}

export const createProjectChannelMappingReg: CommandHandlerRegistration<JiraProjectMappingParams> = {
    name: "CreateProjectChannelMapping",
    description: "Create a mapping between a JIRA Project ID and a Chat channel",
    paramsMaker: JiraProjectMappingParams,
    listener: createProjectChannelMapping,
};

export function createProjectChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingOptionsParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

        logger.debug(`JIRA createProjectChannelMappingOptions: Command is ${JSON.stringify(ci.parameters)}`);

        const projectValues: SelectOption[] = [];
        await httpClient.exchange(
            lookupUrl,
            {
                method: HttpMethod.Get,
                headers: {
                    Accept: "application/json",
                },
                options: {
                    auth: {
                        username: jiraConfig.user,
                        password: jiraConfig.password,
                    },
                },
            },
        )
            .then(async result => {
                const projects = result.body as JiraProject[];
                projects.forEach(p => {
                    projectValues.push({text: p.name, value: p.id});
                });

                const menuSpec: MenuSpecification = {
                    text: "Select Project",
                    options: projectValues,
                };

                const message: SlackMessage = {
                    attachments: [{
                        pretext: `Create a new JIRA Project Mapping`,
                        color: "#45B254",
                        fallback: `Create a new project mapping`,
                        ts: slackTs(),
                        actions: [
                            menuForCommand(menuSpec, ci.parameters.cmd, "projectId", {
                                enabled: ci.parameters.enabled,
                            }),
                        ],
                    }],
                };

                await ci.addressChannels(message, {
                    ttl: 15000,
                    id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
                });
                resolve({ code: 0 });
            })
            .catch(async e => {
                reject({
                    code: 1,
                    message: e,
                });
            });
    });
}

export const produceProjectChannelMappingOptions: CommandHandlerRegistration<JiraProjectMappingOptionsParams> = {
    name: "CreateProjectChannelMappingOptions",
    description: "Enable JIRA notifications for a project",
    intent: "jira map project",
    listener: createProjectChannelMappingOptions,
    paramsMaker: JiraProjectMappingOptionsParams,
};

export function removeProjectMapping(ci: CommandListenerInvocation<JiraProjectRemoveMappingOptionsParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        // Get current channel projects
        try {
            const projects = await getMappedProjectsbyChannel(ci.context, ci.parameters.slackChannelName);
            const projectDetails = await lookupJiraProjectDetails(projects);

            const projectValues: SelectOption[] = [];

            projectDetails.forEach(p => {
                projectValues.push({text: p.name, value: p.id});
            });

            const menuSpec: MenuSpecification = {
                text: "Select Project",
                options: projectValues,
            };

            const message: SlackMessage = {
                attachments: [{
                    pretext: `Remove a JIRA Project Mapping`,
                    color: "#45B254",
                    fallback: `Remove a new Jira Project mapping`,
                    ts: slackTs(),
                    actions: [
                        menuForCommand(menuSpec, "CreateProjectChannelMapping", "projectId", {
                            enabled: "false",
                        }),
                    ],
                }],
            };

            await ci.addressChannels(message);
            resolve({ code: 0 });
        } catch (error) {
            logger.error(`JIRA removeProjectMapping: Error completing command => ${error}`);
            reject({
                code: 1,
                message: error,
            });
        }
    });
}

export const removeProjectMappingReg: CommandHandlerRegistration<JiraProjectRemoveMappingOptionsParams> = {
    name: "RemoveChannelProjectMapping",
    description: "Enable JIRA notifications for a project",
    intent: "jira disable project map",
    listener: removeProjectMapping,
    paramsMaker: JiraProjectRemoveMappingOptionsParams,
};
