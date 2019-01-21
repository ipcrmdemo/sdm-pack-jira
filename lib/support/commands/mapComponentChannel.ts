import {
  addressEvent,
  buttonForCommand,
  configurationValue,
  HandlerResult,
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
import { getMappedComponentsbyChannel, JiraProjectComponentMap } from "../helpers/channelLookup";
import { getJiraDetails } from "../jiraDataLookup";
import { findRequiredProjects, lookupJiraProjectDetails } from "./getCurrentChannelMappings";
import { createProjectChannelMappingOptions, JiraProjectMappingParams } from "./mapProjectChannel";
import { JiraProject } from "./shared";

@Parameters()
export class JiraComponentMappingParams {
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
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @Parameter()
    public cmd: string = "CreateComponentChannelOptionsMapping";

    @Parameter({
        required: false,
        displayable: false,
        type: "boolean",
    })
    public enabled: boolean = true;
}

@Parameters()
class JiraComponentDisableMappingOptionsParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;
}

@Parameters()
export class JiraComponentDisableMappingParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @Parameter({
        displayable: false,
        type: "string",
        required: false,
    })
    public details: string;
}

export async function createComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const payload = {
        channel: ci.parameters.slackChannelName,
        projectId: ci.parameters.projectId,
        componentId: ci.parameters.componentId,
        active: true,
    };
    await ci.context.messageClient.send(payload, addressEvent("JiraComponentMap"));
    const componentDetails =
        await getJiraDetails<types.OnJiraIssueEvent.Components>(`${jiraConfig.url}/rest/api/2/component/${ci.parameters.componentId}`);
    ci.addressChannels(slackSuccessMessage(
        `New JIRA Component mapping created successfully!`,
        `Added new mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
    ), {
        ttl: 15000,
        id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
    });

    return { code: 0 };
}

export const createComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentMappingParams> = {
    name: "CreateComponentChannelMapping",
    description: "Create a mapping between a JIRA Component ID and a Chat channel",
    paramsMaker: JiraComponentMappingParams,
    listener: createComponentChannelMapping,
};

export async function createComponentChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const lookupUrl = `${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`;
    const projectDetails = await getJiraDetails<JiraProject>(lookupUrl);
    const componentValues: SelectOption[] = [];

    projectDetails.components.forEach(c => {
       componentValues.push({text: c.name, value: c.id});
    });

    const menuSpec: MenuSpecification = {
        text: "Select Component",
        options: componentValues,
    };

    if (componentValues.length > 0) {
        const message: SlackMessage = {
            attachments: [{
                pretext: `Create a new JIRA Component Mapping`,
                color: "#45B254",
                fallback: `Create a new Jira Component mapping`,
                ts: slackTs(),
                actions: [
                    menuForCommand(menuSpec, "CreateComponentChannelMapping", "componentId", {
                        projectId: ci.parameters.projectId,
                    }),
                ],
            }],
        };
        ci.addressChannels(message, {
            ttl: 15000,
            id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
        });
    } else {
        const button = buttonForCommand(
            {
                text: "OK",
            },
            "StartComponentChannelOptionsMapping",
        );

        const message: SlackMessage = {
            attachments: [
                {
                    fallback: `JIRA Project Contains no components`,
                    pretext: `JIRA Project Contains no components`,
                    actions: [button],
                },
            ],
        };

        ci.addressChannels(message, {
            ttl: 15000,
            id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
        });
    }

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
    intent: "jira map component",
    paramsMaker: JiraComponentMappingOptionsParams,
    listener: createProjectChannelMappingOptions,
};

export async function removeComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentDisableMappingParams>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const paramDetails: JiraProjectComponentMap = {
        projectId: ci.parameters.details.split(":")[0],
        componentId: ci.parameters.details.split(":")[1],
    };

    const payload = {
        channel: ci.parameters.slackChannelName,
        componentId: paramDetails.componentId,
        projectId: paramDetails.projectId,
        active: false,
    };

    await ci.context.messageClient.send(payload, addressEvent("JiraComponentMap"));
    const componentDetails =
        await getJiraDetails<types.OnJiraIssueEvent.Components>(`${jiraConfig.url}/rest/api/2/component/${paramDetails.componentId}`);
    ci.addressChannels(slackSuccessMessage(
        `Removed JIRA Component mapping successfully!`,
        `Removed mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
    ));

    return { code: 0 };
}

export const removeComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentDisableMappingParams> = {
    name: "RemoveComponentChannelMapping",
    description: "Remove JIRA notifications for a component",
    paramsMaker: JiraComponentDisableMappingParams,
    listener: removeComponentChannelMapping,
};

export async function removeComponentMapping(ci: CommandListenerInvocation<JiraComponentDisableMappingOptionsParams>): Promise<HandlerResult> {
    // Get linked componentids/projectids
    // Resolve ids to names
    // Present dropdown of componetns to remove
    // Remove and notify
    const components = await getMappedComponentsbyChannel(ci.context, ci.parameters.slackChannelName);
    logger.debug(`JIRA removeComponentMapping: components found for channel => ${JSON.stringify(components)}`);

    const projectsToLookup = await findRequiredProjects(components, []);
    const projectDetails = await lookupJiraProjectDetails(projectsToLookup);

    const componentDetails: SelectOption[] = [];

    components.forEach(c => {
        const thisProject = projectDetails.filter(p => p.id === c.projectId)[0];
        const thisComponent = thisProject.components.filter(component => component.id === c.componentId)[0];
        const display = `${thisProject.name}/${thisComponent.name}`;
        componentDetails.push({text: display, value: `${c.projectId}:${c.componentId}` });
     });

    const menuSpec: MenuSpecification = {
        text: "Select Component",
        options: componentDetails,
    };

    const message: SlackMessage = {
        attachments: [{
            pretext: `Remove a JIRA Project/Component Mapping`,
            color: "#45B254",
            fallback: `Remove a Jira Project/Component mapping`,
            ts: slackTs(),
            actions: [
                menuForCommand(menuSpec, "RemoveComponentChannelMapping", "details"),
            ],
        }],
    };

    ci.addressChannels(message);
    return { code: 0 };
}

export const disableComponentChannelMappingOptionsReg: CommandHandlerRegistration<JiraComponentDisableMappingOptionsParams> = {
    name: "DisableComponentChannelMapping",
    description: "Disable JIRA notifications for a component",
    intent: "jira disable component map",
    paramsMaker: JiraComponentDisableMappingOptionsParams,
    listener: removeComponentMapping,
};
