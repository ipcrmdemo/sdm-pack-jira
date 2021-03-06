import {configurationValue, HandlerResult, logger} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage} from "@atomist/sdm";
import {JiraConfig} from "../../jira";
import {getMappedProjectsbyChannel} from "../helpers/channelLookup";
import {getJiraDetails} from "../jiraDataLookup";
import {Project} from "../jiraDefs";
import {lookupJiraProjectDetails} from "./getCurrentChannelMappings";
import {JiraHandlerParam, submitMappingPayload} from "./shared";

export function removeProjectMapFromChannel(ci: CommandListenerInvocation<JiraHandlerParam>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

        // Get current channel projects
        const projects = await getMappedProjectsbyChannel(ci.context, ci.parameters.slackChannelName);
        const projectDetails = await lookupJiraProjectDetails(projects, ci);

        const projectValues: Option[] = [];

        projectDetails.forEach(p => {
            projectValues.push({description: p.name, value: p.id});
        });

        const project = await ci.promptFor<{ project: string }>({
            project: {
                displayName: `Please select a project`,
                description: `Please select a project`,
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
                },
                false,
            );

            const projectDetail =
                await getJiraDetails<Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true, undefined, ci);
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

        resolve({code: 0});
    });
}

export const removeProjectMapFromChannelReg: CommandHandlerRegistration<JiraHandlerParam> = {
    name: "removeProjectMapFromChannel",
    paramsMaker: JiraHandlerParam,
    intent: "jira disable project map",
    listener: removeProjectMapFromChannel,
    autoSubmit: true,
};
