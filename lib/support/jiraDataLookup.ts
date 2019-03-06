import {
    configurationValue,
    HttpClientFactory,
    HttpMethod,
    logger,
} from "@atomist/automation-client";
import * as NodeCache from "node-cache";
import { JiraConfig } from "../jira";

/**
 * This function retrieves details from JIRA.  You must supply the full "self"
 * url to the endpoint to retrieve the data from.  Using the generic you can retrieve many
 * types of data with this function.
 *
 *  example: const result = await jiraSelfUrl<User>("http://localhost:8080/rest/api/2/user?username=matt");
 *
 * @param {string} jiraSelfUrl Supply the api endpoint to the given user
 * @param {boolean} cache Can we store the result of this query? Default false
 * @param {number} ttl If we cache, how long should we store this? Default 3600
 * @returns {User} JIRA user object
 */
export async function getJiraDetails<T>(jiraSelfUrl: string, cache: boolean = false, ttl: number = 3600): Promise<T> {
    return new Promise<T>( async (resolve, reject) => {
        const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
        const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
        const jiraCache = configurationValue<NodeCache>("sdm.jiraCache");
        const cacheResult = jiraCache.get<T>(jiraSelfUrl);

        if (cache && cacheResult !== undefined) {
            logger.debug(`JIRA getJiraDetails => ${jiraSelfUrl}: Cache hit, re-using value...`);
            resolve(cacheResult);
        } else {
            logger.debug(`JIRA getJiraDetails => ${jiraSelfUrl}): Cache ${cache ? "miss" : "disabled"}, querying...`);

            await httpClient.exchange(
                jiraSelfUrl,
                {
                    method: HttpMethod.Get,
                    headers: {
                        Accept: "application/json",
                    },
                    options: {
                        auth: {
                            username: jiraConfig.user,
                            password: jiraConfig.password,
                        },
                    },
                },
            )
                .then(result => {
                    if (cache) {
                        jiraCache.set(jiraSelfUrl, result.body, ttl);
                    }
                    resolve(result.body as T);
                })
                .catch(e => {
                    const error = `JIRA getJiraDetails: Failed to retrieve details for ${jiraSelfUrl}, error thrown: ${e}`;
                    logger.error(error);
                    reject(error);
                });
        }
    });
}

interface JiraRepoDetailLink {
    name: string;
    url: string;
}
interface JiraRepoDetail {
    repositories: JiraRepoDetailLink[];
}

interface JiraIssueRepo {
    detail: JiraRepoDetail[];
}

/**
 * Return the list of repos associated with this JIRA issue.
 * @param {number} issueId The ID of the JIRA issue.
 * @param {Configuration} config Atomist Configuration
 * @returns {string[]} List of repo names
 */
export async function getJiraIssueRepos(issueId: string): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject ) => {
        const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
        const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
        const lookupUrl =
            // tslint:disable-next-line:max-line-length
            `${jiraConfig.url}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${jiraConfig.vcstype}&dataType=repository`;

        logger.debug(`JIRA getJiraIssueRepos: using issueID => ${issueId}`);
        logger.debug(`JIRA getJiraIssueRepos: using lookupUrl => ${JSON.stringify(lookupUrl)}`);

        await httpClient.exchange(
            lookupUrl,
            {
                method: HttpMethod.Get,
                headers: {
                    Accept: "application/json",
                },
                options: {
                    auth: {
                        username: jiraConfig.user,
                        password: jiraConfig.password,
                    },
                },
            },
        )
            .then(result => {
                const repos: string[] = [];
                const data = result.body as JiraIssueRepo;
                logger.debug(`JIRA getJiraIssueRepos: ticket detail => ${JSON.stringify(data.detail)}`);

                if (data.detail && data.detail.length > 0) {
                    data.detail.forEach(d => {
                        d.repositories.forEach(r => {
                            repos.push(r.name);
                        });
                    });

                    logger.debug(`JIRA getJiraIssueRepos: Found repos => ${JSON.stringify(repos)}`);
                    resolve(repos);
                } else {
                    logger.warn(`JIRA getJiraIssueRepos: no repos found! IssueId => ${issueId}`);
                    resolve([]);
                }
            })
            .catch(e => {
                logger.error(e);
                reject(e);
            });

    });
}
