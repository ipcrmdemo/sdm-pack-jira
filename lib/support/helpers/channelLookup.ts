import { configurationValue, HandlerContext, logger } from "@atomist/automation-client";
import _ = require("lodash");
import * as types from "../../typings/types";
import { queryJiraChannelPrefs } from "../commands/configureChannelPrefs";
import { getJiraIssueRepos } from "../jiraDataLookup";
import {cachedJiraMappingLookup} from "../shared";

const getProjectChannels = async (ctx: HandlerContext, projectId: string, onlyActive: boolean = true): Promise<string[]> => {
    const projectChannels =
        await cachedJiraMappingLookup<types.GetChannelByProject.Query, types.GetChannelByProject.Variables>(
            ctx, "GetChannelByProject", {projectid: [projectId]});
    const returnChannels: string[] = [];
    projectChannels.JiraProjectMap.forEach(c => {
        switch (onlyActive) {
            case(true): {
                if (c.active === true) {
                    returnChannels.push(c.channel);
                }
                break;
            }
            case(false): {
                returnChannels.push(c.channel);
                break;
            }
        }
    });

    return returnChannels;
};

export const getMappedProjectsbyChannel = async (
    ctx: HandlerContext,
    channel: string,
): Promise<string[]> => {
    const projects =
        await cachedJiraMappingLookup<types.GetAllProjectMappingsforChannel.Query, types.GetAllProjectMappingsforChannel.Variables>(
            ctx, "GetAllProjectMappingsforChannel", {channel: [channel]});
    if (projects && projects.JiraProjectMap.length > 0) {
        return projects.JiraProjectMap.map(c => c.projectId);
    } else {
        return [];
    }
};

export interface JiraProjectComponentMap {
    componentId: string;
    projectId: string;
}

export const getMappedComponentsbyChannel = async (
    ctx: HandlerContext,
    channel: string,
): Promise<JiraProjectComponentMap[]> => {
    const components =
        await cachedJiraMappingLookup<types.GetAllComponentMappingsforChannel.Query, types.GetAllComponentMappingsforChannel.Variables>(
            ctx, "GetAllComponentMappingsforChannel", {channel: [channel]});
    if (components && components.JiraComponentMap && components.JiraComponentMap.length > 0) {
        return components.JiraComponentMap.map<JiraProjectComponentMap>(c => ({componentId: c.componentId, projectId: c.projectId}));
    } else {
        return [];
    }
};

const getComponentChannels = async (
    ctx: HandlerContext,
    projectId: string,
    componentIds: string[],
    onlyActive: boolean = true,
    ): Promise<string[]> => {
    const componentChannels: string[] = [];
    await Promise.all(componentIds.map(async c => {
        const result =
            await cachedJiraMappingLookup<types.GetChannelByComponent.Query, types.GetChannelByComponent.Variables>(
                ctx, "GetChannelByComponent", {projectId, componentId: c});

        if (result.JiraComponentMap && result.JiraComponentMap && result.JiraComponentMap.length > 0) {
            switch (onlyActive) {
                case(true): {
                    if (result.JiraComponentMap[0].active === true) {
                        componentChannels.push(result.JiraComponentMap[0].channel);
                    }
                    break;
                }
                case(false): {
                    componentChannels.push(result.JiraComponentMap[0].channel);
                    break;
                }
            }
        }
    }));
    return componentChannels;
};

export const jiraChannelLookup = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
    ): Promise<string[]> => {
    const projectChannels = await getProjectChannels(ctx, event.issue.fields.project.id);
    logger.debug(`JIRA jiraChannelLookup => project channels ${JSON.stringify(projectChannels)}`);

    let componentChannels: string[];
    if (event.issue.fields.components.length > 0) {
        componentChannels = await getComponentChannels(
            ctx,
            event.issue.fields.project.id,
            event.issue.fields.components.map(c => c.id),
        );
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

export const jiraDetermineNotifyChannels = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
): Promise<types.GetJiraChannelPrefs.JiraChannelPrefs[]> => {
    const notifyChannels: types.GetJiraChannelPrefs.JiraChannelPrefs[] = [];
    const channels = await jiraChannelLookup(ctx, event);
    logger.debug(`JIRA jiraDetermineNotifyChannels: channels found for event => ${JSON.stringify(channels)}`);

    await Promise.all(
        channels.map(async c => {
            const prefs = await queryJiraChannelPrefs(ctx, c);
            logger.debug(`JIRA jiraDetermineNotifyChannels: prefs found for channel ${c} => ${JSON.stringify(prefs)}`);
            notifyChannels.push(prefs);
        }),
    );

    logger.debug(`JIRA jiraDetermineNotifyChannels: channels to notify => ${JSON.stringify(notifyChannels)}`);
    return notifyChannels;
};

// Get channels for this event/repo
// Lookup prefs for the resulting channels
// Return just the channels that should get notified about this event type

/**
 * Use this function to retrieve the chat channels for a given repo
 * @param {HandlerContext} ctx HandlerContext
 * @param {string} name Name of the repo to find channels for
 * @returns {string[]} Array of strings.  The names of the channels.
 */
export async function findChannelByRepo(ctx: HandlerContext, name: string): Promise<string[]> {
   return new Promise<string[]>( async (resolve, reject) => {
       await cachedJiraMappingLookup<types.GetChannelByRepo.Query, types.GetChannelByRepo.Variables>(ctx, "GetChannelByRepo" + name, {name})
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
