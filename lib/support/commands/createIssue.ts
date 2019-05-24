import {configurationValue, HandlerResult, logger, MappedParameter, MappedParameters, Parameter, Parameters} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage} from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import * as jira2slack from "jira2slack";
import {JiraConfig} from "../../jira";
import * as types from "../../typings/types";
import {getJiraDetails} from "../jiraDataLookup";
import * as jiraTypes from "../jiraDefs";
import {convertEmailtoJiraUser} from "../shared";
import {createJiraTicket, JiraHandlerParam, prepProjectSelect} from "./shared";

@Parameters()
class JiraProjectLookup extends JiraHandlerParam {
    @Parameter({
        displayName: `Please enter a search term to find your project`,
        description: `Please enter a search term to find your project`,
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

        // Now we have the project
        // Get Issue Types
        const availIssueTypes =
            await getJiraDetails<jiraTypes.Project>(`${jiraConfig.url}/rest/api/2/project/${project.project}`, true, undefined, ci);
        const issueOptions: Option[] = [];
        availIssueTypes.issueTypes.forEach(t => {
            issueOptions.push({
                description: t.name,
                value: t.name,
            });
        });

        const issueType = await ci.promptFor<{ issueType: string }>({
            issueType: {
                displayName: `Please select an issue type`,
                description: `Please select an issue type`,
                type: {
                    kind: "single",
                    options: issueOptions,
                },
            },
        });

        // Is this a subtask?  great.  Get the parent
        let parentIssue: { parent: string };
        if (issueType.issueType === "Sub-task") {
            parentIssue = await ci.promptFor<{ parent: string }>({
                parent: {
                    description: "Enter the parent issue ID",
                    displayName: "Enter the parent issue ID",
                },
            });
        }

        // Get description
        const details = await ci.promptFor<{ description: string, summary: string }>({
            summary: {
                description: "Please enter Issue Summary",
                displayName: "Please enter Issue Summary",
                pattern: /[\s\S]*/,
                order: 1,
            },
            description: {
                description: "Please enter Issue Description",
                displayName: "Please enter Issue Description",
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
            reject({ code: 1, message: e });
        }

        // Submit new issue
        try {
            const res = await createJiraTicket({fields: data}, ci);
            await ci.addressChannels(`Created new JIRA issue successfully! Link: ${slack.url(jiraConfig.url + `/browse/` + res.key, res.key)}`, {
                ttl: 60 * 1000,
                id: `createJiraIssue-${ci.parameters.screenName}`,
            });
            resolve({code: 0});
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
            resolve({
                code: 1,
                message: e,
            });
        }

        resolve({code: 0});
    });
}

export const createIssueReg: CommandHandlerRegistration<JiraProjectLookup> = {
    name: "CreateIssue",
    paramsMaker: JiraProjectLookup,
    intent: "jira create issue",
    listener: createIssue,
};
