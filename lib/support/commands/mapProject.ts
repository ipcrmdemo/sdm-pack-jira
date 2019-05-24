import {configurationValue, HandlerResult, logger, Parameter, Parameters} from "@atomist/automation-client";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage, slackSuccessMessage} from "@atomist/sdm";
import objectHash = require("object-hash");
import {JiraConfig} from "../../jira";
import {getJiraDetails} from "../jiraDataLookup";
import {Project} from "../jiraDefs";
import {JiraHandlerParam, prepProjectSelect, submitMappingPayload} from "./shared";

@Parameters()
class MapProjectToChannelParams extends JiraHandlerParam {
    @Parameter({
        displayName: "Please enter a search term to find your project",
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;
}

function mapProjectToChannel(ci: CommandListenerInvocation<MapProjectToChannelParams>): Promise<HandlerResult> {
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

        // Present list of projects
        let project: { project: string };
        const projectValues = await prepProjectSelect(ci.parameters.projectSearch, ci);
        if (projectValues) {
             project = await ci.promptFor<{ project: string }>({
                project: {
                    displayName: `Please select a project`,
                    description: `Please select a project`,
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

        try {
            await submitMappingPayload(
                ci,
                {
                    channel: ci.parameters.slackChannelName,
                    projectId: project.project,
                    active: true,
                },
                "JiraProjectMap",
                `${ci.context.workspaceId}-GetAllProjectMappingsforChannel-${objectHash({channel: [ci.parameters.slackChannelName]})}`,
            );

            const projectDetails =
                await getJiraDetails<Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true, undefined, ci);
            const subject = `New JIRA Project mapping created successfully!`;
            const message = `Added new mapping from Project *${projectDetails.name}* to *${ci.parameters.slackChannelName}*`;

            await ci.addressChannels(slackSuccessMessage(
                subject,
                message,
            ));

            resolve({ code: 0 });
        } catch (error) {
            logger.error(`JIRA mapProjectToChannel: Error completing command => ${error}`);
            reject({
                code: 1,
                message: error,
            });
        }

        resolve({code: 0});
    });
}

export const mapProjectToChannelReg: CommandHandlerRegistration<MapProjectToChannelParams> = {
    name: "MapProjectToChannelPrompt",
    paramsMaker: MapProjectToChannelParams,
    intent: "jira map project",
    listener: mapProjectToChannel,
    autoSubmit: true,
};
