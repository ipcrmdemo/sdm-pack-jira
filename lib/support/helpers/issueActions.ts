import {
    configurationValue,
    HandlerResult,
    HttpClientFactory,
    HttpMethod,
    logger, MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import {CommandHandlerRegistration, CommandListenerInvocation, slackErrorMessage} from "@atomist/sdm";
import {JiraConfig} from "../../jira";
import * as types from "../../typings/types";
import {convertEmailtoJiraUser} from "../commands/shared";

@Parameters()
export class CommentOnIssueParams {
    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @Parameter({
        displayable: false,
    })
    public issueId: string;

    @Parameter()
    public comment: string;
}

export async function commentOnIssueHandler(cli: CommandListenerInvocation<CommentOnIssueParams>): Promise<HandlerResult> {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const issueUrl = `${jiraConfig.url}/rest/api/2/issue/${cli.parameters.issueId}`;

    logger.debug(`JIRA commentOnIssueHandler: Issue ID ${cli.parameters.issueId} Data payload => ${JSON.stringify(cli.parameters.comment)}`);

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

    let data: any;
    if (realRequester) {
        data = {
            update: {
                comment: [{
                    add: {
                        body: cli.parameters.comment,
                        author: {
                            name: realRequester,
                        },
                    },
                }],
            },
        };
    } else {
        data = {
            update: {
                comment: [{
                    add: {
                        body: cli.parameters.comment,
                    },
                }],
            },
        };
    }

    logger.debug(`JIRA commentOnIssueHandler: Data payload => ${JSON.stringify(data)}`);
    const result = await httpClient.exchange(
        issueUrl,
        {
            method: HttpMethod.Put,
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
    ).catch(async e => {
        await cli.addressChannels(slackErrorMessage(
           `Failed to create JIRA Issue Comment` ,
            "JIRA commentOnIssueHandler: Failed to issue comment with error - " +
            `(${JSON.stringify(e.response.status)}) ${JSON.stringify(e.response.data)}`,
            cli.context,
        ));
        return { code: 1, message: JSON.stringify(e.response.data)};
    });

    return {code: 0};
}

export const commentOnIssue: CommandHandlerRegistration<CommentOnIssueParams> = {
    name: "JiraCommentOnIssue",
    paramsMaker: CommentOnIssueParams,
    listener: commentOnIssueHandler,
};
