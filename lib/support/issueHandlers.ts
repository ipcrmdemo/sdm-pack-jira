import { HandlerContext, logger } from "@atomist/automation-client";
import { SlackMessage } from "@atomist/slack-messages";
import * as types from "../typings/types";
import { findChannelsByRepos } from "./channelLookups";
import { prepareIssueCommentedMessage } from "./helpers/msgHelpers";
import { getJiraIssueRepos } from "./jiraDataLookup";

export const issueCommented = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    const repos = await getJiraIssueRepos(event.issue.id);

    if (repos) {
        const channels = await findChannelsByRepos(ctx, repos);
        const message: SlackMessage = await prepareIssueCommentedMessage(event);

        await ctx.messageClient.addressChannels(message, channels);
    } else {
        logger.debug(`JIRA issueCommented: No associated repos to this issue.  Ignorning event.`);
    }
};

export const issueStateChange = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    // do stuff
};

export const issueCreated = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    // do stuff
};

export const issueDeleted = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    // do stuff
};
