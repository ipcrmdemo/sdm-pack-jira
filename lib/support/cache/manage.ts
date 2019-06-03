import {configurationValue, Failure, HandlerContext, HandlerResult, logger, NoParameters, Success} from "@atomist/automation-client";
import {CommandHandlerRegistration, CommandListenerInvocation, slackSuccessMessage} from "@atomist/sdm";
import * as NodeCache from "node-cache";

// TODO: Turn cache into abstract class
/**
 * Flush Cache is used to complete delete the JIRA Cache.
 *
 * @returns {void}
 */
export async function flushCache(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        try {
            const cache = configurationValue<NodeCache>("sdm.jiraCache");
            cache.flushAll();
            logger.info(`JIRA flushCache: Successfully purged JIRA cache entries`);
            resolve();
        } catch (e) {
            logger.error(`JIRA flushCache: Failed to purge cache.  Error => ${e}`);
            reject(e);
        }
    });
}

/**
 * PurgeCacheEntry is used to purge individual items from the JIRA cache.
 *
 * @param {string} key name to purge
 * @returns {void}
 */
export async function purgeCacheEntry(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        try {
            const cache = configurationValue<NodeCache>("sdm.jiraCache");
            const deleted = cache.del(key);
            logger.info(`JIRA purgeCacheEntry: Successfully purged key ${key} from JIRA cache. Deleted ${deleted} entries`);
            resolve();
        } catch (e) {
            logger.error(`JIRA purgeCacheEntry: Failed to purge entry ${key}.  Error => ${e}`);
            reject(e);
        }
    });
}

/**
 * getStats returns the usage information from the JIRA cache
 */
export async function getStats(): Promise<NodeCache.Stats> {
    return new Promise<NodeCache.Stats>((resolve, reject) => {
        try {
            const cache = configurationValue<NodeCache>("sdm.jiraCache");
            resolve(cache.getStats());
        } catch (e) {
            logger.error(`JIRA getStats: Failed to retrieve JIRA cache stats.  Error => ${e}`);
            reject(e);
        }
    });
}

export const getJiraStatsHandler = async (cli: CommandListenerInvocation<NoParameters>): Promise<HandlerResult> => {
    try {
        const stats = await getStats();
        await cli.addressChannels(slackSuccessMessage(`JIRA Cache Status`, `Stats: ${JSON.stringify(stats)}`));
        return Success;
    } catch (e) {
        logger.error(`JIRA getJiraStatsHandler: Failed to retrieve stats. Error => ${e}`);
        return Failure;
    }
};

export const getJiraStats: CommandHandlerRegistration<NoParameters> = {
    name: "GetJiraStats",
    intent: "jira cache-stats",
    listener: getJiraStatsHandler,
};
