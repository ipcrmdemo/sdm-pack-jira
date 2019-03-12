import {configurationValue, HandlerResult, logger, Parameter, Parameters, SelectOption} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage, slackSuccessMessage} from "@atomist/sdm";
import * as objectHash from "object-hash";
import {JiraConfig} from "../../../jira";
import * as types from "../../../typings/types";
import {getJiraDetails} from "../../jiraDataLookup";
import {JiraProject} from "../../shared";
import {JiraHandlerParam, submitMappingPayload} from "./shared";

@Parameters()
class MapComponentToChannelParams extends JiraHandlerParam {
    @Parameter({
        displayName: `Search string`,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;
}

export function mapComponentToChannel(ci: CommandListenerInvocation<MapComponentToChannelParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        if (ci.parameters.slackChannel === ci.parameters.slackChannelName) {
            await ci.addressChannels(slackErrorMessage(
                `Cannot Setup Mapping to Individual Account`,
                `You cannot setup a jira mapping to your own user, must setup mappings to channels only.`,
                ci.context,
            ));
            resolve({code: 0});
        }

        // Get Search pattern for project lookup
        const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

        // Find projects that match project search string
        const projectValues: Option[] = [];
        const result = await getJiraDetails<JiraProject[]>(lookupUrl, true);

        result.forEach(p => {
            if (p.name.toLowerCase().includes(ci.parameters.projectSearch.toLowerCase())) {
                logger.debug(`JIRA mapComponentToChannel: Found project match ${p.name}!`);
                projectValues.push({description: p.name, value: p.id});
            }
        });

        // Present list of projects
        let project: { project: string };
        if (projectValues.length > 0) {
            project = await ci.promptFor<{ project: string }>({
                project: {
                    type: {
                        kind: "single",
                        options: projectValues,
                    },
                },
            });
        } else {
            await ci.addressChannels(slackErrorMessage(
                `Error: No projects found with search term [${ci.parameters.projectSearch}]`,
                `Please try this command again`,
                ci.context,
            ));
            resolve({code: 0});
        }

        const componentLookupUrl = `${jiraConfig.url}/rest/api/2/project/${project.project}`;
        const projectDetails = await getJiraDetails<JiraProject>(componentLookupUrl, false);
        const componentValues: Option[] = [];

        projectDetails.components.forEach(c => {
            componentValues.push({description: c.name, value: c.id});
        });

        let component: {component: string};
        if (componentValues.length > 0) {
           component = await ci.promptFor<{component: string}>({
               component: {
                   type: {
                       kind: "single",
                       options: componentValues,
                   },
               },
           });
        } else {
            await ci.addressChannels(slackErrorMessage(
                `Error: No components found within project [${project.project}]`,
                `Please try this command again with a different project`,
                ci.context,
            ));
            resolve({code: 0});
        }

        try {
            await submitMappingPayload(
                ci,
               {
                    channel: ci.parameters.slackChannelName,
                    projectId: project.project,
                    componentId: component.component,
                    active: true,
                },
               "JiraComponentMap",
               `${ci.context.workspaceId}-GetAllComponentMappingsforChannel-${objectHash({channel: [ci.parameters.slackChannelName]})}`,
            );

            const componentDetails =
                await getJiraDetails<types.OnJiraIssueEvent.Components>(`${jiraConfig.url}/rest/api/2/component/${component.component}`, true);

            await ci.addressChannels(slackSuccessMessage(
                `New JIRA Component mapping created successfully!`,
                `Added new mapping from Component *${componentDetails.name}* to *${ci.parameters.slackChannelName}*`,
            ), {
                ttl: 15000,
                id: `component_or_project_mapping-${ci.parameters.slackChannelName}`,
            });

            resolve({code: 0});
        } catch (e) {
            logger.error(`JIRA mapComponentToChannel: Failed to create channel mapping! Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const mapComponentToChannelReg: CommandHandlerRegistration<MapComponentToChannelParams> = {
    name: "mapComponentToChannel",
    paramsMaker: MapComponentToChannelParams,
    intent: "jira map component prompt",
    listener: mapComponentToChannel,
};
