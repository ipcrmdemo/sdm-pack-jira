import { configurationValue, HttpClientFactory, HttpMethod, logger } from "@atomist/automation-client";
import { JiraConfig } from "../../jira";
import { Issue } from "../jiraDefs";

export interface JiraIssueCreated {
    id: string;
    key: string;
    self: string;
}

export const createJiraTicket = async (data: any): Promise<JiraIssueCreated> => {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const issueUrl = `${jiraConfig.url}/rest/api/2/issue`;

    logger.warn(`JIRA createJiraTicket: Data payload => ${JSON.stringify(data)}`);

    const result = await httpClient.exchange(
        issueUrl,
        {
            method: HttpMethod.Post,
            headers: {
                "Content-Type": "application/json",
            },
            body: data,
            options: {
                auth: {
                    username: jiraConfig.user,
                    password: jiraConfig.password,
                },
            },
        },
    ).catch(e => {
            logger.error(
                "JIRA createJiraTicket: Failed to create ticket with error - " +
                `(${JSON.stringify(e.response.status)}) ${JSON.stringify(e.response.data)}`,
            );
            throw new Error(JSON.stringify(e.response.data));
    });

    return result.body as JiraIssueCreated;
};
