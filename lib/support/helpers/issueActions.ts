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
import {CommandHandlerRegistration, CommandListenerInvocation, ParametersDefinition, slackErrorMessage} from "@atomist/sdm";
import {getJiraAuth, JiraConfig} from "../../jira";
import * as types from "../../typings/types";
import {createJiraResource} from "../commands/shared";
import {convertEmailtoJiraUser} from "../shared";

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
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const issueUrl = `${jiraConfig.url}/rest/api/2/issue/${cli.parameters.issueId}`;
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create(issueUrl);

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
    await httpClient.exchange(
        issueUrl,
        {
            method: HttpMethod.Put,
            headers: {
                "Content-Type": "application/json",
                ...await getJiraAuth(cli),
            },
            body: data,
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
    autoSubmit: true,
};

export async function setIssueStatusHandler(cli: CommandListenerInvocation<{transitionId: string, selfUrl: string}>): Promise<HandlerResult> {
    const data = {transition: {id: cli.parameters.transitionId}};
    await createJiraResource(cli.parameters.selfUrl, data, undefined, cli);
    return { code: 0};
}

const setIssueStatusParams: ParametersDefinition = {
    transitionId: {
        description: "Id of the transition to move this issue to",
        displayName: "Id of the transition to move this issue to",
        required: true,
    },
    selfUrl: {
        description: "API Self URL of the issue to update",
        displayName: "API Self URL of the issue to update",
        required: true,
    },
};

export const setIssueStatus: CommandHandlerRegistration<{transitionId: string, selfUrl: string}> = {
    name: "SetIssueStatus",
    parameters: setIssueStatusParams,
    listener: setIssueStatusHandler,
    autoSubmit: true,
};
