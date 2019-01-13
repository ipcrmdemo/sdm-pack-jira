import { HandlerContext, logger, MessageOptions } from "@atomist/automation-client";
import { SlackMessage } from "@atomist/slack-messages";
import * as types from "../typings/types";
import { jiraChannelLookup } from "./helpers/channelLookup";
import { prepareIssueCommentedMessage, prepareIssueDeletedMessage, prepareNewIssueMessage, prepareStateChangeMessage } from "./helpers/msgHelpers";

export const issueCommented = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    const channels = await jiraChannelLookup(ctx, event);
    if (channels.length > 0) {
        const message: SlackMessage = await prepareIssueCommentedMessage(event);
        await ctx.messageClient.addressChannels(message, channels);
    } else {
        logger.debug(`JIRA issueCommented: No associated repos to this issue.  Ignorning event.`);
    }
};

export const issueStateChange = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    const channels = await jiraChannelLookup(ctx, event);
    if (channels.length > 0) {
        const message: SlackMessage = await prepareStateChangeMessage(event);
        await ctx.messageClient.addressChannels(message, channels);
    } else {
        logger.debug(`JIRA issueStateChange: No associated repos to this issue.  Ignorning event.`);
    }
};

export const issueCreated = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    const channels = await jiraChannelLookup(ctx, event);
    if (channels.length > 0) {
        const message: SlackMessage = await prepareNewIssueMessage(event);
        await ctx.messageClient.addressChannels(message, channels);
    } else {
        logger.debug(`JIRA issueCreated: No channels to notify.  Ignorning event.`);
    }
};

export const issueDeleted = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    const channels = await jiraChannelLookup(ctx, event);
    if (channels.length > 0) {
        const message: SlackMessage = await prepareIssueDeletedMessage(event);
        await ctx.messageClient.addressChannels(message, channels);
    } else {
        logger.debug(`JIRA issueDeleted: No channels to notify.  Ignorning event.`);
    }
};
