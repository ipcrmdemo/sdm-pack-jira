import { GoalWithFulfillment, IndependentOfEnvironment, SdmGoalState, slackErrorMessage } from "@atomist/sdm";
import { readSdmVersion } from "@atomist/sdm-core";
import {createJiraTicket} from "../support/commands/shared";

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
        const match = /((?<!([A-Z]{1,10})-?)[A-Z]+-\d+)/gm.exec(gi.goalEvent.push.commits[0].message);
        let issue: string;
        if (match) {
            issue = match[1];
        } else {
            await gi.addressChannels(slackErrorMessage(
                `JIRA: Approval Goal => No Issue Link found in commit`,
                `You must supply an issue key in your commit message in order to setup a new approval request.`,
                gi.context,
            ));
            return {
                state: SdmGoalState.failure,
                description: gi.goal.failureDescription,
            };
        }

        const project = issue.split("-")[0];
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

        // TODO: Add lookup for the reporter from the committer id
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
        // In body
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
