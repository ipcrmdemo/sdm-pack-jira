import {GraphQL, logger, OnEvent, Success } from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import * as types from "../typings/types";

function onJiraIssueEventCacheHandler():
    OnEvent<types.OnJiraIssueEvent.Subscription> {
    return async (e, ctx) => {
        return Success;
    };
}
