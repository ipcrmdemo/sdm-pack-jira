import {configurationValue, HandlerResult, logger, Parameter, Parameters} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage, slackSuccessMessage} from "@atomist/sdm";
import objectHash = require("object-hash");
import {JiraConfig} from "../../../jira";
import * as types from "../../../typings/types";
import {purgeCacheEntry} from "../../cache/manage";
import {getJiraDetails} from "../../jiraDataLookup";
import {JiraProject} from "../../shared";
import {JiraHandlerParam, submitMappingPayload} from "./shared";

@Parameters()
class MapProjectToChannelParams extends JiraHandlerParam {
    @Parameter({
        displayName: `Search string`,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;
}

export function mapProjectToChannel(ci: CommandListenerInvocation<MapProjectToChannelParams>): Promise<HandlerResult> {
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
                logger.debug(`JIRA mapProjectToChannel: Found project match ${p.name}!`);
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

        try {
            const payload = {
                channel: ci.parameters.slackChannelName,
                projectId: project.project,
                active: true,
            };
            await submitMappingPayload(ci, payload);
            await purgeCacheEntry(
                `${ci.context.workspaceId}-GetAllProjectMappingsforChannel-${objectHash({channel: [ci.parameters.slackChannelName]})}`);

            const projectDetails =
                await getJiraDetails<types.OnJiraIssueEvent.Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true);
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
    name: "MapProjectToChannel",
    paramsMaker: MapProjectToChannelParams,
    intent: "jira map project prompt",
    listener: mapProjectToChannel,
};
