import { configurationValue } from "@atomist/automation-client";
import { slackTs } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import jira2slack = require("jira2slack");
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import * as jiraTypes from "../issueDefs";
import { getJiraDetails } from "../jiraDataLookup";

export const upperCaseFirstLetter = (word: string): string => {
    return word.charAt(0).toUpperCase() + word.slice(1);
};

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
            text: jira2slack.toSlack(commentDetail.body),
            footer: "jira, issue",
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        }],
    };
};

export const prepareStateChangeMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<SlackMessage> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self);
    const userDetail = await getJiraDetails<jiraTypes.User>(event.user.self);

    const message: string[] = [];
    event.changelog.items.forEach(c => {
        message.push(`${upperCaseFirstLetter(c.field)} updated from *${c.fromString}* => *${c.toString}*`);
    });

    return {
        attachments: [{
            pretext: `<${jiraConfig.url}/browse/${issueDetail.key}|Updated Issue ${issueDetail.key}: ${issueDetail.fields.summary}>`,
            color: "#45B254",
            author_name: `@${userDetail.name}`,
            author_icon: userDetail.avatarUrls["48x48"],
            fallback: `New comment on issue ${issueDetail.key} by ${userDetail.name}`,
            text: message.join("\n"),
            footer: "jira, issue, changelog",
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        }],
    };

};
