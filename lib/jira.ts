import { GraphQL } from "@atomist/automation-client";
import { ExtensionPack, metadata } from "@atomist/sdm";
import * as NodeCache from "node-cache";
import { onJiraIssueEvent } from "./event/onJiraIssueEvent";
import {onJiraIssueEventCache} from "./event/onJiraIssueEventCache";
import { getJiraChannelPrefsReg, setJiraChannelPrefsReg } from "./support/commands/configureChannelPrefs";
import {h1createJiraTicketReg, h2createJiraTicketReg, h3createJiraTicketReg} from "./support/commands/createJiraTicket";
import { getCurrentChannelMappingsReg } from "./support/commands/getCurrentChannelMappings";
import {
    createComponentChannelMappingOptionsReg,
    createComponentChannelMappingReg,
    disableComponentChannelMappingOptionsReg,
    removeComponentChannelMappingReg, startComponentChannelMappingOptionsReg
} from "./support/commands/mapComponentChannel";
import {createProjectChannelMappingReg, produceProjectChannelMappingOptions, removeProjectMappingReg} from "./support/commands/mapProjectChannel";
import {createIssueReg} from "./support/commands/promptFor/createIssue";
import {mapComponentToChannelReg} from "./support/commands/promptFor/mapComponent";
import {mapProjectToChannelReg} from "./support/commands/promptFor/mapProject";
import {removeComponentMapFromChannelReg} from "./support/commands/promptFor/removeComponentMap";
import {removeProjectMapFromChannelReg} from "./support/commands/promptFor/removeProjectMap";
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
