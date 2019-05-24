import {
    addressEvent,
    configurationValue, HandlerContext,
    HttpClientFactory,
    HttpMethod,
    logger,
    MappedParameter,
    MappedParameters,
    Parameters,
} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {CommandListenerInvocation, SdmContext} from "@atomist/sdm";
import {getJiraAuth, JiraConfig} from "../../jira";
import {purgeCacheEntry} from "../cache/manage";
import {getJiraDetails} from "../jiraDataLookup";
import {Issue, Project} from "../jiraDefs";

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

export interface JiraItemCreated {
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

export const createJiraTicket = async (data: any, ctx?: SdmContext): Promise<JiraItemCreated> => {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    return createJiraResource(`${jiraConfig.url}/rest/api/2/issue`, data, undefined, ctx);
};

export interface JiraProjectDefinition {
    key: string;
    name: string;
    lead: string;
    description: string;
    projectTypeKey: string;
    projectTemplateKey: string;
    assigneeType: string;
    extraData?: any;
}

export async function createJiraProject(
    data: JiraProjectDefinition,
    ctx?: SdmContext,
): Promise<JiraItemCreated> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    return createJiraResource(`${jiraConfig.url}/rest/api/2/project`, {
        key: data.key,
        name: data.name,
        lead: data.lead,
        description: data.description,
        projectTypeKey: data.projectTypeKey,
        projectTemplateKey: data.projectTemplateKey,
        assigneeType: data.assigneeType,
        ...data.extraData,
    }, undefined, ctx);
}

export interface JiraComponentDefinition {
    name: string;
    description: string;
    project: string;
    assigneeType: "PROJECT_LEAD" | "COMPONENT_LEAD" | "UNASSIGNED" | "PROJECT_DEFAULT";
    extraData?: any;
}

export async function createJiraComponent(
    data: JiraComponentDefinition,
    ctx?: SdmContext,
): Promise<JiraItemCreated> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    return createJiraResource(`${jiraConfig.url}/rest/api/2/component`, {
        name: data.name,
        description: data.description,
        project: data.project,
        assigneeType: data.assigneeType,
        ...data.extraData,
    }, undefined, ctx);
}

export const createJiraResource = async (apiUrl: string, data: any, update: boolean = false, ctx?: SdmContext): Promise<JiraItemCreated> => {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    logger.warn(`JIRA createJiraResource: Data payload => ${JSON.stringify(data)}`);

    const result = await httpClient.exchange(
        apiUrl,
        {
            method: update ? HttpMethod.Put : HttpMethod.Post,
            headers: {
                "Content-Type": "application/json",
                ...await getJiraAuth(ctx),
            },
            body: data,
        },
    ).catch(e => {
        logger.error(
            "JIRA createJiraResource: Failed to create resource with error - " +
            `(${JSON.stringify(e.response.status)}) ${JSON.stringify(e.response.data)}`,
        );
        throw new Error(JSON.stringify(e.response.data));
    });

    return result.body as JiraItemCreated;
};

export async function prepProjectSelect(search: string, ctx: SdmContext): Promise<Option[] | undefined> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

    // Get Search pattern for project lookup
    const lookupUrl = `${jiraConfig.url}/rest/api/2/project`;

    // Find projects that match project search string
    const projectValues: Option[] = [];
    const result = await getJiraDetails<Project[]>(lookupUrl, true, undefined, ctx);

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
    project: string,
    ctx: SdmContext,
): Promise<Option[] | undefined> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const componentLookupUrl = `${jiraConfig.url}/rest/api/2/project/${project}`;
    const projectDetails = await getJiraDetails<Project>(componentLookupUrl, false, undefined, ctx);
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

export interface JiraQueryLanguageIssueResults {
    issues: Issue[];
    startAt: number;
    maxResults: number;
    total: number;
}

/**
 * Simple helper to retrieve issues via JQL query
 *
 * Notice - Pagination is NOT handled here, needs to be handled in the calling function.  There are helper startAt/maxResults parameters so you do not
 * have to include these items in your query string
 *
 * @param {String} jql: JQL syntax only
 * @param {String} startAt?: The index to start retrieving from (for pagination)
 * @param {String} maxResults?: The max number of issues to retrieve
 * @returns {JiraQueryLanguageIssueResults}
 */
export async function searchIssues(
    jql: string,
    startAt?: string,
    maxResults?: string,
): Promise<JiraQueryLanguageIssueResults> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    let issueLookup = `${jiraConfig.url}/rest/api/2/search?jql=${jql}`;
    if (startAt) {
        issueLookup = issueLookup + `&startAt=${startAt}`;
    }
    if (maxResults) {
        issueLookup = issueLookup + `&maxResults=${maxResults}`;
    }
    return getJiraDetails<JiraQueryLanguageIssueResults>(issueLookup, false);
}
