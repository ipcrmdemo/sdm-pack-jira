import {configurationValue, HandlerResult, logger} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage} from "@atomist/sdm";
import * as objectHash from "object-hash";
import {JiraConfig} from "../../jira";
import {getMappedComponentsbyChannel} from "../helpers/channelLookup";
import {getJiraDetails} from "../jiraDataLookup";
import {Component} from "../jiraDefs";
import {findRequiredProjects, lookupJiraProjectDetails} from "./getCurrentChannelMappings";
import {buildJiraHashKey, JiraHandlerParam, submitMappingPayload} from "./shared";

export function removeComponentMapFromChannel(ci: CommandListenerInvocation<JiraHandlerParam>): Promise<HandlerResult> {
    return new Promise(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        // Get linked component ids, project ids
        // Resolve ids to names
        // Present dropdown of components to remove
        // Remove and notify
        const components = await getMappedComponentsbyChannel(ci.context, ci.parameters.slackChannelName);
        logger.debug(`JIRA removeComponentMapFromChannel: components found for channel => ${JSON.stringify(components)}`);

        const projectsToLookup = await findRequiredProjects(components, []);
        const projectDetails = await lookupJiraProjectDetails(projectsToLookup, ci);

        const componentDetails: Option[] = [];

        components.forEach(c => {
            try {
                const thisProject = projectDetails.filter(p => p.id === c.projectId)[0];
                const thisComponent = thisProject.components.filter(comp => comp.id === c.componentId)[0];
                const display = `${thisProject.name}/${thisComponent.name}`;
                componentDetails.push({description: display, value: `${c.projectId}:${c.componentId}`});
            } catch {
                // You can end up here if a previously mapped project or component no longer exists
                logger.warn(`JIRA removeComponentMapFromChannel: Failed to find details for project ${c.projectId} and component ${c.componentId}`);
                return;
            }
        });

        const component = await ci.promptFor<{component: string}>({
               component: {
                   description: "Please select a component mapping to remove",
                   displayName: "Please select a component mapping to remove",
                   type: {
                       kind: "single",
                       options: componentDetails,
                   },
               },
        });

        try {
            await submitMappingPayload(
                ci,
                {
                    channel: ci.parameters.slackChannelName,
                    projectId: component.component.split(":")[0],
                    componentId: component.component.split(":")[1],
                },
                false,
            );

            const compInfo =
                await getJiraDetails<Component>(
                    `${jiraConfig.url}/rest/api/2/component/${component.component.split(":")[1]}`, undefined, undefined, ci);

            await ci.addressChannels(slackSuccessMessage(
                `Removed JIRA Component mapping successfully!`,
                `Removed mapping from Component *${compInfo.name}* to *${ci.parameters.slackChannelName}*`,
            ));

            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA removeComponentMapFromChannel: Error removing component mapping => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }

        resolve({code: 0});
    });
}

export const removeComponentMapFromChannelReg: CommandHandlerRegistration<JiraHandlerParam> = {
    name: "removeComponentMapFromChannel",
    paramsMaker: JiraHandlerParam,
    intent: "jira disable component map",
    listener: removeComponentMapFromChannel,
    autoSubmit: true,
};
