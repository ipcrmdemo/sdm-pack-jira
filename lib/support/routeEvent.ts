import {buttonForCommand, configurationValue, HandlerContext, MessageOptions} from "@atomist/automation-client";
import {slackTs} from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import _ = require("lodash");
import {JiraConfig} from "../jira";
import * as types from "../typings/types";
import {jiraDetermineNotifyChannels, jiraParseChannels} from "./helpers/channelLookup";
import {
    buildJiraFooter,
    prepareIssueCommentedMessage,
    prepareIssueDeletedMessage,
    prepareNewIssueMessage,
    prepareStateChangeMessage,
} from "./helpers/msgHelpers";
import {getJiraDetails} from "./jiraDataLookup";
import * as jiraTypes from "./jiraDefs";

export const routeEvent = async (ctx: HandlerContext, event: types.OnJiraIssueEvent.JiraIssue): Promise<void> => {
    // Build one object with all the stuff that we'll convert into a slack message
    const message: slack.Attachment[] = [];
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    let issueDetail: jiraTypes.Issue;
    let msgOptions: MessageOptions;

    // Set a description
    let description: string;
    switch (event.webhookEvent) {
        case("jira:issue_updated"): {
            issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self, true, 30);
            description = `JIRA Issue updated ` + slack.url(
                `${jiraConfig.url}/browse/${event.issue.key}`,
                `${event.issue.key}: ${issueDetail.fields.summary}`,
            );
            let commentId: string;
            if (event.comment !== null) {
                commentId = event.comment.id;
            }
            msgOptions = {
                id: `jira/issue_updated/${event.issue.key}/${commentId}`,
                ttl: 60000 * 60,
            };
            break;
        }

        case("jira:issue_created"): {
            issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self, true, 30);
            description = `JIRA Issue created ` + slack.url(
                `${jiraConfig.url}/browse/${event.issue.key}`,
                `${event.issue.key}: ${issueDetail.fields.summary}`,
            );
            msgOptions = {
                id: `jira/issue_created/${event.issue.key}/${event.issue_event_type_name}`,
                ttl: 60000 * 60,
            };
            break;
        }

        case("jira:issue_deleted"): {
            description = slack.url(`${jiraConfig.url}/browse/${event.issue.key}`, `JIRA Issue ${event.issue.key} deleted`);
            msgOptions = {
                id: `jira/issue_deleted/${event.issue.key}/${event.issue_event_type_name}`,
                ttl: 60000 * 60,
            };
            break;
        }
    }

    // Get all the channels to notify
    const channels: types.GetJiraChannelPrefs.JiraChannelPrefs[] = [];
    const newChannels = await jiraDetermineNotifyChannels(ctx, event);

    // Apply channel preferences to filter out who to alert
    if (event.issue_event_type_name !== null && event.issue_event_type_name.match(/^(issue_comment_edited|issue_commented)$/)) {
        channels.push(...(await jiraParseChannels(newChannels, event, `issueComment`)));
    }

    if (event.issue_event_type_name !== null && event.issue_event_type_name.match(/^(issue_generic|issue_updated|issue_assigned)$/)) {
        switch (event.issue_event_type_name) {
            // Transitions
            case("issue_generic"): {
                channels.push(...(await jiraParseChannels(newChannels, event, `issueStatus`)));
                break;
            }
            // Other Issue definition changes
            case("issue_assigned"):
            case("issue_updated"): {
                channels.push(...(await jiraParseChannels(newChannels, event, `issueState`)));
                break;
            }
        }
    }

    if (event.issue_event_type_name === "issue_created") {
        channels.push(...(await jiraParseChannels(newChannels, event, `issueCreated`)));
    }

    if (event.webhookEvent === "jira:issue_deleted") {
        channels.push(...(newChannels.filter(c => c.issueDeleted === true)));
    }

    // Extract message details
    message.push(...(await prepareNewIssueMessage(event)));
    message.push(...(await prepareIssueDeletedMessage(event)));
    message.push(...(await prepareStateChangeMessage(event)));
    message.push(...(await prepareIssueCommentedMessage(event)));

    // Dedupe channels and send message
    if (message.length > 0 && channels.length > 0) {
        const notifyChannels = _.uniqBy(channels, "channel");
        const finalMessage: slack.SlackMessage = {
            attachments: [
                {
                    pretext: description,
                    fallback: description,
                },
                ...message,
                {
                    fallback: `Footer`,
                    footer: buildJiraFooter(issueDetail),
                    footer_icon: "https://images.atomist.com/rug/issue-open.png",
                    ts: slackTs(),
                },
                {
                    fallback: `Actions`,
                    actions: [
                        event.webhookEvent !== "jira:issue_deleted" ?
                            buttonForCommand({text: "Comment"}, "JiraCommentOnIssue", {issueId: event.issue.id}) : undefined,
                    ],
                },
            ],
        };

        if (notifyChannels.length > 0) {
            await ctx.messageClient.addressChannels(finalMessage, notifyChannels.map(c => c.channel), msgOptions);
        }
    }
};
