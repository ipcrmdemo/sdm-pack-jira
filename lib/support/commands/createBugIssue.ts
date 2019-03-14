import {configurationValue, HandlerResult, logger, MappedParameter, MappedParameters, Parameter, Parameters} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage} from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import * as jira2slack from "jira2slack";
import {JiraConfig} from "../../jira";
import * as types from "../../typings/types";
import {getMappedComponentsbyChannel, getMappedProjectsbyChannel} from "../helpers/channelLookup";
import {getJiraDetails} from "../jiraDataLookup";
import * as jiraTypes from "../jiraDefs";
import {convertEmailtoJiraUser} from "../shared";
import {findRequiredProjects, lookupJiraProjectDetails} from "./getCurrentChannelMappings";
import {createJiraTicket, JiraHandlerParam, prepProjectSelect} from "./shared";

@Parameters()
class JiraProjectLookup extends JiraHandlerParam {
    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;
}

export function createBugIssue(ci: CommandListenerInvocation<JiraProjectLookup>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

        // Get current channel projects
        const components = await getMappedComponentsbyChannel(ci.context, ci.parameters.slackChannelName);
        const projectsToLookup = await findRequiredProjects(components, []);
        const projects = await getMappedProjectsbyChannel(ci.context, ci.parameters.slackChannelName);
        const projectDetails = await lookupJiraProjectDetails([...projectsToLookup, ...projects]);
        const projectValues: Option[] = [];

        projectDetails.forEach(p => {
            projectValues.push({description: p.name, value: p.id});
        });

        if (projectValues.length === 0 ){
            await ci.addressChannels(
                slackErrorMessage(
                    `No projects or components are linked to this channel!`,
                    `Please link a project/component to this channel and try again`,
                    ci.context,
                ),
            );
            resolve({code: 1, message: `No linked channels!`});
        }

        let project: {project: string};
        if (projectValues.length > 1) {
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
            project = {project: projectValues[0].value};
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
                    name: "Bug",
                },
            };

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
                    `Error Creating JIRA Bug Issue`,
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
            const res = await createJiraTicket({fields: data});
            await ci.addressChannels(`Created new JIRA Bug issue successfully! Link: ${slack.url(jiraConfig.url + `/browse/` + res.key, res.key)}`, {
                ttl: 60 * 1000,
                id: `createJiraIssue-${ci.parameters.screenName}`,
            });
            resolve({code: 0});
        } catch (e) {
            logger.error(e);
            await ci.addressChannels(
                slackErrorMessage(
                    `Error Creating JIRA Bug Issue`,
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

export const createBugIssueReg: CommandHandlerRegistration<JiraProjectLookup> = {
    name: "CreateBugIssue",
    paramsMaker: JiraProjectLookup,
    intent: "jira file bug",
    listener: createBugIssue,
};
