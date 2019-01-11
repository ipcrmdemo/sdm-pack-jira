import { HandlerContext, logger } from "@atomist/automation-client";
import * as types from "../typings/types";
import { issueCommented, issueCreated, issueDeleted, issueStateChange } from "./issueHandlers";

export const routeEvent = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    if (event.webhookEvent === "jira:issue_updated" && event.issue_event_type_name.match(/^(issue_comment_edited|issue_commented)$/)) {
        logger.info(`JIRA routeEvent: New issue comment detected`);
        issueCommented(ctx, event);
    }

    if (event.webhookEvent === "jira:issue_updated" &&
        event.issue_event_type_name.match(/^(issue_generic|issue_updated)$/) &&
        event.changelog !== null
       ) {
        logger.info(`JIRA routeEvent: New Issue state change detected`);
        issueStateChange(ctx, event);
    }

    if (event.webhookEvent === "jira:issue_created" && event.issue_event_type_name === "issue_created") {
        logger.info(`JIRA routeEvent: New Issue was created`);
        issueCreated(ctx, event);
    }

    if (event.webhookEvent === "jira:issue_deleted") {
        logger.info(`JIRA routeEvent: Issue was deleted`);
        issueDeleted(ctx, event);
    }

};
