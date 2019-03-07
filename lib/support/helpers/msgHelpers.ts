import {buttonForCommand, configurationValue, logger} from "@atomist/automation-client";
import { slackTs } from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import jira2slack = require("jira2slack");
import { JiraConfig } from "../../jira";
import * as types from "../../typings/types";
import { getJiraDetails } from "../jiraDataLookup";
import * as jiraTypes from "../jiraDefs";

export const upperCaseFirstLetter = (word: string): string => {
    return word.charAt(0).toUpperCase() + word.slice(1);
};

export const prepareIssueCommentedMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<slack.SlackMessage> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self);
    const authorDetail = await getJiraDetails<jiraTypes.Comment>(event.comment.self);

    return {
        attachments: [{
            pretext: `<${jiraConfig.url}/browse/${event.issue.key}|New Comment on Issue ${event.issue.key}: ${event.issue.fields.summary}>`,
            color: "#45B254",
            author_name: `@${event.comment.author.name}`,
            author_icon: authorDetail.author.avatarUrls["48x48"],
            fallback: `New comment on issue ${event.issue.key} by ${event.comment.author.name}`,
            text: jira2slack.toSlack(event.comment.body),
            footer: jiraSlackFooter(
                issueDetail.fields.project.name,
                issueDetail.fields.project.key,
                issueDetail.fields.labels,
                undefined,
            ),
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        },
        {
            fallback: "Actions",
            actions: [
                buttonForCommand({text: "Comment"}, "JiraCommentOnIssue", {issueId: event.issue.id}),
            ],
        },
        ],
    };
};

export const prepareStateChangeMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<slack.SlackMessage> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self);
    const userDetail = await getJiraDetails<jiraTypes.User>(event.user.self, true);

    const fields: slack.Field[] = [];
    event.changelog.items.forEach(c => {
        if (c.field !== "description") {
            fields.push(
                {
                    title: `${upperCaseFirstLetter(c.field)} Change`,
                    value: `${c.fromString} => ${c.toString}`,
                    short: true,
                },
            );
        } else {
            fields.push(
                {
                    title: `Description Updated`,
                    value: jira2slack.toSlack(c.toString),
                    short: false,
                },
            );
        }
    });

    return {
        attachments: [{
            pretext: `<${jiraConfig.url}/browse/${event.issue.key}|Updated Issue ${event.issue.key}: ${event.issue.fields.summary}>`,
            color: "#45B254",
            author_name: `@${userDetail.name}`,
            author_icon: userDetail.avatarUrls["48x48"],
            fallback: `New comment on issue ${event.issue.key} by ${userDetail.name}`,
            fields,
            footer: jiraSlackFooter(
                issueDetail.fields.project.name,
                issueDetail.fields.project.key,
                issueDetail.fields.labels,
                undefined,
            ),
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        },
        {
            fallback: "Actions",
            actions: [
                buttonForCommand({text: "Comment"}, "JiraCommentOnIssue", {issueId: event.issue.id}),
            ],
        },
        ],
    };

};

export const prepareIssueDeletedMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<slack.SlackMessage> => {
    const userDetail = await getJiraDetails<jiraTypes.User>(event.user.self, true);

    return {
        attachments: [{
            pretext: `*Issue Deleted* => ${event.issue.key}: ${event.issue.fields.summary}`,
            color: "#45B254",
            author_name: `@${userDetail.name}`,
            author_icon: userDetail.avatarUrls["48x48"],
            fallback: `Issue deleted ${event.issue.key} by ${userDetail.name}`,
            footer: jiraSlackFooter(
                event.issue.fields.project.name,
                event.issue.fields.project.key,
                [],
                undefined,
            ),
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        }],
    };

};

export const prepareNewIssueMessage = async (event: types.OnJiraIssueEvent.JiraIssue): Promise<slack.SlackMessage> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self);

    return {
        attachments: [{
            pretext: `<${jiraConfig.url}/browse/${event.issue.key}|New Issue created! ${event.issue.key}: ${event.issue.fields.summary}>`,
            color: "#45B254",
            author_name: `@${issueDetail.fields.reporter.name}`,
            author_icon: issueDetail.fields.reporter.avatarUrls["48x48"],
            fallback: `New issue ${event.issue.key} by ${issueDetail.fields.reporter.name}`,
            fields: [
                {
                    title: "Issue Type",
                    value: issueDetail.fields.issuetype.name,
                    short: true,
                },
                {
                    title: "Priority",
                    value: issueDetail.fields.priority.name,
                    short: true,
                },
                {
                    title: "Assignee",
                    value: issueDetail.fields.assignee !== null ?
                        `\u{1F464} ${issueDetail.fields.assignee.name}` :
                        `\u{1F464} Unassigned`,
                    short: true,
                },
                {
                    title: "Components",
                    value: issueDetail.fields.components.map(c => c.name).join(","),
                    short: true,
                },
                {
                    title: "Reporter",
                    value: issueDetail.fields.reporter.name,
                    short: true,
                },
                {
                    title: "Status",
                    value: issueDetail.fields.status.name,
                    short: true,
                },
                {
                    title: "Details",
                    value: jira2slack.toSlack(issueDetail.fields.description),
                },
            ],
            footer: jiraSlackFooter(
                issueDetail.fields.project.name,
                issueDetail.fields.project.key,
                issueDetail.fields.labels,
                undefined,
            ),
            footer_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
            ts: slackTs(),
        },
        {
           fallback: "Actions",
            actions: [
                buttonForCommand({text: "Comment"}, "JiraCommentOnIssue", {issueId: event.issue.id}),
            ],
        },
        ],
    };
};

export function jiraSlackFooter(projectName: string, projectKey: string, labels: string[], author?: string): string {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    let footer = slack.url(`${jiraConfig.url}/projects/${projectKey}`, `Jira Project/${projectName}`);

    logger.debug(`JIRA jiraSlackFooter: Labels found => ${JSON.stringify(labels)}`);
    if (labels !== undefined && labels.length > 0) {
        footer += " - "
            + labels.map(l => `\u{1F3F7} ${l}`).join(" ");
    }
    if (author) {
        footer += " - " + `${slack.emoji("bust_in_silhouette")} ${author}`;
    }
    return footer;
}
