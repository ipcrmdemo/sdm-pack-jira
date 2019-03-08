import {GraphQL, logger, OnEvent, Success } from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import { routeEvent } from "../support/routeEvent";
import * as types from "../typings/types";

function onJiraIssueEventHandler():
    OnEvent<types.OnJiraIssueEvent.Subscription> {
    return async (e, ctx) => {
        logger.info(`JIRA Event recieved, ${JSON.stringify(e.data.JiraIssue, undefined, 2)}`);
        await routeEvent(ctx, e.data.JiraIssue[0]);
        return Success;
    };
}

export const onJiraIssueEvent: EventHandlerRegistration<types.OnJiraIssueEvent.Subscription> = {
   name: "OnJiraIssueEvent",
   subscription: GraphQL.subscription("OnJiraIssueEvent"),
   listener: onJiraIssueEventHandler(),
};
