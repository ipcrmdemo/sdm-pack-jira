import { HandlerContext } from "@atomist/automation-client";
import * as types from "../typings/types";

export const issueCommented = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    // do stuff
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
