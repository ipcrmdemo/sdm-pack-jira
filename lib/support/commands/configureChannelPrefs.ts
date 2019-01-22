import {
    addressEvent,
    buttonForCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage, slackTs } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as types from "../../typings/types";
import { jiraSlackFooter } from "../helpers/msgHelpers";

@Parameters()
class JiraChannelPrefsBase {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;
}

@Parameters()
class JiraChannelPrefs extends JiraChannelPrefsBase {
    @Parameter({
        pattern: /^(true|false)$/,
        description: "Recieve Notifications from JIRA when Issues are created?",
        type: "boolean",
    })
    public issueCreated: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Recieve Notifications from JIRA when Issues are deleted?",
        type: "boolean",
    })
    public issueDeleted: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Recieve Notifications from JIRA when comments are added to Issues?",
        type: "boolean",
    })
    public issueCommented: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Recieve Notifications from JIRA when Issue status changes? (Things like issue type changes, worklog, etc)",
        type: "boolean",
    })
    public issueStatus: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Recieve Notifications from JIRA when Issue tranitions happen?",
        type: "boolean",
    })
    public issueState: boolean;
}

export async function setJiraChannelPrefs(
    ci: CommandListenerInvocation<JiraChannelPrefs>,
    ): Promise<HandlerResult> {

    const payload = {
        channel: ci.parameters.slackChannelName,
        issueCreated: ci.parameters.issueCreated,
        issueComment: ci.parameters.issueCommented,
        issueDeleted: ci.parameters.issueDeleted,
        issueStatus: ci.parameters.issueStatus,
        issueState: ci.parameters.issueState,
    };
    await ci.context.messageClient.send(payload, addressEvent("JiraChannelPrefs"));

    ci.addressChannels(slackSuccessMessage(
        `Updated JIRA notification preferences for channel ${ci.parameters.slackChannelName}`,
        `Successfully updated channel notification preferences.`,
    ));

    return { code: 0 };
}

export const setJiraChannelPrefsReg: CommandHandlerRegistration<JiraChannelPrefs> = {
    name: "SetJiraChannelPrefs",
    description: "Set notification preferences for JIRA in this channel",
    intent: "jira set preferences",
    paramsMaker: JiraChannelPrefs,
    listener: setJiraChannelPrefs,
};

export const queryJiraChannelPrefs = async (
    ctx: HandlerContext,
    channel: string,
): Promise<types.GetJiraChannelPrefs.Query> => {
    return ctx.graphClient.query<types.GetJiraChannelPrefs.Query, types.GetJiraChannelPrefs.Variables>({
        name: "GetJiraChannelPrefs",
        variables: {
            channel: [channel],
        },
        options: QueryNoCacheOptions,
    });
};

export async function getJiraChannelPrefs(
    ci: CommandListenerInvocation<JiraChannelPrefsBase>,
    ): Promise<HandlerResult> {
        const prefs = await queryJiraChannelPrefs(ci.context, ci.parameters.slackChannelName);

        let setPrefs: types.GetJiraChannelPrefs.JiraChannelPrefs;
        if (prefs.JiraChannelPrefs.length > 0) {
            setPrefs = prefs.JiraChannelPrefs[0];
        } else {
            setPrefs = {
                issueComment: true,
                issueDeleted: true,
                issueCreated: true,
                issueState: true,
                issueStatus: true,
            };
        }

        const message: SlackMessage = {
            attachments: [
                {
                    author_icon: "https://wac-cdn.atlassian.com/dam/jcr:b5e4a5a5-94b9-4098-ad1f-af4ba39b401f/corporate-deck@2x_V2.png?cdnVersion=kr",
                    author_name: `JIRA Notification Preferences`,
                    fallback: `JIRA Notification Preferences`,
                },
                {
                    fallback: `JIRA Preferences`,
                    fields: [
                        {
                            short: true,
                            title: "Issue Comments",
                            value: setPrefs.issueComment.toString(),
                        },
                        {
                            short: true,
                            title: "Issue Created",
                            value: setPrefs.issueDeleted.toString(),
                        },
                        {
                            short: true,
                            title: "Issue Deleted",
                            value: setPrefs.issueDeleted.toString(),
                        },
                        {
                            short: true,
                            title: "Issue State Changes",
                            value: setPrefs.issueState.toString(),
                        },
                        {
                            short: true,
                            title: "Issue Status Changes",
                            value: setPrefs.issueState.toString(),
                        },
                    ],
                    actions: [
                            buttonForCommand({ text: "Update Preferences"}, "SetJiraChannelPrefs"),
                    ],
                    ts: slackTs(),
                },
            ],
        };

        await ci.addressChannels(message);
        return { code: 0 };
    }

export const getJiraChannelPrefsReg: CommandHandlerRegistration<JiraChannelPrefsBase> = {
    name: "GetJiraChannelPrefs",
    description: "Get notification preferences for JIRA in this channel",
    intent: "jira preferences",
    paramsMaker: JiraChannelPrefsBase,
    listener: getJiraChannelPrefs,
};
