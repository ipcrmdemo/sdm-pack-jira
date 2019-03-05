import { GraphQL } from "@atomist/automation-client";
import { ExtensionPack, metadata } from "@atomist/sdm";
import * as NodeCache from "node-cache";
import { onJiraIssueEvent } from "./event/onJiraIssueEvent";
import { getJiraChannelPrefsReg, setJiraChannelPrefsReg } from "./support/commands/configureChannelPrefs";
import {h1createJiraTicketReg, h2createJiraTicketReg, h3createJiraTicketReg} from "./support/commands/createJiraTicket";
import { getCurrentChannelMappingsReg } from "./support/commands/getCurrentChannelMappings";
import {
  createComponentChannelMappingOptionsReg,
  createComponentChannelMappingReg,
  disableComponentChannelMappingOptionsReg,
  removeComponentChannelMappingReg,
  startComponentChannelMappingOptionsReg,
} from "./support/commands/mapComponentChannel";
import { createProjectChannelMappingReg, produceProjectChannelMappingOptions, removeProjectMappingReg } from "./support/commands/mapProjectChannel";
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
            sdm.addEvent(onJiraIssueEvent());
            sdm.addCommand(createProjectChannelMappingReg);
            sdm.addCommand(produceProjectChannelMappingOptions);
            sdm.addCommand(createComponentChannelMappingOptionsReg);
            sdm.addCommand(createComponentChannelMappingReg);
            sdm.addCommand(startComponentChannelMappingOptionsReg);
            sdm.addCommand(disableComponentChannelMappingOptionsReg);
            sdm.addCommand(getCurrentChannelMappingsReg);
            sdm.addCommand(removeProjectMappingReg);
            sdm.addCommand(removeComponentChannelMappingReg);
            sdm.addCommand(setJiraChannelPrefsReg);
            sdm.addCommand(getJiraChannelPrefsReg);
            sdm.addCommand(h1createJiraTicketReg);
            sdm.addCommand(h2createJiraTicketReg);
            sdm.addCommand(h3createJiraTicketReg);
            sdm.addCommand(commentOnIssue);

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
