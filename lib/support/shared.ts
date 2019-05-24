import {configurationValue} from "@atomist/automation-client";
import {JiraConfig} from "../jira";
import {getJiraDetails} from "./jiraDataLookup";
import * as jiraTypes from "./jiraDefs";

export async function convertEmailtoJiraUser(address: string): Promise<string> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;
    const res = await getJiraDetails<jiraTypes.User[]>(`${jiraConfig.url}/rest/api/2/user/search?username=${address}`);

    if (res.length > 0) {
        return res[0].key;
    } else {
        return undefined;
    }
}
