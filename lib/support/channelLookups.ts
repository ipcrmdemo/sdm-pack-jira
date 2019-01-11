import { configurationValue, HandlerContext, HttpClient, HttpMethod, logger } from "@atomist/automation-client";
import * as types from "../typings/types";

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
