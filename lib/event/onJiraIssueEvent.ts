import {GraphQL, logger, OnEvent, QueryNoCacheOptions, Success} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import {purgeCacheEntry} from "../support/cache/manage";
import { routeEvent } from "../support/routeEvent";
import * as types from "../typings/types";

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

        await Promise.all(
            events.JiraIssue.map(async j => {
                await routeEvent(ctx, j, false);
            }),
        );

        await routeEvent(ctx, e.data.JiraIssue[0], true);
        return Success;
    };
}

export const onJiraIssueEvent: EventHandlerRegistration<types.OnJiraIssueEvent.Subscription> = {
   name: "OnJiraIssueEvent",
   subscription: GraphQL.subscription("OnJiraIssueEvent"),
   listener: onJiraIssueEventHandler(),
};
