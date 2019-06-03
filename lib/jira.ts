import {configurationValue, GraphQL, logger} from "@atomist/automation-client";
import {ExtensionPack, metadata, SdmContext} from "@atomist/sdm";
import * as NodeCache from "node-cache";
import { onJiraIssueEvent } from "./event/onJiraIssueEvent";
import {onJiraIssueEventCache} from "./event/onJiraIssueEventCache";
import { getJiraChannelPrefsReg, setJiraChannelPrefsReg } from "./support/commands/configureChannelPrefs";
import {createIssueReg} from "./support/commands/createIssue";
import { getCurrentChannelMappingsReg } from "./support/commands/getCurrentChannelMappings";
import {mapComponentToChannelReg} from "./support/commands/mapComponent";
import {mapProjectToChannelReg} from "./support/commands/mapProject";
import {removeComponentMapFromChannelReg} from "./support/commands/removeComponentMap";
import {removeProjectMapFromChannelReg} from "./support/commands/removeProjectMap";
import {commentOnIssue, setIssueStatus} from "./support/helpers/issueActions";

/**
 * This type represents the function used to retrieve credentials that are returned as an HTTP Authorization Header
 */
export type JiraAuthenticator = (ctx?: SdmContext) => Promise<{Authorization: string}>;

/**
 * The default Authenticator.  Always uses service account for authentication to the REST API.
 * @param ctx
 */
export const defaultJiraAuthenticator: JiraAuthenticator = async ctx => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    return { Authorization: `Basic ${Buffer.from(jiraConfig.user + ":" + jiraConfig.password).toString("base64")}`};
};

export async function getJiraAuth(ctx?: SdmContext): Promise<{Authorization: string}> {
    return configurationValue<JiraAuthenticator>("sdm.jiraAuthenticator")(ctx);
}

export const jiraSupport = (
    authenticator: JiraAuthenticator = defaultJiraAuthenticator,
): ExtensionPack => {
    return {
        ...metadata(),
        requiredConfigurationValues: [
            "sdm.jira.url",
        ],
        configure: sdm => {
            sdm.addIngester(GraphQL.ingester({ name: "jiraIssue" }));
            sdm.addEvent(onJiraIssueEvent);
            sdm.addEvent(onJiraIssueEventCache);
            sdm.addCommand(getCurrentChannelMappingsReg);
            sdm.addCommand(setJiraChannelPrefsReg);
            sdm.addCommand(getJiraChannelPrefsReg);
            sdm.addCommand(commentOnIssue);
            sdm.addCommand(mapProjectToChannelReg);
            sdm.addCommand(removeProjectMapFromChannelReg);
            sdm.addCommand(mapComponentToChannelReg);
            sdm.addCommand(removeComponentMapFromChannelReg);
            sdm.addCommand(createIssueReg);
            sdm.addCommand(setIssueStatus);

            // TODO: Turn this into abstract class or interface
            sdm.configuration.sdm.jiraCache = new NodeCache({
                stdTTL: 3600,
                checkperiod: 30,
            });

            sdm.configuration.sdm.jiraAuthenticator = authenticator;
            return sdm;
        },
    };
};

export interface JiraConfig {
    /**
     * Base URL to your JIRA Server instance
     */
    url: string;

    /**
     * If using dynamic channels (or the built-in JIRA approval goal), must supply this value to lookup
     * VCS repo details in JIRA.
     */
    vcstype: string;

    /**
     * Username for connecting to your JIRA Server
     */
    user: string;

    /**
     * Password for connecting to your JIRA Server
     */
    password: string;
}
