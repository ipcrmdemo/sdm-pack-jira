import { GoalWithFulfillment, IndependentOfEnvironment, SdmGoalState, slackErrorMessage } from "@atomist/sdm";
import { createJiraTicket } from "../support/helpers/createJiraTicket";

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
            `[atomist:sha:${gi.id.sha}]`,
            `[atomist:owner:${gi.id.owner}]`,
            `[atomist:repo:${gi.id.repo}]`,
            `[atomist:branch:${gi.id.branch}]`,
        ];

        const data = {
            fields: {
                description: `Requesting approval to deploy version ${gi.sdmGoal.version} (${gi.id.sha})\n${enviornmentData.join("\n")}`,
                project: {
                    key: project,
                },
                parent: {
                    key: issue,
                },
                summary: `Deployment Approval requested for version: ${gi.sdmGoal.version} (${gi.id.sha})}`,
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
            data: result.id,
        };
    },
});
