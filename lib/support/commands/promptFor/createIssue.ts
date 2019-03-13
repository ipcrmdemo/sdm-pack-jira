import {configurationValue, HandlerResult, logger, MappedParameter, MappedParameters, Parameter, Parameters} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage} from "@atomist/sdm";
import * as jira2slack from "jira2slack";
import {JiraConfig} from "../../../jira";
import * as types from "../../../typings/types";
import {getJiraDetails} from "../../jiraDataLookup";
import * as jiraTypes from "../../jiraDefs";
import {convertEmailtoJiraUser, JiraProject} from "../../shared";
import {createJiraTicket} from "../createJiraTicket";
import {JiraHandlerParam} from "./shared";
import * as slack from "@atomist/slack-messages";

@Parameters()
class JiraProjectLookup extends JiraHandlerParam {
    @Parameter({
        displayName: `Search string`,
        description: "Please enter a search term to find your project",
    })
    public projectSearch: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;
}

export function createIssue(ci: CommandListenerInvocation<JiraProjectLookup>): Promise<HandlerResult> {
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

        // Now we have the project
        // Get Issue Types
        const availIssueTypes = await getJiraDetails<jiraTypes.Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true);
        const issueOptions: Option[] = [];
        availIssueTypes.issueTypes.forEach(t => {
            issueOptions.push({
                description: t.name,
                value: t.name,
            });
        });

        let issueType: { issueType: string };
        if (projectValues.length > 0) {
            issueType = await ci.promptFor<{ issueType: string }>({
                issueType: {
                    type: {
                        kind: "single",
                        options: issueOptions,
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

        // Is this a subtask?  great.  Get the parent
        let parentIssue: { parent: string };
        if (issueType.issueType === "Sub-task") {
            parentIssue = await ci.promptFor<{ parent: string }>({
                parent: {
                    description: "Enter the parent issue ID",
                },
            });
        }

        // Get description
        const details = await ci.promptFor<{ description: string, summary: string }>({
            summary: {
                description: "Please enter Issue Summary",
                pattern: /[\s\S]*/,
                order: 1,
            },
            description: {
                description: "Please enter Issue Description",
                pattern: /[\s\S]*/,
                order: 2,
            },
        });

        // We've got all the data, create issue
        let data: any;
        try {
            data = {
                description: jira2slack.toJira(details.description),
                project: {
                    id: project.project,
                },
                summary: details.summary,
                issuetype: {
                    name: issueType.issueType,
                },
            };

            // Add parent, if present
            if (parentIssue && parentIssue.parent) {
                data = {
                    ...data,
                    ...{
                        parent:
                            {
                                key: parentIssue.parent,
                            },
                    },
                };
            }

            // Lookup requester
            let realRequester: string;
            const requester = await ci.context.graphClient.query<types.GetEmailByChatId.Query, types.GetEmailByChatId.Variables>({
                name: "GetEmailByChatId",
                variables: { screenName: ci.parameters.screenName },
            });

            if ( requester &&
                requester.hasOwnProperty("ChatId") &&
                requester.ChatId.length > 0 &&
                requester.ChatId[0].person.emails.length > 0
            ) {
                // Try to find requester
                await Promise.all(requester.ChatId[0].person.emails.map(async e => {
                    const res = await convertEmailtoJiraUser(e.address);
                    if (res) {
                        realRequester = res;
                    }
                }));
            }

            if (realRequester) {
                data = {
                    ...data,
                    ...{
                        reporter: {
                            name: realRequester,
                        },
                    },
                };
            }
        } catch (e) {
            logger.error(e);
            await ci.addressChannels(
                slackErrorMessage(
                    `Error Creating JIRA Issue`,
                    `Failed to lookup JIRA requester data; error => ${e}`,
                    ci.context,
                ), {
                    ttl: 60 * 1000,
                    id: `createJiraIssue-${ci.parameters.screenName}`,
                });
            return { code: 1, message: e };
        }

        // Submit new issue
        try {
            const res = await createJiraTicket({fields: data});
            await ci.addressChannels(`Created new JIRA issue successfully! Link: ${slack.url(jiraConfig.url + `/browse/` + res.key, res.key)}`, {
                ttl: 60 * 1000,
                id: `createJiraIssue-${ci.parameters.screenName}`,
            });
            return {code: 0};
        } catch (e) {
            logger.error(e);
            await ci.addressChannels(
                slackErrorMessage(
                    `Error Creating JIRA Issue`,
                    `Failed to create JIRA issue; error => ${e}`,
                    ci.context,
                ), {
                    ttl: 60 * 1000,
                    id: `createJiraIssue-${ci.parameters.screenName}`,
                });
            return {
                code: 1,
                message: e,
            };
        }
    });
}

export const createIssueReg: CommandHandlerRegistration<JiraProjectLookup> = {
    name: "CreateIssue",
    paramsMaker: JiraProjectLookup,
    intent: "jira create issue prompt",
    listener: createIssue,
};
