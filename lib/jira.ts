import { GraphQL } from "@atomist/automation-client";
import { ExtensionPack, metadata } from "@atomist/sdm";
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
import {commentOnIssue} from "./support/helpers/issueActions";

export const jiraSupport = (): ExtensionPack => {
    return {
        ...metadata(),
        requiredConfigurationValues: [
        ],
        configure: sdm => {
            sdm.addIngester(GraphQL.ingester({ name: "jiraIssue" }));
            sdm.addIngester(GraphQL.ingester({ name: "jiraComponentMap" }));
            sdm.addIngester(GraphQL.ingester({ name: "jiraProjectMap" }));
            sdm.addIngester(GraphQL.ingester({ name: "jiraChannelPrefs" }));
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
            sdm.configuration.sdm.jiraCache = new NodeCache({
                stdTTL: 3600,
                checkperiod: 30,
            });
            return sdm;
        },
    };
};

export interface JiraConfig {
    url: string;
    vcstype: string;
    user: string;
    password: string;
}
