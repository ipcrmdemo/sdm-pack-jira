import {
    addressEvent,
    configurationValue,
    HttpClientFactory,
    HttpMethod,
    logger,
    MappedParameter,
    MappedParameters,
    Parameters,
} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandListenerInvocation} from "@atomist/sdm";
import {JiraConfig} from "../../jira";
import {purgeCacheEntry} from "../cache/manage";
import {getJiraDetails} from "../jiraDataLookup";
import {Project} from "../jiraDefs";

@Parameters()
export class JiraHandlerParam {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public slackChannel: string;
}

interface ProjectMapPayload {
    channel: string;
    projectId: string;
    active: boolean;
}

interface ComponentMapPayload {
    channel: string;
    projectId: string;
    componentId: string;
    active: boolean;
}

export interface JiraIssueCreated {
    id: string;
    key: string;
    self: string;
}

export function submitMappingPayload(
    ci: CommandListenerInvocation<JiraHandlerParam>,
    payload: ProjectMapPayload | ComponentMapPayload,
    eventRootType: string,
    cacheEntry?: string,
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        try {
            await ci.context.messageClient.send(payload, addressEvent(eventRootType));
            if (cacheEntry) {
                await purgeCacheEntry(cacheEntry);
            }
            resolve();
        } catch (e) {
            logger.error(`JIRA submitMappingPayload: Error found => ${e}`);
            reject(e);
        }
    });
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

export async function prepProjectSelect(ci: CommandListenerInvocation<JiraHandlerParam>, search: string): Promise<Option[] | undefined> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

    // Get Search pattern for project lookup
    const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

    // Find projects that match project search string
    const projectValues: Option[] = [];
    const result = await getJiraDetails<Project[]>(lookupUrl, true);

    result.forEach(p => {
        if (p.name.toLowerCase().includes(search.toLowerCase())) {
            logger.debug(`JIRA prepProjectSelect: Found project match ${p.name}!`);
            projectValues.push({description: p.name, value: p.id});
        }
    });

    if (projectValues.length > 0) {
        return projectValues;
    } else {
        return undefined;
    }
}

export async function prepComponentSelect(
    ci: CommandListenerInvocation<JiraHandlerParam>,
    project: string,
): Promise<Option[] | undefined> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const componentLookupUrl = `${jiraConfig.url}/rest/api/2/project/${project}`;
    const projectDetails = await getJiraDetails<Project>(componentLookupUrl, false);
    const componentValues: Option[] = [];

    projectDetails.components.forEach(c => {
        componentValues.push({description: c.name, value: c.id});
    });

    if (componentValues.length > 0) {
        return componentValues;
    } else {
        return undefined;
    }
}
