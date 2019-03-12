import {addressEvent, logger, MappedParameter, MappedParameters, Parameters} from "@atomist/automation-client";
import {CommandListenerInvocation, slackErrorMessage} from "@atomist/sdm";
import objectHash = require("object-hash");
import {purgeCacheEntry} from "../../cache/manage";

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
