import { HandlerContext, logger } from "@atomist/automation-client";
import _ = require("lodash");
import * as types from "../../typings/types";

const getProjectChannels = async (ctx: HandlerContext, projectId: string, onlyActive: boolean = true): Promise<string[]> => {
    const projectChannels = await ctx.graphClient.query<types.GetChannelByProject.Query, types.GetChannelByProject.Variables>({
        name: "GetChannelByProject",
        variables: { projectid: [projectId] },
    });

    const returnChannels: string[] = [];
    projectChannels.JiraProjectMap.forEach(c => {
        switch (onlyActive) {
            case(true): {
                if (c.active === true) {
                    returnChannels.push(c.channel);
                }
                break;
            }
            case(false): {
                returnChannels.push(c.channel);
                break;
            }
        }
    });

    return returnChannels;
};

const getComponentChannels = async (
    ctx: HandlerContext,
    projectId: string,
    componentIds: string[],
    onlyActive: boolean = true,
    ): Promise<string[]> => {
    const componentChannels: string[] = [];
    await Promise.all(componentIds.map(async c => {
        const result = await ctx.graphClient.query<types.GetChannelByComponent.Query, types.GetChannelByComponent.Variables>({
            name: "GetChannelByComponent",
            variables: {
                projectId,
                componentId: c,
            },
        });
        switch (onlyActive) {
            case(true): {
                if (result.JiraComponentMap[0].active === true) {
                    componentChannels.push(result.JiraComponentMap[0].channel);
                }
                break;
            }
            case(false): {
                componentChannels.push(result.JiraComponentMap[0].channel);
                break;
            }
        }
    }));
    return componentChannels;
};

export const jiraChannelLookup = async (
    ctx: HandlerContext,
    event: types.OnJiraIssueEvent.JiraIssue,
    ): Promise<string[]> => {
    const projectChannels = await getProjectChannels(ctx, event.issue.fields.project.id);
    logger.debug(`JIRA jiraChannelLookup => project channels ${JSON.stringify(projectChannels)}`);

    const componentChannels = await getComponentChannels(
        ctx,
        event.issue.fields.project.id,
        event.issue.fields.components.map(c => c.id),
    );
    logger.debug(`JIRA jiraChannelLookup => component channels ${JSON.stringify(componentChannels)}`);

    let channels: string[];
    if (componentChannels) {
        channels = _.union(
            componentChannels,
            projectChannels,
            );
    } else {
        channels = projectChannels;
    }

    logger.debug(`JIRA jiraChannelLookup => found these unique channels: ${JSON.stringify(channels)}`);
    return channels;
};

/**
 * Use this function to retrieve the chat channels for a given repo
 * @param {HandlerContext} ctx HandlerContext
 * @param {string} name Name of the repo to find channels for
 * @returns {string[]} Array of strings.  The names of the channels.
 */
export async function findChannelByRepo(ctx: HandlerContext, name: string): Promise<string[]> {
   return new Promise<string[]>( async (resolve, reject) => {
        await ctx.graphClient.query<types.GetChannelByRepo.Query, types.GetChannelByRepo.Variables>({
            name: "GetChannelByRepo",
            variables: { name },
        })
            .then(
                channels => {
                    logger.debug(`findChannelByRepo: raw result ${JSON.stringify(channels)}`);
                    resolve(channels.Repo[0].channels.map(c => c.name));
                },
            )
            .catch(
                e => {
                    logger.debug(`Failed to lookup channels for repo ${name}! ${e}`);
                    reject(e);
            });
    });
}

export async function findChannelsByRepos(ctx: HandlerContext, repos: string[]): Promise<string[]> {
    const channels: string[] = [];
    await Promise.all(
        repos.map(async r => {
            const v = await findChannelByRepo(ctx, r);
            v.forEach(c => {
                channels.push(c);
            });
         }),
    );

    logger.debug(`findChannelsByRepos: Channels found/${JSON.stringify(channels)}`);
    return channels;
}
