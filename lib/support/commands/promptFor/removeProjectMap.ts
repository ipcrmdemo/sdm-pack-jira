import {configurationValue, HandlerResult, logger} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage} from "@atomist/sdm";
import objectHash = require("object-hash");
import {JiraConfig} from "../../../jira";
import * as types from "../../../typings/types";
import {getMappedProjectsbyChannel} from "../../helpers/channelLookup";
import {getJiraDetails} from "../../jiraDataLookup";
import {lookupJiraProjectDetails} from "../getCurrentChannelMappings";
import {JiraHandlerParam, submitMappingPayload} from "./shared";

export function removeProjectMapFromChannel(ci: CommandListenerInvocation<JiraHandlerParam>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

        // Get current channel projects
        const projects = await getMappedProjectsbyChannel(ci.context, ci.parameters.slackChannelName);
        const projectDetails = await lookupJiraProjectDetails(projects);

        const projectValues: Option[] = [];

        projectDetails.forEach(p => {
            projectValues.push({description: p.name, value: p.id});
        });

        const project = await ci.promptFor<{ project: string }>({
            project: {
                type: {
                    kind: "single",
                    options: projectValues,
                },
            },
        });

        try {
            await submitMappingPayload(
                ci,
                {
                    channel: ci.parameters.slackChannelName,
                    projectId: project.project,
                    active: false,
                },
                "JiraProjectMap",
                `${ci.context.workspaceId}-GetAllProjectMappingsforChannel-${objectHash({channel: [ci.parameters.slackChannelName]})}`,
            );

            const projectDetail =
                await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true);
            const subject = `JIRA Project mapping removed successfully!`;
            const message = `Removed mapping from Project *${projectDetail.name}* to *${ci.parameters.slackChannelName}*`;

            await ci.addressChannels(slackSuccessMessage(
                subject,
                message,
            ));

            resolve({ code: 0 });
        } catch (error) {
            logger.error(`JIRA removeProjectMapFromChannel: Error completing command => ${error}`);
            reject({
                code: 1,
                message: error,
            });
        }
    });
}

export const removeProjectMapFromChannelReg: CommandHandlerRegistration<JiraHandlerParam> = {
    name: "removeProjectMapFromChannel",
    paramsMaker: JiraHandlerParam,
    intent: "jira disable project map prompt",
    listener: removeProjectMapFromChannel,
};
