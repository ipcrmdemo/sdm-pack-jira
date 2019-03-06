import {
    addressEvent, buttonForCommand,
    configurationValue,
    HandlerResult,
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
import { JiraProject } from "../shared";
import { lookupJiraProjectDetails } from "./getCurrentChannelMappings";

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

    @Parameter({
        required: false,
        displayable: false,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;
}

@Parameters()
class JiraProjectSearchParams {
    @Parameter({
        displayName: `Search string`,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;
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
                await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`, true);

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

export function createProjectChannelMappingProjectInput(ci: CommandListenerInvocation<JiraProjectSearchParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const msg: SlackMessage = {
            attachments: [{
                text: "Search for project",
                fallback: "Search for project",
                actions: [buttonForCommand(
                    { text: "Search"},
                    "CreateProjectChannelMappingOptions",
                    {...ci.parameters}),
                ],
            }],
        };

        await ci.addressChannels(msg,
        {
            ttl: 15000,
            id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
        });

        resolve({code: 0});
    });
}

export const createProjectChannelMappingProjectInputReg: CommandHandlerRegistration<JiraProjectSearchParams> = {
    name: "CreateProjectChannelMappingProjectInput",
    description: "Enable JIRA notifications for a project",
    intent: "jira map project",
    listener: createProjectChannelMappingProjectInput,
    paramsMaker: JiraProjectSearchParams,
    autoSubmit: true,
};

export function createProjectChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingOptionsParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

        logger.debug(`JIRA createProjectChannelMappingOptions: Command is ${JSON.stringify(ci.parameters)}`);

        const projectValues: SelectOption[] = [];
        const result = await getJiraDetails<JiraProject[]>(lookupUrl, true);

        result.forEach(p => {
            if (ci.parameters.projectSearch.toLowerCase().includes(p.name.toLowerCase())) {
                projectValues.push({text: p.name, value: p.id});
            }
        });

        let message: SlackMessage;
        if (projectValues) {
            const menuSpec: MenuSpecification = {
                text: "Select Project",
                options: projectValues,
            };

            message = {
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
        } else {
            message = slackErrorMessage(
                `Failed to find any projects matching your terms!`,
                `Query of JIRA returned 0 results for projects matching ${ci.parameters.projectSearch}`,
                ci.context,
            );
        }

        await ci.addressChannels(message,
            {
            ttl: 15000,
            id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
        });
        resolve({ code: 0 });
    });
}

export const produceProjectChannelMappingOptions: CommandHandlerRegistration<JiraProjectMappingOptionsParams> = {
    name: "CreateProjectChannelMappingOptions",
    description: "Enable JIRA notifications for a project",
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
