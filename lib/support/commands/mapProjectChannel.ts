import {
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
  Value,
} from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage, slackTs } from "@atomist/sdm";
import { SelectOption, SlackMessage } from "@atomist/slack-messages";
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import { sdmPostWebhook } from "../helpers/postWebhook";
import { getIngesterWebhookUrl } from "../helpers/registrationInfo";
import { getJiraDetails } from "../jiraDataLookup";
import { JiraProject } from "./shared";

// export const lookupChannelMapping = (ctx: HandlerContext, ) {
//     // Return
//     // This channel is mapped to the following projects/components
//     // For each returned project/component - include action button to unlink
// }

// export const setChannelPrefrences = (ctx: HandlerContext) {
//     // Create or edit JiraChannelPrefs object
//     // What types of items we should report to this channel
// }

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
}

@Parameters()
class JiraProjectMappingOptionsParams {
    @Parameter()
    public cmd: string = "CreateProjectChannelMapping";
}

export async function createProjectChannelMapping(ci: CommandListenerInvocation<JiraProjectMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const endpoint = await getIngesterWebhookUrl("JiraProjectMap");
    const payload = {
        channel: ci.parameters.slackChannelName,
        projectId: ci.parameters.projectId,
        active: true,
    };
    await sdmPostWebhook(endpoint, payload);

    const projectDetails = await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`);
    ci.addressChannels(slackSuccessMessage(
        `New JIRA Project mapping created successfully!`,
        `Added new mapping from Project *${projectDetails.name}* to *${ci.parameters.slackChannelName}*`,
    ));

    return { code: 0 };
}

export const createProjectChannelMappingReg: CommandHandlerRegistration<JiraProjectMappingParams> = {
    name: "CreateProjectChannelMapping",
    description: "Create a mapping between a JIRA Project ID and a Chat channel",
    paramsMaker: JiraProjectMappingParams,
    listener: createProjectChannelMapping,
};

export async function createProjectChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingOptionsParams>): Promise<HandlerResult> {
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
        .then(result => {
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
                      menuForCommand(menuSpec, ci.parameters.cmd, "projectId"),
                    ],
                }],
            };

            ci.addressChannels(message);
        })
        .catch(e => {
            logger.error(`Failed to retrieve project list! ${e}`);
            return {
                code: 1,
                message: e,
            };
        });

    return { code: 0 };
}

export const produceProjectChannelMappingOptions: CommandHandlerRegistration<JiraProjectMappingOptionsParams> = {
    name: "CreateProjectChannelMappingOptions",
    description: "Enable JIRA notifications for a project",
    intent: "create jira project mapping",
    listener: createProjectChannelMappingOptions,
    paramsMaker: JiraProjectMappingOptionsParams,
};

// export const createComponentChannelMapping = (ctx) {
// }
