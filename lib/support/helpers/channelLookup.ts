import {configurationValue, HandlerContext, logger, QueryNoCacheOptions} from "@atomist/automation-client";
import _ = require("lodash");
import * as types from "../../typings/types";
import {cachedJiraMappingLookup, JiraPreference} from "../cache/lookup";
import { queryJiraChannelPrefs } from "../commands/configureChannelPrefs";
import {getJiraDetails, getJiraIssueRepos} from "../jiraDataLookup";
import * as jiraTypes from "../jiraDefs";

/**
 * Return all channels that are mapped to this project
 * @param {HandlerContext} ctx
 * @param {string} projectId This project ID, ie 10000.
 * @returns {string[]} Array of channel names
 */
const getProjectChannels = async (ctx: HandlerContext, projectId: string): Promise<string[]> => {
    const projectChannels =
        await cachedJiraMappingLookup(ctx, {projectId});
    return projectChannels.filter(c => c.projectId && !c.componentId).map(v => v.channel);
};

/**
 * Get all projects that are mapped to  this channel
 * @param {HandlerContext} ctx
 * @param {string} channel
 * @returns {string[]} Array of project ids
 */
export const getMappedProjectsbyChannel = async (
    ctx: HandlerContext,
    channel: string,
): Promise<string[]> => {
    const projects =
        await cachedJiraMappingLookup(ctx, {channel});
    if (projects && projects.length > 0) {
        return projects.filter(c => c.projectId && !c.componentId).map(f => f.projectId);
    } else {
        return [];
    }
};

export interface JiraProjectComponentMap {
    componentId: string;
    projectId: string;
}

/**
 * Get all components that are mapped to this channel
 * @param {HandlerContext} ctx
 * @param {string} channel
 * @returns {JiraProjectComponentMap[]} Returns an array of all the project/component maps for this channel
 */
export const getMappedComponentsbyChannel = async (
    ctx: HandlerContext,
    channel: string,
): Promise<JiraProjectComponentMap[]> => {
    const components = await cachedJiraMappingLookup(ctx, {channel});
    if (components && components.length > 0) {
        return components.map<JiraProjectComponentMap>(c => ({componentId: c.componentId, projectId: c.projectId}));
    } else {
        return [];
    }
};

/**
 * Get all channels mapped to the supplied component ids
 * @param {HandlerContext} ctx
 * @param {string} projectId The id of the project the components to search for reside in
 * @param {string[]} componentIds An array of component ids to search for channels for
 * @returns {string[]} an array of the channel names
 */
const getComponentChannels = async (
    ctx: HandlerContext,
    projectId: string,
    componentIds: string[],
): Promise<string[]> => {
    const componentChannels: string[] = [];
    await Promise.all(componentIds.map(async c => {
        const result = await cachedJiraMappingLookup(ctx, {projectId, componentId: c});
        componentChannels.push(...result.map(res => res.channel));
    }));
    return componentChannels;
};

/**
 * Find all channels that a given JiraIssue event needs to notify based on the project and/or components defined in the issue.
 *
 * @param {HandlerContext} ctx
 * @param {OnJiraIssueEvent.JiraIssue} event
 * @returns {string[]} An array of channel names to update
 */
export const jiraChannelLookup = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
    ): Promise<string[]> => {

    let projectChannels: string[];
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self + "?expand=changelog", true, 30);
    if (event && event.hasOwnProperty("issue") && event.issue) {
        projectChannels = await getProjectChannels(ctx, issueDetail.fields.project.id);
        logger.debug(`JIRA jiraChannelLookup => project channels ${JSON.stringify(projectChannels)}`);
    } else {
        logger.debug(`JIRA jiraChannelLookup => project id could not be determined`);
        return [];
    }

    let componentChannels: string[];
    if (issueDetail.fields.components.length > 0) {
        componentChannels = await getComponentChannels(ctx, issueDetail.fields.project.id, issueDetail.fields.components.map(c => c.id));
        logger.debug(`JIRA jiraChannelLookup => component channels ${JSON.stringify(componentChannels)}`);
    }

    let channels: string[];
    if (componentChannels) {
        channels = _.union(
            componentChannels,
            projectChannels,
            );
    } else {
        channels = projectChannels;
    }

    if (configurationValue<boolean>("sdm.jira.useDynamicChannels", true)) {
        let jiraDynamicallyLinkedChannels: string[] = [];
        const repos = await getJiraIssueRepos(event.issue.id);
        if (repos) {
            jiraDynamicallyLinkedChannels = await findChannelsByRepos(ctx, repos);
        }
        logger.debug(`JIRA jiraChannelLookup => dynamically linked channels ${JSON.stringify(jiraDynamicallyLinkedChannels)}`);
        channels = _.union(
            channels,
            jiraDynamicallyLinkedChannels,
        );
    }

    logger.debug(`JIRA jiraChannelLookup => found these unique channels: ${JSON.stringify(channels)}`);
    return channels;
};

/**
 * Parse an array of JIRA channel preferences for a given "check" (aka preference) and determine which channels have this notification enabled.
 * Return only the channels that have subscribed to events of this type.
 *
 * @param {JiraPreference[]} channels
 * @param {OnJiraIssueEvent.JiraIssue} event
 * @param {string} check
 * @returns {JiraPreference[]}
 */
export const jiraParseChannels = async (
    channels: JiraPreference[],
    event: types.OnJiraIssueEvent.JiraIssue,
    check: string,
): Promise<JiraPreference[]> => {
    const issueDetail = await getJiraDetails<jiraTypes.Issue>(event.issue.self + "?expand=changelog", true, 30);
    const notify = channels.map(c => {
        if (
            issueDetail &&
            issueDetail.hasOwnProperty("fields") &&
            _.get(c, check, undefined) === true &&
            _.get(c, issueDetail.fields.issuetype.name.toLowerCase().replace("-", ""), undefined) === true
        ) {
            return c;
        } else {
            logger.debug(
                `JIRA jiraParseChannels: Not including notify for channel ${c.channel},` +
                ` it does not have ${check} and ${issueDetail.fields.issuetype.name} enabled`);
        }
        return undefined;
    });

    return notify.filter(n => n !== undefined);
};

/**
 * Determine channels to notify and parse their individual channel preferences to see if they should be notified
 *
 * @param {HandlerContext} ctx
 * @param {OnJiraIssueEvent.JiraIssue} event
 * @returns {JiraPreference[]}
 */
export const jiraDetermineNotifyChannels = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
): Promise<JiraPreference[]> => {
    const notifyChannels: JiraPreference[] = [];
    const channels = await jiraChannelLookup(ctx, event);
    logger.debug(`JIRA jiraDetermineNotifyChannels => channels found for event => ${JSON.stringify(channels)}`);

    await Promise.all(
        channels.map(async c => {
            const prefs = await queryJiraChannelPrefs(ctx, c);
            logger.debug(`JIRA jiraDetermineNotifyChannels => prefs found for channel ${c} => ${JSON.stringify(prefs)}`);
            notifyChannels.push(prefs);
        }),
    );

    logger.debug(`JIRA jiraDetermineNotifyChannels: channels to notify => ${JSON.stringify(notifyChannels)}`);
    return notifyChannels;
};

/**
 * Use this function to retrieve the chat channels for a given repo
 * @param {HandlerContext} ctx HandlerContext
 * @param {string} name Name of the repo to find channels for
 * @returns {string[]} Array of strings.  The names of the channels.
 */
export async function findChannelByRepo(ctx: HandlerContext, name: string): Promise<string[]> {
   return new Promise<string[]>( async (resolve, reject) => {
       await ctx.graphClient.query<types.GetChannelByRepo.Query, types.GetChannelByRepo.Variables>({
           name: "GetChannelByRepo",
           variables: {name},
           options: QueryNoCacheOptions,
       })
           .then(
                channels => {
                    logger.debug(`findChannelByRepo: raw result ${JSON.stringify(channels)}`);
                    resolve(channels.Repo[0].channels.map(c => c.name));
                },
            )
            .catch(
                e => {
                    logger.debug(`Failed to lookup channels for repo ${name}! ${e}`);
                    reject(e);
            });
    });
}

/**
 * Use this function to retrieve mapped chat channels for multiple repos at the same time
 *
 * @param {HandlerContext} ctx
 * @param {string[]} repos
 * @returns {string[]} An array of channel names
 */
export async function findChannelsByRepos(ctx: HandlerContext, repos: string[]): Promise<string[]> {
    const channels: string[] = [];
    await Promise.all(
        repos.map(async r => {
            const v = await findChannelByRepo(ctx, r);
            v.forEach(c => {
                channels.push(c);
            });
         }),
    );

    logger.debug(`findChannelsByRepos: Channels found/${JSON.stringify(channels)}`);
    return channels;
}
