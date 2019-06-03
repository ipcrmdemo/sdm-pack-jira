import {configurationValue, GraphQL, logger, OnEvent, Success} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import {JiraConfig} from "../jira";
import {purgeCacheEntry} from "../support/cache/manage";
import * as types from "../typings/types";

/**
 * This event handler is used to trigger cache purge events.  If the incoming event is a project change event (created, updated, or
 * deleted) this will cause the project endpoint to be purged from the cache.
 */
function onJiraIssueEventCacheHandler():
    OnEvent<types.OnJiraIssueEvent.Subscription> {
    return async e => {
        if (["project_created", "project_updated", "project_deleted"].includes(e.data.JiraIssue[0].webhookEvent)) {
            const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
            logger.info(`JIRA onJiraIssueEventCacheHandler Flushing JIRA project cache, configuration changes have been made`);
            await purgeCacheEntry(`${jiraConfig.url}/rest/api/2/project`);
            logger.info(`JIRA onJiraIssueEventCacheHandler Successfully flushed project cache`);
        }
        return Success;
    };
}

export const onJiraIssueEventCache: EventHandlerRegistration<types.OnJiraIssueEvent.Subscription> = {
    name: "OnJiraIssueEventCache",
    subscription: GraphQL.subscription("OnJiraIssueEvent"),
    listener: onJiraIssueEventCacheHandler(),
};
