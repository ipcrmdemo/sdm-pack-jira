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
import { JiraProject } from "../shared";
import { findRequiredProjects, lookupJiraProjectDetails } from "./getCurrentChannelMappings";
import {createProjectChannelMappingOptions, createProjectChannelMappingProjectInput, JiraProjectMappingParams} from "./mapProjectChannel";

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

    @Parameter({
        required: false,
        displayable: false,
    })
    public cmd: string = "CreateComponentChannelOptionsMapping";

    @Parameter({
        required: false,
        displayable: false,
        type: "boolean",
    })
    public enabled: boolean = true;

    @Parameter({
        displayName: `Search string`,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;
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

export function createComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentMappingParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
            const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
            const payload = {
                channel: ci.parameters.slackChannelName,
                projectId: ci.parameters.projectId,
                componentId: ci.parameters.componentId,
                active: true,
            };
            await ci.context.messageClient.send(payload, addressEvent("JiraComponentMap"));
            const componentDetails =
                await getJiraDetails<types.OnJiraIssueEvent.Components>(`${jiraConfig.url}/rest/api/2/component/${ci.parameters.componentId}`, true);
            await ci.addressChannels(slackSuccessMessage(
                `New JIRA Component mapping created successfully!`,
                `Added new mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
            ), {
                ttl: 15000,
                id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
            });

            resolve({code: 0});
        } catch (e) {
            logger.error(`JIRA createComponentChannelMapping: Failed to create channel mapping! Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const createComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentMappingParams> = {
    name: "CreateComponentChannelMapping",
    description: "Create a mapping between a JIRA Component ID and a Chat channel",
    paramsMaker: JiraComponentMappingParams,
    listener: createComponentChannelMapping,
};

export function createComponentChannelMappingOptions(ci: CommandListenerInvocation<JiraProjectMappingParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
            const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
            const lookupUrl = `${jiraConfig.url}/rest/api/2/project/${ci.parameters.projectId}`;
            const projectDetails = await getJiraDetails<JiraProject>(lookupUrl, true);
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
                await ci.addressChannels(message, {
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

                await ci.addressChannels(message, {
                    ttl: 15000,
                    id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
                });
            }
            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA createComponentChannelMappingOptions: Failed to create channel map options.  Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
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
    listener: createProjectChannelMappingProjectInput,
};

export function removeComponentChannelMapping(ci: CommandListenerInvocation<JiraComponentDisableMappingParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
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
            await ci.addressChannels(slackSuccessMessage(
                `Removed JIRA Component mapping successfully!`,
                `Removed mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
            ));

            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA removeComponentChannelMapping: Error removing component mapping => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const removeComponentChannelMappingReg: CommandHandlerRegistration<JiraComponentDisableMappingParams> = {
    name: "RemoveComponentChannelMapping",
    description: "Remove JIRA notifications for a component",
    paramsMaker: JiraComponentDisableMappingParams,
    listener: removeComponentChannelMapping,
};

export function removeComponentMapping(ci: CommandListenerInvocation<JiraComponentDisableMappingOptionsParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
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

            await ci.addressChannels(message);
            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA removeComponentMapping: Failed to remove component mapping.  Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const disableComponentChannelMappingOptionsReg: CommandHandlerRegistration<JiraComponentDisableMappingOptionsParams> = {
    name: "DisableComponentChannelMapping",
    description: "Disable JIRA notifications for a component",
    intent: "jira disable component map",
    paramsMaker: JiraComponentDisableMappingOptionsParams,
    listener: removeComponentMapping,
};
