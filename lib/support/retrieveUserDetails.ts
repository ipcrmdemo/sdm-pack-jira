import { configurationValue, HttpClientFactory, HttpMethod, logger } from "@atomist/automation-client";
import { JiraConfig } from "../jira";
import { User } from "./issueDefs";

export const getUserDetails = async (userUrl: string): Promise<User> => {
    return new Promise<User>( async (resolve, reject) => {
        const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
        const jiraConfig = configurationValue<JiraConfig>("sdm.jira");

        await httpClient.exchange(
            userUrl,
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
                resolve(result.body as User);
            })
            .catch(e => {
                const error = `JIRA getUserDetails: Failed to retrieve details for user, error thrown: ${e}`;
                logger.error(error);
                reject(error);
            });
    });
};
