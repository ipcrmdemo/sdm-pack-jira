import {
    addressEvent,
    buttonForCommand,
    HandlerContext,
    HandlerResult, logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage, slackTs } from "@atomist/sdm";
import {SlackMessage} from "@atomist/slack-messages";
import * as objectHash from "object-hash";
import * as types from "../../typings/types";
import {cachedJiraMappingLookup} from "../cache/lookup";
import {purgeCacheEntry} from "../cache/manage";

@Parameters()
class JiraChannelPrefsBase {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;
}

@Parameters()
class JiraChannelPrefs extends JiraChannelPrefsBase {
    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from JIRA when Issues are created?",
        displayName: "Receive Notifications from JIRA when Issues are created?",
        type: "boolean",
    })
    public issueCreated: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from JIRA when Issues are deleted?",
        displayName: "Receive Notifications from JIRA when Issues are deleted?",
        type: "boolean",
    })
    public issueDeleted: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from JIRA when comments are added",
        displayName: "Receive Notifications from JIRA when comments are added",
        type: "boolean",
    })
    public issueCommented: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from JIRA when Issue status changes?",
        displayName: "Receive Notifications from JIRA when Issue status changes?",
        type: "boolean",
    })
    public issueStatus: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from JIRA on Issue transitions?",
        displayName: "Receive Notifications from JIRA on Issue transitions?",
        type: "boolean",
    })
    public issueState: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from Bug Issue Type?",
        displayName: "Receive Notifications from Bug Issue Type?",
        type: "boolean",
    })
    public bug: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from Task Issue Type?",
        displayName: "Receive Notifications from Task Issue Type?",
        type: "boolean",
    })
    public task: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from Epic Issue Type?",
        displayName: "Receive Notifications from Epic Issue Type?",
        type: "boolean",
    })
    public epic: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from Sub-task Issue Type?",
        displayName: "Receive Notifications from Sub-task Issue Type?",
        type: "boolean",
    })
    public subtask: boolean;

    @Parameter({
        pattern: /^(true|false)$/,
        description: "Receive Notifications from Story Issue Type?",
        displayName: "Receive Notifications from Story Issue Type?",
        type: "boolean",
    })
    public story: boolean;
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
        bug: ci.parameters.bug,
        task: ci.parameters.task,
        epic: ci.parameters.epic,
        story: ci.parameters.story,
        subtask: ci.parameters.subtask,
    };
    await ci.context.messageClient.send(payload, addressEvent("JiraChannelPrefs"));

    await purgeCacheEntry(
        `${ci.context.workspaceId}-GetJiraChannelPrefs-${objectHash({channel: [ci.parameters.slackChannelName]})}`);

    await ci.addressChannels(slackSuccessMessage(
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

export function mungeJiraPrefs(prefs: types.GetJiraChannelPrefs.JiraChannelPrefs): types.GetJiraChannelPrefs.JiraChannelPrefs {
    const a = (b: null | boolean) => b !== null ? b : true;
    return {
        channel: prefs.channel,
        issueComment: a(prefs.issueComment),
        issueDeleted: a(prefs.issueDeleted),
        issueCreated: a(prefs.issueCreated),
        issueState: a(prefs.issueState),
        issueStatus: a(prefs.issueStatus),
        bug: a(prefs.bug),
        task: a(prefs.task),
        epic: a(prefs.epic),
        story: a(prefs.story),
        subtask: a(prefs.subtask),
    };
}

export const queryJiraChannelPrefs = async (
    ctx: HandlerContext,
    channel: string,
): Promise<types.GetJiraChannelPrefs.JiraChannelPrefs> => {
    const result =
        await cachedJiraMappingLookup<types.GetJiraChannelPrefs.Query, types.GetJiraChannelPrefs.Variables>(
            ctx, "GetJiraChannelPrefs", {channel: [channel]});

    let setPrefs: types.GetJiraChannelPrefs.JiraChannelPrefs;
    if (result.JiraChannelPrefs.length > 0) {
        setPrefs = mungeJiraPrefs(result.JiraChannelPrefs[0]);
    } else {
        setPrefs = {
            channel,
            issueComment: true,
            issueDeleted: true,
            issueCreated: true,
            issueState: true,
            issueStatus: true,
            bug: true,
            task: true,
            epic: true,
            story: true,
            subtask: true,
        };
    }
    return setPrefs;
};

export function getJiraChannelPrefs(
    ci: CommandListenerInvocation<JiraChannelPrefsBase>,
    ): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        try {
            const prefs = await queryJiraChannelPrefs(ci.context, ci.parameters.slackChannelName);
            const message: SlackMessage = {
                attachments: [
                    {
                    author_icon: `https://images.atomist.com/rug/issue-open.png`,
                    author_name: `JIRA Notification Preferences`,
                    fallback: `JIRA Notification Preferences`,
                    },
                    {
                        fallback: `JIRA Preferences`,
                        fields: [
                            {
                                title: "Issue Created?",
                                value: prefs.issueCreated.toString(),
                            },
                            {
                                title: "Issue Deleted?",
                                value: prefs.issueDeleted.toString(),
                            },
                            {
                                title: "New Comments?",
                                value: prefs.issueComment.toString(),
                            },
                            {
                                title: "Issue Status Change?",
                                value: prefs.issueStatus.toString(),
                            },
                            {
                                title: "Issue Transitions?",
                                value: prefs.issueState.toString(),
                            },
                            {
                                title: "Bug Issue Type?",
                                value: prefs.bug.toString(),
                            },
                            {
                                title: "Task Issue Type?",
                                value: prefs.task.toString(),
                            },
                            {
                                title: "Epic Issue Type?",
                                value: prefs.epic.toString(),
                            },
                            {
                                title: "Story Issue Type?",
                                value: prefs.story.toString(),
                            },
                            {
                                title: "Sub-task Issue Type?",
                                value: prefs.subtask.toString(),
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
            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA getJiraChannelPrefs: Failed to lookup channel prefs.  Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const getJiraChannelPrefsReg: CommandHandlerRegistration<JiraChannelPrefsBase> = {
    name: "GetJiraChannelPrefs",
    description: "Get notification preferences for JIRA in this channel",
    intent: "jira preferences",
    paramsMaker: JiraChannelPrefsBase,
    listener: getJiraChannelPrefs,
};
