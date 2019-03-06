import {
  buttonForCommand,
  configurationValue,
  HandlerResult,
  logger,
  MappedParameter,
  MappedParameters,
  Parameters,
} from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation, slackTs } from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import { JiraConfig } from "../../jira";
import { getMappedComponentsbyChannel, getMappedProjectsbyChannel, JiraProjectComponentMap } from "../helpers/channelLookup";
import { getJiraDetails } from "../jiraDataLookup";
import { JiraProject } from "../shared";

@Parameters()
class JiraGetCurrentChannelMappingsParams {
    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;
}

export const findRequiredProjects = async (components: JiraProjectComponentMap[], projectIds: string[]): Promise<string[]> => {
    // Determine if the project ids are the same (so we can make just 1 query for those projects/components)
    logger.debug(`JIRA findRequiredProjects: projectIds to lookup => ${JSON.stringify(projectIds)}`);
    logger.debug(`JIRA findRequiredProjects: componentIds to lookup => ${JSON.stringify(components.filter(c => c.componentId !== null))}`);
    const projects: string[] = [];
    if (projectIds.length > 0 && components.length > 0) {
        components.map(c => {
            if (!projectIds.includes(c.projectId)) {
                projects.push(c.projectId);
            }
        });
        projectIds.forEach(p => projects.push(p));
    } else if (projectIds.length === 0) {
        components.map(c => {
            projects.push(c.projectId);
        });
    } else if (components.length === 0) {
        projectIds.forEach(p => projects.push(p));
    }

    logger.debug(`JIRA findRequiredProjects: merged projectIds to lookup => ${JSON.stringify(projects)}`);
    return projects;
};

export const lookupJiraProjectDetails = async (projectsToLookup: string[]): Promise<JiraProject[]> => {
    // Lookup JIRA details
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const projectDetails: JiraProject[] = [];
    await Promise.all(projectsToLookup.map(async p => {
            const lookupUrl = `${jiraConfig.url}/rest/api/2/project/${p}`;
            const localProjectDetails = await getJiraDetails<JiraProject>(lookupUrl, true);
            projectDetails.push(localProjectDetails);
    }));

    return projectDetails;
};

export const prepareFriendlyComponentNames = async (components: JiraProjectComponentMap[], projectDetails: JiraProject[]): Promise<string[]> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const returnComponents: string[] = [];
    const baseComponentUrl = `${jiraConfig.url}/projects`;
    const componentSuffix = `?selectedItem=com.atlassian.jira.jira-projects-plugin:components-page`;
    components.map(c => {
        try {
            const project = projectDetails.filter(p => p.id === c.projectId)[0];
            const projectName = project.name;
            const componentName = project.components.filter(comp => comp.id === c.componentId)[0].name;
            const componentUrl = `${baseComponentUrl}/${project.key}${componentSuffix}`;
            const projectUrl = `${baseComponentUrl}/${project.key}/issues`;
            returnComponents.push(`${slack.url(projectUrl, projectName)}/${slack.url(componentUrl, componentName)}`);
        } catch {
           logger.warn(`Couldn't resolve details for component ${c.componentId}`);
        }
    });

    if (returnComponents.length === 0) {
        returnComponents.push("N/A");
    }

    return returnComponents;
};

export const prepareFriendProjectNames = async (projects: JiraProject[]): Promise<string[]> => {
    const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
    const returnProjects: string[] =  [];
    const baseComponentUrl = `${jiraConfig.url}/projects`;
    projects.forEach(p => {
        const projectUrl = `${baseComponentUrl}/${p.key}/issues`;
        returnProjects.push(`${slack.url(projectUrl, p.name)}`);
    });

    return returnProjects;
};

export function getCurrentChannelMappings(ci: CommandListenerInvocation<JiraGetCurrentChannelMappingsParams>): Promise<HandlerResult> {
    return new Promise<HandlerResult>(async (resolve, reject) => {
        // Get current channel projects
        try {
            const projects = await getMappedProjectsbyChannel(ci.context, ci.parameters.slackChannelName);
            logger.debug(`JIRA getCurrentChannelMappings: found projects ${JSON.stringify(projects)} - ${projects.length}`);

            // Get current components
            const components = await getMappedComponentsbyChannel(ci.context, ci.parameters.slackChannelName);
            const projectsToLookup = await findRequiredProjects(components, projects);
            const projectDetails = await lookupJiraProjectDetails(projectsToLookup);

            // Prepare message
            const componentMapped = await prepareFriendlyComponentNames(components, projectDetails);
            const projectMapped = await prepareFriendProjectNames(projectDetails);

            const message: slack.SlackMessage = {
                attachments: [
                    {
                        fallback: `Current JIRA Project/Component Mapping Infomation`,
                        pretext: `Current JIRA Project/Component Mapping Information`,
                        color: "#45B254",
                        fields: [
                            {
                                title: `Projects`,
                                value: projects.length === 0 ? "N/A" : projectMapped.join("\n"),
                                short: true,
                            },
                            {
                                title: `Components`,
                                value: componentMapped.join("\n"),
                                short: true,
                            },
                        ],
                        ts: slackTs(),
                    },
                    {
                        fallback: `All projects/components listed above are currently displaying notices in this channel.`,
                        text: `All projects/components listed above are currently displaying notices in this channel.`,
                        color: "#45B254",
                        actions: [
                            buttonForCommand({ text: "Disable Component"}, "DisableComponentChannelMapping"),
                            buttonForCommand( { text: "Disable Project"}, "RemoveChannelProjectMapping", { enabled: "false"}),
                        ],
                        ts: slackTs(),
                    },
                ],

            };

            logger.debug(`JIRA getCurrentChannelMappings: component detail => ${JSON.stringify(componentMapped)}`);
            logger.debug(`JIRA getCurrentChannelMappings: project detail => ${JSON.stringify(projectDetails)}`);

            await ci.addressChannels(message);
            resolve({ code: 0 });
        } catch (e) {
            logger.error(`JIRA getCurrentChannelMappings: Failed to lookup mappings! Error => ${e}`);
            reject({
                code: 1,
                message: e,
            });
        }
    });
}

export const getCurrentChannelMappingsReg: CommandHandlerRegistration<JiraGetCurrentChannelMappingsParams> = {
    name: "GetCurrentChannelMappings",
    description: "Create a mapping between a JIRA Component ID and a Chat channel",
    intent: "jira mappings",
    paramsMaker: JiraGetCurrentChannelMappingsParams,
    listener: getCurrentChannelMappings,
};
