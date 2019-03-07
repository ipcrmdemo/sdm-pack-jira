/**
 * Query Graph for JIRA Mappings using cache if available
 * @param {HandlerContext} ctx
 * @param {string} queryName
 * @param variables
 */
import {configurationValue, HandlerContext, logger, QueryNoCacheOptions} from "@atomist/automation-client";
import * as NodeCache from "node-cache";
import * as objectHash from "object-hash";

export async function cachedJiraMappingLookup<Q, V>(
    ctx: HandlerContext,
    queryName: string,
    variables: V,
): Promise<Q> {
    const hashKey = `${ctx.workspaceId}-${queryName}-${objectHash(variables)}`;
    const enable = configurationValue<boolean>("sdm.jira.useCache", false);
    return new Promise<Q>((resolve, reject) => {
        const jiraCache = configurationValue<NodeCache>("sdm.jiraCache");
        const result = jiraCache.get<Q>(hashKey);

        if (result !== undefined && enable) {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache hit, re-using value...`);
            resolve(result);
        } else {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache ${enable ? "miss" : "disabled"}, querying...`);
            ctx.graphClient.query<Q, V>({
                name: queryName,
                variables,
                options: QueryNoCacheOptions,
            }).then( res => {
                if (enable) {
                    jiraCache.set(hashKey, res);
                }
                resolve(res);
            }).catch(e => {
                reject(e);
            });
        }
    });
}
