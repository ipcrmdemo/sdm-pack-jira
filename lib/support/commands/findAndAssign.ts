import {
    buttonForCommand,
    configurationValue,
    HandlerResult,
    logger,
    MappedParameters, QueryNoCacheOptions,
} from "@atomist/automation-client";
import {Option} from "@atomist/automation-client/lib/metadata/automationMetadata";
import {
    CommandHandlerRegistration,
    CommandListenerInvocation, CredentialsResolver,
    DeclarationType,
    ParametersDefinition,
    ProjectLoader, RepoRefResolver,
    resolveCredentialsPromise, SdmContext, slackErrorMessage,
    slackSuccessMessage,
} from "@atomist/sdm";
import {SlackMessage, url} from "@atomist/slack-messages";
import {JiraConfig} from "../../jira";
import * as types from "../../typings/types";
import {convertEmailtoJiraUser} from "../shared";
import {createJiraResource, JiraQueryLanguageIssueResults, prepProjectSelect, searchIssues} from "./shared";

const JiraCreateBranchParams: ParametersDefinition = {
    repoRefResolver: {
        path: "sdm.repoRefResolver",
    },
    credentialResolver: {
        path: "sdm.credentialsResolver",
    },
    repo: {
        uri: MappedParameters.GitHubRepository,
        required: true,
        declarationType: DeclarationType.Mapped,
    },
    owner: {
        uri: MappedParameters.GitHubOwner,
        required: true,
        declarationType: DeclarationType.Mapped,
    },
    branch: {
        required: true,
        displayName: `Name of the branch to create (Should be ISSUEKEY-description)`,
        description: `Name of the branch to create (Should be ISSUEKEY-description)`,
    },
};
const JiraFindAndAssignParams: ParametersDefinition = {
    project: {
        displayName: "Please select a JIRA project to search for issues",
        description: "Please select a JIRA project to search for issues",
        pattern: /^[a-zA-Z0-9\-_]{0,10}$/,
    },
    screenName: {
        uri: MappedParameters.SlackUserName,
        required: false,
        declarationType: DeclarationType.Mapped,
    },
};

export async function jiraFindAndAssign(ci: CommandListenerInvocation<{project: string, screenName: string}>): Promise<HandlerResult> {
    const jiraConfig = configurationValue<object>("sdm.jira") as JiraConfig;

    // Present list of projects
    const projectValues = await prepProjectSelect(ci.parameters.project, ci);
    if (projectValues) {
        let issues: JiraQueryLanguageIssueResults;
        const projectKey = await ci.promptFor<{ key: string }>({
            key: {
                displayName: `Please select a project`,
                description: `Please select a project`,
                type: {
                    kind: "single",
                    options: projectValues,
                },
            },
        });

        try {
            issues = await searchIssues(`project=${projectKey.key}+AND+assignee=null+AND+status!=Closed`, undefined, undefined, ci);
            if (!(issues.issues.length > 0)) {
                throw new Error("No issues found!");
            }
        } catch (e) {
            logger.debug(`jiraFindAndAssign: Issue searching issues => ${e})`);
            // If we don't find any issues there is an exception raised b/c of the response code
            const message: SlackMessage = {
                attachments: [
                    {
                        fallback: `No issues found`,
                        text: `No Issues found!`,
                        actions: [
                            buttonForCommand({ text: "Retry Search" }, "JiraFindAndAssign"),
                        ],
                    },
                ],
            };
            await ci.addressChannels(message);
            return {
                code: 1,
                message: `No issues found`,
            };
        }

        const issueOptions: Option[] = [];
        issues.issues.forEach(i => {
            issueOptions.push({
                description: i.fields.summary,
                value: i.key,
            });
        });

        // TODO: Insert a select issue dropdown that prompts with full summary and an accept/re-search button
        const myIssue = await ci.promptFor<{ issue: string }>({
            issue: {
                displayName: `Please select an issue to assign`,
                description: `Please select an issue to assign`,
                type: {
                    kind: "single",
                    options: issueOptions,
                },
            },
        });

        // Lookup requester
        let realRequester: string;
        const requester = await ci.context.graphClient.query<types.GetEmailByChatId.Query, types.GetEmailByChatId.Variables>({
            name: "GetEmailByChatId",
            variables: { screenName: ci.parameters.screenName },
        });

        if ( requester &&
            requester.hasOwnProperty("ChatId") &&
            requester.ChatId.length > 0 &&
            requester.ChatId[0].person.emails.length > 0
        ) {
            // Try to find requester
            await Promise.all(requester.ChatId[0].person.emails.map(async e => {
                const res = await convertEmailtoJiraUser(e.address);
                if (res) {
                    realRequester = res;
                }
            }));
        }

        // TODO: Fail if not found
        const issueOwner = realRequester ? realRequester : jiraConfig.user;
        await createJiraResource(
            `${jiraConfig.url}/rest/api/2/issue/${myIssue.issue}/assignee`,
            {name: issueOwner},
            true,
            ci,
        );

        const scmId = await ci.context.graphClient.query<types.GetPersonByChatId.Query, types.GetPersonByChatId.Variables>({
            name: "GetPersonByChatId",
            variables: {chatId: `${ci.context.workspaceId}_${ci.context.source.slack.user.id}`},
            options: QueryNoCacheOptions,
        });

        const branchName = scmId.Person[0].scmId.login;
        const responseMsg: SlackMessage = {
            attachments: [
                {
                    fallback: `JIRA Issue ${url(`${jiraConfig.url}/browse/${myIssue.issue}`, myIssue.issue)} Assigned to you`,
                    text: `JIRA Issue ${url(`${jiraConfig.url}/browse/${myIssue.issue}`, myIssue.issue)} Assigned to you`,
                    actions: [
                        buttonForCommand({ text: "Create branch" }, "JiraCreateProjectBranch", {
                            branch: `${myIssue.issue}-${branchName}`,
                        }),
                    ],
                },
            ],
        };
        await ci.addressChannels(responseMsg, {id: `createBranch/${myIssue.issue}-${branchName}`});
        return {
            code: 0,
        };
    } else {
        await ci.addressChannels({
            attachments: [
                {
                    fallback: `Error: No projects found with search term [${ci.parameters.project}]`,
                    text: `Error: No projects found with search term [${ci.parameters.project}]`,
                    actions: [
                        buttonForCommand({ text: "Retry Search" }, "JiraFindAndAssign"),
                    ],
                },
                ],
            },
        );
        return {code: 0};
    }
}

export const jiraFindAndAssignReg: CommandHandlerRegistration<{project: string, screenName: string}> = {
    name: "JiraFindAndAssign",
    parameters: JiraFindAndAssignParams,
    listener: jiraFindAndAssign,
    intent: "jira findAndAssign",
    autoSubmit: true,
};

export async function jiraCreateProjectBranch(ci: CommandListenerInvocation<{
    owner: string, repo: string, branch: string, repoRefResolver: RepoRefResolver, credentialResolver: CredentialsResolver}>,
): Promise<HandlerResult> {
    const repo = await ci.context.graphClient.query<types.GetRepoByOwnerName.Query, types.GetRepoByOwnerName.Variables>({
        name: "GetRepoByOwnerName",
        variables: {name: ci.parameters.repo, owner: ci.parameters.owner},
        options: QueryNoCacheOptions,
    });

    const repoRef = ci.parameters.repoRefResolver.toRemoteRepoRef(repo.Repo[0], {});
    await configurationValue<ProjectLoader>("sdm.projectLoader").doWithProject({
        credentials: await resolveCredentialsPromise(ci.parameters.credentialResolver.commandHandlerCredentials(ci.context)),
        id: repoRef,
        readOnly: true,
    }, async p => {
        await p.createBranch(ci.parameters.branch);
        await p.checkout(ci.parameters.branch);
        await p.push();
        await ci.addressChannels(slackSuccessMessage(
            `Created branch!`,
            `Created new branch ${ci.parameters.branch} successfully!`,
        ), {id: `createBranch/${ci.parameters.branch}`});
    });
    return {
        code: 0,
    };
}

export const jiraCreateProjectBranchReg: CommandHandlerRegistration<{
    repo: string, owner: string, branch: string, repoRefResolver: RepoRefResolver, credentialResolver: CredentialsResolver}> = {
    name: "JiraCreateProjectBranch",
    parameters: JiraCreateBranchParams,
    listener: jiraCreateProjectBranch,
    autoSubmit: true,
};
