import {configurationValue, HandlerContext, logger, QueryNoCacheOptions} from "@atomist/automation-client";
import * as NodeCache from "node-cache";
import * as objectHash from "object-hash";
import {JiraConfig} from "../jira";
import * as types from "../typings/types";
import {getJiraDetails} from "./jiraDataLookup";
import * as jiraTypes from "./jiraDefs";

export interface JiraProject {
    id: string;
    key: string;
    name: string;
    self: string;
    components: types.OnJiraIssueEvent.Components[];
}

export async function convertEmailtoJiraUser(address: string): Promise<string> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const res = await getJiraDetails<jiraTypes.User[]>(`${jiraConfig.url}/rest/api/2/user/search?username=${address}`);

    if (res.length > 0) {
        return res[0].key;
    } else {
        return undefined;
    }
}

/**
 * Query Graph for JIRA Mappings using cache if available
 * @param {HandlerContext} ctx
 * @param {string} queryName
 * @param variables
 */
export async function cachedJiraMappingLookup<Q, V>(
    ctx: HandlerContext,
    queryName: string,
    variables: V,
): Promise<Q> {
    const hashKey = `${ctx.workspaceId}-${queryName}-${objectHash(variables)}`;
    return new Promise<Q>((resolve, reject) => {
        const jiraCache = configurationValue<NodeCache>("sdm.jiraCache");
        const result = jiraCache.get<Q>(hashKey);

        if (result !== undefined) {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache hit, re-using value...`);
            resolve(result);
        } else {
            logger.debug(`JIRA cachedJiraMappingLookup => ${hashKey}: Cache miss, querying...`);
            ctx.graphClient.query<Q, V>({
                name: queryName,
                variables,
                options: QueryNoCacheOptions,
            }).then( res => {
                jiraCache.set(hashKey, res);
                resolve(res);
            }).catch(e => {
                reject(e);
            });
        }
    });
}
