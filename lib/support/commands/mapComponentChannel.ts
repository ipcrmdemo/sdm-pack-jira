import {
  configurationValue,
  HandlerResult,
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
import { createProjectChannelMappingOptions, JiraProjectMappingParams } from "./mapProjectChannel";

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

@Parameters()
class JiraComponentMappingOptionsParams {
    @Parameter()
    public cmd: string = "CreateComponentChannelOptionsMapping";
}

export async function createComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const endpoint = await getIngesterWebhookUrl("JiraComponentMap");
    const payload = {
        channel: ci.parameters.slackChannelName,
        projectId: ci.parameters.projectId,
        componentId: ci.parameters.componentId,
        active: true,
    };
    await sdmPostWebhook(endpoint, payload);
    const componentDetails =
        await getJiraDetails<types.OnJiraIssueEvent.Components>(`${jiraConfig.url}/rest/api/2/component/${ci.parameters.componentId}`);
    ci.addressChannels(slackSuccessMessage(
        `New JIRA Component mapping created successfully!`,
        `Added new mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
    ));

    return { code: 0 };
}

export const createComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentMappingParams> = {
    name: "CreateComponentChannelMapping",
    description: "Create a mapping between a JIRA Component ID and a Chat channel",
    paramsMaker: JiraComponentMappingParams,
    listener: createComponentChannelMapping,
};

interface JiraProjectComponents {
    components: types.OnJiraIssueEvent.Components[];
}

export async function createComponentChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const lookupUrl = `${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`;
    const projectDetails = await getJiraDetails<JiraProjectComponents>(lookupUrl);
    const componentValues: SelectOption[] = [];

    projectDetails.components.forEach(c => {
       componentValues.push({text: c.name, value: c.id});
    });

    const menuSpec: MenuSpecification = {
        text: "Select Component",
        options: componentValues,
    };

    const message: SlackMessage = {
        attachments: [{
            pretext: `Create a new JIRA Component Mapping`,
            color: "#45B254",
            fallback: `Create a new project mapping`,
            ts: slackTs(),
            actions: [
                menuForCommand(menuSpec, "CreateComponentChannelMapping", "componentId", {
                    projectId: ci.parameters.projectId,
                }),
            ],
        }],
    };
    ci.addressChannels(message);

    return { code: 0 };
}

export const createComponentChannelMappingOptionsReg: CommandHandlerRegistration<JiraProjectMappingParams> = {
    name: "CreateComponentChannelOptionsMapping",
    description: "Create JIRA notifications for a component",
    paramsMaker: JiraProjectMappingParams,
    listener: createComponentChannelMappingOptions,
};

export const startComponentChannelMappingOptionsReg: CommandHandlerRegistration<JiraComponentMappingOptionsParams> = {
    name: "StartComponentChannelOptionsMapping",
    description: "Enable JIRA notifications for a component",
    intent: "create jira component mapping",
    paramsMaker: JiraComponentMappingOptionsParams,
    listener: createProjectChannelMappingOptions,
};
