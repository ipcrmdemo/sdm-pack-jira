import { GraphQL } from "@atomist/automation-client";
import { ExtensionPack, metadata } from "@atomist/sdm";
import { onJiraIssueEvent } from "./event/onJiraIssueEvent";
import { getCurrentChannelMappingsReg } from "./support/commands/getCurrentChannelMappings";
import {
  createComponentChannelMappingOptionsReg,
  createComponentChannelMappingReg,
  disableComponentChannelMappingOptionsReg,
  removeComponentChannelMappingReg,
  startComponentChannelMappingOptionsReg,
} from "./support/commands/mapComponentChannel";
import { createProjectChannelMappingReg, produceProjectChannelMappingOptions, removeProjectMappingReg } from "./support/commands/mapProjectChannel";

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
