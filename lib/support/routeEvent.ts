import {
    buttonForCommand,
    configurationValue,
    HandlerContext,
    logger,
    menuForCommand,
    MenuSpecification,
    MessageOptions,
} from "@atomist/automation-client";
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

/**
 * routeEvent
 *
 * This function is used to determine what type of inbound JIRA Issue event we have received, what data
 * should be included in the messages that are sent to the Chat platform, and what actions should be
 * available on those messages.
 *
 * @param {HandlerContext} ctx
 * @param {OnJiraIssueEvent.JiraIssue} event
 * @param {Boolean} newEvent Controls what the message options should be, update only or always-post
 */
export const routeEvent = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
    newEvent: boolean,
): Promise<void> => {
    // Build one array with all the stuff that we'll convert into a slack message
    const message: slack.Attachment[] = [];

    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    let issueDetail: jiraTypes.Issue;
    let issueTransitions: jiraTypes.JiraIssueTransitions;
    let msgOptions: MessageOptions;

    // Set a description and provide a static (and reproducible) message id
    let description: string;
    switch (event.webhookEvent) {
        case("comment_created"):
        case("jira:issue_updated"): {
            issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self, true, 30);
            issueTransitions = await getJiraDetails<jiraTypes.JiraIssueTransitions>(event.issue.self + "/transitions", true, 5);
            description = `JIRA Issue updated ` + slack.url(
                `${jiraConfig.url}/browse/${event.issue.key}`,
                `${event.issue.key}: ${issueDetail.fields.summary}`,
            );
            msgOptions = {
                id: `jira/issue_updated/${event.issue.key}/${event.timestamp}`,
                post: newEvent ? "always" : "update_only",
            };
            break;
        }

        case("jira:issue_created"): {
            issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self, true, 30);
            issueTransitions = await getJiraDetails<jiraTypes.JiraIssueTransitions>(event.issue.self + "/transitions", true, 5);
            description = `JIRA Issue created ` + slack.url(
                `${jiraConfig.url}/browse/${event.issue.key}`,
                `${event.issue.key}: ${issueDetail.fields.summary}`,
            );
            msgOptions = {
                id: `jira/issue_created/${event.issue.key}/${event.timestamp}`,
                post: newEvent ? "always" : "update_only",
            };
            break;
        }

        case("jira:issue_deleted"): {
            description = slack.url(`${jiraConfig.url}/browse/${event.issue.key}`, `JIRA Issue ${event.issue.key} deleted`);
            msgOptions = {
                id: `jira/issue_deleted/${event.issue.key}/${event.timestamp}`,
                post: newEvent ? "always" : "update_only",
            };
            break;
        }
    }

    // Get all the channels to notify
    const channels: types.GetJiraChannelPrefs.JiraChannelPrefs[] = [];
    const newChannels = await jiraDetermineNotifyChannels(ctx, event);

    // Apply channel preferences to filter out who to alert
    if (
        event.issue_event_type_name !== null && event.issue_event_type_name.match(/^(issue_comment_edited|issue_commented)$/) ||
        event.webhookEvent === "comment_created"
    ) {
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

    // Create menu spec for issue transitions
    const transitionOptions: MenuSpecification = {
        text: "Set Status",
        options: issueTransitions.hasOwnProperty("transitions") && issueTransitions.transitions.length > 0 ?
            issueTransitions.transitions.map(t => ({text: t.name, value: t.id})) : [],
    };

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
                    actions: [
                        ...(
                            event.webhookEvent !== "jira:issue_deleted" ?
                            [buttonForCommand({text: "Comment"}, "JiraCommentOnIssue", {issueId: event.issue.id})] : []),
                        ...(issueTransitions.transitions.length > 0 ?
                            [menuForCommand(
                                transitionOptions,
                                "SetIssueStatus",
                                "transitionId",
                                {selfUrl: `${issueDetail.self}/transitions`})] : []),
                    ],
                },
            ],
        };

        if (notifyChannels.length > 0) {
            await ctx.messageClient.addressChannels(finalMessage, notifyChannels.map(c => c.channel), msgOptions);
        }
    } else {
        if (!(message.length > 0)) {
            logger.debug(`JIRA routeEvent: Message is empty, not sending message`);
        }

        if (!(channels.length > 0)) {
            logger.debug(`JIRA routeEvent: No channels found, not sending message`);
        }
    }
};
