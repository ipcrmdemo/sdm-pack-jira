import {GraphQL, logger, OnEvent, QueryNoCacheOptions, Success} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import {purgeCacheEntry} from "../support/cache/manage";
import { routeEvent } from "../support/routeEvent";
import * as types from "../typings/types";

/**
 * onJiraIssueEventHandler
 *
 * This handler is called anytime there is an inbound JIRA Issue event and is responsible for:
 *
 * - Querying any previous events for this issue
 * - Purging any present cache entries for this Issue
 * - Sending this new event and all previous events to the routeEvent function for message building
 * and ultimately sending of chat messages.  Note, previous events are reprocessed so that any relevant
 * footer detail can be updated by re-writing the same message id with the new detail
 */
function onJiraIssueEventHandler():
    OnEvent<types.OnJiraIssueEvent.Subscription> {
    return async (e, ctx) => {
        logger.info(`JIRA Event recieved, ${JSON.stringify(e.data.JiraIssue, undefined, 2)}`);

        /**
         * Flush cache, if exists, for this Issue If there are quick subsequent changes on an issue we need
         * to make sure we retrieve the latest data per event.  Once we've retrieved the data for THIS event
         * we'll use the cached version
         */
        await purgeCacheEntry(e.data.JiraIssue[0].issue.self);

        /**
         * Let's go collect all events for this Issue key and resubmit them to be processed
         * This allows every reference to this issue to be up to date in the footer details
         */
        const events = await ctx.graphClient.query<types.GetJiraIssueByKey.Query, types.GetJiraIssueByKey.Variables>({
            name: "GetJiraIssueByKey",
            variables: { key: e.data.JiraIssue[0].issue.key },
            options: QueryNoCacheOptions,
        });

        logger.debug(`JIRA onJiraIssueEventHandler: Found ${events.JiraIssue.length} events`);
        const routeEm = async () => {
            for (const event of events.JiraIssue) {
                await routeEvent(ctx, event, event.timestamp === e.data.JiraIssue[0].timestamp);
            }
        };

        await routeEm();
        return Success;
    };
}

export const onJiraIssueEvent: EventHandlerRegistration<types.OnJiraIssueEvent.Subscription> = {
   name: "OnJiraIssueEvent",
   subscription: GraphQL.subscription("OnJiraIssueEvent"),
   listener: onJiraIssueEventHandler(),
};
