import {
    configurationValue,
    HandlerResult,
    HttpClientFactory,
    HttpMethod,
    logger, MappedParameter, MappedParameters, menuForCommand, MenuSpecification,
    Parameter,
    Parameters, SelectOption,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    CommandListenerInvocation,
    slackErrorMessage,
    slackTs,
} from "@atomist/sdm";
import {SlackMessage} from "@atomist/slack-messages";
import jira2slack = require("jira2slack");
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import {getJiraDetails} from "../jiraDataLookup";
import * as jiraTypes from "../jiraDefs";
import {convertEmailtoJiraUser} from "../shared";

export interface JiraIssueCreated {
    id: string;
    key: string;
    self: string;
}

// Handler 1 takes this
//  - the produces a menuForCommand that has all the project detail
@Parameters()
export class CreateJiraTicketParamsBase {
    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @Parameter({
        displayName: `Please enter the summary for your issue`,
        description: `Summary`,
        order: 1,
    })
    public summary: string;
}

export async function h1createJiraTicket(cli: CommandListenerInvocation<CreateJiraTicketParamsBase>): Promise<HandlerResult> {
    try {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        const projects = await getJiraDetails<jiraTypes.Project[]>(`${jiraConfig.url}/rest/api/2/project`, true);

        const projectOptions: SelectOption[] = [];
        projects.forEach(p => {
            projectOptions.push({
                text: p.name,
                value: p.key,
            });
        });

        const menuSpec: MenuSpecification = {
            text: "Please select a Project",
            options: projectOptions,
        };

        const message: SlackMessage = {
            attachments: [
                {
                    fallback: undefined,
                    image_url: "https://www.atlassian.com/dam/jcr:e33efd9e-e0b8-4d61-a24d-68a48ef99ed5/Jira%20Software@2x-blue.png",
                },
                {
                author_icon: "https://www.atlassian.com/dam/jcr:e33efd9e-e0b8-4d61-a24d-68a48ef99ed5/Jira%20Software@2x-blue.png",
                pretext: `Please select which JIRA project this issue should be created in:`,
                color: "#45B254",
                fallback: `Please select which JIRA project this issue should be created in:`,
                ts: slackTs(),
                actions: [
                    menuForCommand(menuSpec, "H2CreateJiraTicket", "project", {
                        ...cli.parameters,
                    }),
                ],
            }],
        };
        await cli.addressChannels(message, {
            ttl: 60 * 120,
            id: `createJiraIssue-${cli.parameters.screenName}`,
        });

        return { code: 0 };
    } catch (e) {
        return{
            code: 1,
            message: e,
        };
    }

    return {code: 0};
}

export const h1createJiraTicketReg: CommandHandlerRegistration<CreateJiraTicketParamsBase> = {
    name: "H1CreateJiraTicket",
    description: "Start a new JIRA Issue: Set Summary",
    paramsMaker: CreateJiraTicketParamsBase,
    intent: "jira create issue",
    listener: h1createJiraTicket,
    autoSubmit: true,
};

// Handler 2 takes params from H1 + selected project
//  - raise menuForCommand for IssueType
@Parameters()
export class CreateJiraIssueParamsIssueType extends CreateJiraTicketParamsBase {
    @Parameter()
    public project: string;
}

export async function h2createJiraTicket(cli: CommandListenerInvocation<CreateJiraIssueParamsIssueType>): Promise<HandlerResult> {
    try {
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        const availIssueTypes = await getJiraDetails<jiraTypes.Project>(`${jiraConfig.url}/rest/api/2/project/${cli.parameters.project}`, true);
        const issueOptions: SelectOption[] = [];
        availIssueTypes.issueTypes.forEach(t => {
            if (t.name !== "Sub-task") {
                issueOptions.push({
                    text: t.name,
                    value: t.name,
                });
            }
        });

        const menuSpec: MenuSpecification = {
            text: "Please select an Issue Type",
            options: issueOptions,
        };

        const message: SlackMessage = {
            attachments: [
                {
                    fallback: undefined,
                    image_url: "https://www.atlassian.com/dam/jcr:e33efd9e-e0b8-4d61-a24d-68a48ef99ed5/Jira%20Software@2x-blue.png",
                },
                {
                pretext: `Please select a JIRA Issue Type`,
                color: "#45B254",
                fallback: `Please select a JIRA Issue Type`,
                ts: slackTs(),
                actions: [
                    menuForCommand(menuSpec, "H3CreateJiraTicket", "issueType", {
                        ...cli.parameters,
                    }),
                ],
            }],
        };
        await cli.addressChannels(message, {
            ttl: 60 * 120,
            id: `createJiraIssue-${cli.parameters.screenName}`,
        });

        return {code: 0};
    } catch (e) {
        return { code: 1, message: e };
    }

    return {code: 0};
}

export const h2createJiraTicketReg: CommandHandlerRegistration<CreateJiraIssueParamsIssueType> = {
    name: "H2CreateJiraTicket",
    description: "Create a new JIRA Issue",
    paramsMaker: CreateJiraIssueParamsIssueType,
    listener: h2createJiraTicket,
};

// Handler 3 takes params from H2 + issue type
//  - if issueType === sub-issue, run H4 for parent id, else run H5
//  - then create issue
@Parameters()
export class CreateJiraIssueParamsSubIssue extends CreateJiraIssueParamsIssueType {
    @Parameter()
    public issueType: string;

    @Parameter({
        description: "Please enter description for this issue:",
        pattern: /[\s\S]*/,
    })
    public description: string;
}

export async function h3createJiraTicket(cli: CommandListenerInvocation<CreateJiraIssueParamsSubIssue>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

    let data: any;
    try {
        data = {
            description: jira2slack.toJira(cli.parameters.description),
            project: {
                key: cli.parameters.project,
            },
            summary: cli.parameters.summary,
            issuetype: {
                name: cli.parameters.issueType,
            },
        };

        // Lookup requester
        let realRequester: string;
        const requester = await cli.context.graphClient.query<types.GetEmailByChatId.Query, types.GetEmailByChatId.Variables>({
            name: "GetEmailByChatId",
            variables: { screenName: cli.parameters.screenName },
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
        await cli.addressChannels(
            slackErrorMessage(
                `Error Creating JIRA Issue`,
                `Failed to lookup JIRA requester data; error => ${e}`,
                cli.context,
            ), {
                ttl: 60 * 1000,
                id: `createJiraIssue-${cli.parameters.screenName}`,
            });
        return { code: 1, message: e };
    }

    try {
        const res = await createJiraTicket({fields: data});
        await cli.addressChannels(`Created new JIRA issue successfully! Link: <${jiraConfig.url}/browse/${res.key}|${res.key}>`, {
            ttl: 60 * 1000,
            id: `createJiraIssue-${cli.parameters.screenName}`,
        });
        return {code: 0};
    } catch (e) {
        logger.error(e);
        await cli.addressChannels(
            slackErrorMessage(
                `Error Creating JIRA Issue`,
                `Failed to create JIRA issue; error => ${e}`,
                cli.context,
            ), {
            ttl: 60 * 1000,
            id: `createJiraIssue-${cli.parameters.screenName}`,
        });
        return {
            code: 1,
            message: e,
        };
    }

    return {code: 0};
}

export const h3createJiraTicketReg: CommandHandlerRegistration<CreateJiraIssueParamsSubIssue> = {
    name: "H3CreateJiraTicket",
    description: "Create a new JIRA Issue",
    paramsMaker: CreateJiraIssueParamsSubIssue,
    listener: h3createJiraTicket,
};

export const createJiraTicket = async (data: any): Promise<JiraIssueCreated> => {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const issueUrl = `${jiraConfig.url}/rest/api/2/issue`;

    logger.warn(`JIRA createJiraTicket: Data payload => ${JSON.stringify(data)}`);

    const result = await httpClient.exchange(
        issueUrl,
        {
            method: HttpMethod.Post,
            headers: {
                "Content-Type": "application/json",
            },
            body: data,
            options: {
                auth: {
                    username: jiraConfig.user,
                    password: jiraConfig.password,
                },
            },
        },
    ).catch(e => {
            logger.error(
                "JIRA createJiraTicket: Failed to create ticket with error - " +
                `(${JSON.stringify(e.response.status)}) ${JSON.stringify(e.response.data)}`,
            );
            throw new Error(JSON.stringify(e.response.data));
    });

    return result.body as JiraIssueCreated;
};
