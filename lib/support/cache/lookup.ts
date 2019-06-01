/**
 * Query Graph for JIRA Mappings using cache if available
 * @param {HandlerContext} ctx
 * @param {string} queryName
 * @param variables
 */
import {configurationValue, HandlerContext, logger } from "@atomist/automation-client";
import {PreferenceStoreFactory} from "@atomist/sdm";
import * as NodeCache from "node-cache";
import {buildJiraHashKey, JiraMapping} from "../commands/shared";

export interface JiraPreference {
    channel: string;
    issueComment: boolean;
    issueDeleted: boolean;
    issueCreated: boolean;
    issueState: boolean;
    issueStatus: boolean;
    bug: boolean;
    task: boolean;
    epic: boolean;
    story: boolean;
    subtask: boolean;
}

export async function cachedJiraPreferenceLookup(
    ctx: HandlerContext,
    channel: string,
): Promise<JiraPreference> {
    const enable = configurationValue<boolean>("sdm.jira.useCache", false);
    const hashKey = `${ctx.workspaceId}-preferences-${channel}`;

    return new Promise<JiraPreference>( async (resolve, reject) => {
        const jiraCache = configurationValue<NodeCache>("sdm.jiraCache");
        const result = jiraCache.get<JiraPreference>(hashKey);

        if (result !== undefined && enable) {
            logger.debug(`JIRA cachedJiraPreferenceLookup => ${hashKey}: Cache-hit, re-using value...`);
            resolve(result);
        } else {
            logger.debug(`JIRA cachedJiraPreferenceLookup => ${hashKey}: Cache ${enable ? "miss" : "disabled"}, querying...`);
            const prefStore = configurationValue<PreferenceStoreFactory>("sdm.preferenceStoreFactory")(ctx);
            const preferences = await prefStore.get<JiraPreference>(hashKey, {scope: "JIRAPreferences"});
            if (enable) {
                jiraCache.set(hashKey, preferences);
            }
            resolve(preferences);
        }
    });
}

export async function cachedJiraMappingLookup(
    ctx: HandlerContext,
    search?: {
        projectId?: string,
        componentId?: string,
        channel?: string,
    },
): Promise<JiraMapping[]> {
    const hashKey = buildJiraHashKey(ctx.workspaceId, {projectId: search.projectId, componentId: search.componentId, channel: search.channel});
    const enable = configurationValue<boolean>("sdm.jira.useCache", false);
    return new Promise<JiraMapping[]>(async (resolve, reject) => {
        const jiraCache = configurationValue<NodeCache>("sdm.jiraCache");
        const result = jiraCache.get<JiraMapping[]>(hashKey);

        if (result !== undefined && enable) {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache hit, re-using value...`);
            resolve(result);
        } else {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache ${enable ? "miss" : "disabled"}, querying...`);
            const mappings = configurationValue<PreferenceStoreFactory>("sdm.preferenceStoreFactory")(ctx);
            const allMaps = await mappings.list<JiraMapping>("JIRAMappings");

            const filteredMaps = allMaps.filter(m =>
                    (search.projectId   ? m.value.projectId   === search.projectId   : true) &&
                    (search.componentId ? m.value.componentId === search.componentId : true) &&
                    (search.channel     ? m.value.channel     === search.channel     : true),
            ).map(a => a.value);
            if (enable) {
                jiraCache.set(hashKey, filteredMaps);
            }
            resolve(filteredMaps);
        }
    });
}
