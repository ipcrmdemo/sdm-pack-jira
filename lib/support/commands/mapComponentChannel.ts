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
  SelectOption,
} from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage, slackTs } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import { sdmPostWebhook } from "../helpers/postWebhook";
import { getIngesterWebhookUrl } from "../helpers/registrationInfo";
import { getJiraDetails } from "../jiraDataLookup";
import { createProjectChannelMappingReg } from "./mapProjectChannel";
import { JiraProject } from "./shared";

@Parameters()
class JiraComponentMappingParams {
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
        description: "JIRA Component ID to link",
        displayName: "JIRA Component ID",
        type: "string",
        required: true,
    })
    public componentId: string;
}

export async function createComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const endpoint = await getIngesterWebhookUrl("JiraComponentMap");
    const payload = {
        channel: ci.parameters.slackChannelName,
        projectId: ci.parameters.projectId,
        active: true,
    };
    await sdmPostWebhook(endpoint, payload);
    const componentDetails =
        await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/component/${ci.parameters.componentId}`);
    ci.addressChannels(slackSuccessMessage(
        `New JIRA Component mapping created successfully!`,
        `Added new mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
    ));

    return { code: 0 };
}

export const createComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentMappingParams> = {
    name: "CreateProjectChannelMapping",
    description: "Create a mapping between a JIRA Project ID and a Chat channel",
    paramsMaker: JiraComponentMappingParams,
    listener: createComponentChannelMapping,
};

export async function createComponentChannelMappingOptions(ci: CommandListenerInvocation): Promise<HandlerResult> {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

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
                      menuForCommand(menuSpec, createProjectChannelMappingReg.name, "projectId"),
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