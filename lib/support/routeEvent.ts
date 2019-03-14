import { HandlerContext, logger } from "@atomist/automation-client";
import * as types from "../typings/types";
import {jiraDetermineNotifyChannels, jiraParseChannels} from "./helpers/channelLookup";
import { issueCommented, issueCreated, issueDeleted, issueStateChange } from "./issueHandlers";

// tslint:disable-next-line:cyclomatic-complexity
export const routeEvent = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    if (
        (event.webhookEvent === "jira:issue_updated" && event.issue_event_type_name.match(/^(issue_comment_edited|issue_commented)$/)) ||
        (event.webhookEvent === "jira:issue_updated" && event.issue_event_type_name.match(/^(issue_updated)$/) && event.changelog === null) ||
        (event.webhookEvent === "jira:issue_updated" &&
            event.issue_event_type_name.match(/^(issue_updated)$/) &&
            event.changelog !== null &&
           event.hasOwnProperty("comment")
        )
    ) {
        logger.info(`JIRA routeEvent: New issue comment detected`);
        const channels = await jiraDetermineNotifyChannels(ctx, event);
        const notifyChannels = await jiraParseChannels(channels, event, `issueComment`);
        await issueCommented(ctx, notifyChannels.map(c => c.channel), event);
    }

    if (event.webhookEvent === "jira:issue_updated" &&
        event.issue_event_type_name.match(/^(issue_generic|issue_updated|issue_assigned)$/) &&
        event.changelog !== null && event.comment === null
       ) {
        logger.info(`JIRA routeEvent: New Issue state change detected`);
        let notifyChannels: types.GetJiraChannelPrefs.JiraChannelPrefs[];

        switch (event.issue_event_type_name) {
            // Transitions
            case("issue_generic"): {
                const channels = await jiraDetermineNotifyChannels(ctx, event);
                notifyChannels = await jiraParseChannels(channels, event, `issueStatus`);
                break;
            }
            // Other Issue definition changes
            case("issue_assigned"):
            case("issue_updated"): {
                const channels = await jiraDetermineNotifyChannels(ctx, event);
                notifyChannels = await jiraParseChannels(channels, event, `issueState`);
                break;
            }
        }
        await issueStateChange(ctx, notifyChannels.map(c => c.channel), event);
    }

    if (event.webhookEvent === "jira:issue_created" && event.issue_event_type_name === "issue_created") {
        logger.info(`JIRA routeEvent: New Issue was created`);
        const channels = await jiraDetermineNotifyChannels(ctx, event);
        const notifyChannels = await jiraParseChannels(channels, event, `issueCreated`);
        await issueCreated(ctx, notifyChannels.map(c => c.channel), event);
    }

    if (event.webhookEvent === "jira:issue_deleted") {
        logger.info(`JIRA routeEvent: Issue was deleted`);
        const channels = await jiraDetermineNotifyChannels(ctx, event);
        const notifyChannels = channels.filter(c => c.issueDeleted === true);
        await issueDeleted(ctx, notifyChannels.map(c => c.channel), event);
    }

};
