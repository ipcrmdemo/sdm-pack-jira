import { GraphQL } from "@atomist/automation-client";
import { ExtensionPack, metadata } from "@atomist/sdm";
import { onJiraIssueEvent } from "./event/onJiraIssueEvent";
import { createProjectChannelMappingReg, produceProjectChannelMappingOptions } from "./support/commands/channelMappers";

export const jiraSupport = (): ExtensionPack => {
    return {
        ...metadata(),
        requiredConfigurationValues: [
        ],
        configure: sdm => {
            sdm.addIngester(GraphQL.ingester({ name: "jiraIssue" }));
            sdm.addIngester(GraphQL.ingester({ name: "jiraComponentMap" }));
            sdm.addIngester(GraphQL.ingester({ name: "jiraProjectMap" }));
            sdm.addEvent(onJiraIssueEvent());
            sdm.addCommand(createProjectChannelMappingReg);
            sdm.addCommand(produceProjectChannelMappingOptions);
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
