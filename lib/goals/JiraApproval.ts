import { GoalWithFulfillment, IndependentOfEnvironment, SdmGoalState, slackErrorMessage } from "@atomist/sdm";
import { createJiraTicket } from "../support/helpers/createJiraTicket";
import { readSdmVersion } from "@atomist/sdm-core";

export const JiraApproval = new GoalWithFulfillment({
    uniqueName: "jiraApprovalGoal",
    displayName: "Approval Goal",
    environment: IndependentOfEnvironment,
    inProcessDescription: "Awaiting ticket sign-off",
    successDescription: "Approved",
}).with({
    name: "jiraApprovalGoalFulfillment",
    goalExecutor: async gi => {
        // Read Commit message and determine if issue is present(or fail goal)
        const issue = /((?<!([A-Z]{1,10})-?)[A-Z]+-\d+)/gm.exec(gi.sdmGoal.push.commits[0].message)[1];
        const project = issue.split("-")[0];
        if (!issue) {
            gi.addressChannels(slackErrorMessage(
                `JIRA: No Issue Link found in commit`,
                `You must supply an issue key in your commit message.`,
                gi.context,
            ));
            return {
                state: SdmGoalState.failure,
                description: gi.goal.failureDescription,
            };
        }

        const enviornmentData = [
            `[atomist:generated]`,
            `[atomist:sha:${gi.id.sha}]`,
            `[atomist:owner:${gi.id.owner}]`,
            `[atomist:repo:${gi.id.repo}]`,
            `[atomist:branch:${gi.id.branch}]`,
        ];

        const newVersion = await readSdmVersion(
            gi.goalEvent.repo.owner,
            gi.goalEvent.repo.name,
            gi.goalEvent.repo.providerId,
            gi.goalEvent.sha,
            gi.goalEvent.branch,
            gi.context,
        );

        const data = {
            fields: {
                description: `[${gi.id.repo}] Requesting approval to deploy version ${newVersion} (${gi.id.sha})` +
                    `\n\n\n${enviornmentData.join("\n")}`,
                project: {
                    key: project,
                },
                parent: {
                    key: issue,
                },
                summary: `[${gi.id.repo}] Requesting approval to deploy version ${newVersion}`,
                issuetype: {
                    name: "Sub-task",
                },
            },
        };
        // Open JIRA Subtask for approval
        // In env field
        // [atomist:sha:]
        // [atomist:owner:]
        // [atomist:repo:]
        // [atomist:branch:]
        const result = await createJiraTicket(data);

        return {
            state: SdmGoalState.in_process,
            description: gi.goal.inProcessDescription,
            data: result.id,
        };
    },
});
