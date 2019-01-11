import { configurationValue } from "@atomist/automation-client";
import { slackTs } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import * as jiraTypes from "../issueDefs";
import { getJiraDetails } from "../jiraDataLookup";

export const prepareIssueCommentedMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<SlackMessage> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self);
    const commentDetail = await getJiraDetails<jiraTypes.Comment>(event.comment.self);

    return {
        attachments: [{
            pretext: `<${jiraConfig.url}/browse/${issueDetail.key}|Updated Issue ${issueDetail.key}: ${issueDetail.fields.summary}>`,
            color: "#45B254",
            author_name: `@${commentDetail.author.name}`,
            author_icon: commentDetail.author.avatarUrls["48x48"],
            fallback: `New comment on issue ${issueDetail.key} by ${commentDetail.author.name}`,
            text: commentDetail.body,
            footer: "jira, issue",
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        }],
    };
};
