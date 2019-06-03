import {configurationValue} from "@atomist/automation-client";
import { GoalWithFulfillment, IndependentOfEnvironment, SdmGoalState, slackErrorMessage } from "@atomist/sdm";
import { readSdmVersion } from "@atomist/sdm-core";
import {JiraConfig} from "../jira";
import {createJiraTicket} from "../support/commands/shared";
import {convertEmailtoJiraUser} from "../support/shared";

/**
 * The JIRA Approval goal allows you to insert an approval goal into a goal set.  The workflow is that when the goal
 * is scheduled it will execute and create a new sub-issue.  It determines where to create the sub-issue by reading the
 * JIRA issue from the commit message of the push that started the goal set.  IF there is NOT a issue key in the commit message
 * this goal will fail and print a notification that it's missing an issue key.  Once the issue is approved, there is another event
 * handler (onJiraIssueEventApproval) that will parse the incoming message and if the issue was approved (set to Done) set this goal status
 * to success.
 */
export const JiraApproval = new GoalWithFulfillment({
    uniqueName: "jiraApprovalGoal",
    displayName: "Approval Goal",
    environment: IndependentOfEnvironment,
    workingDescription: "Awaiting ticket sign-off",
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

        // Try to find requester
        let realRequester: string;
        await Promise.all(gi.goalEvent.push.after.committer.person.emails.map(async e => {
            const res = await convertEmailtoJiraUser(e.address);
            if (res) {
                realRequester = res;
            }
        }));

        // TODO: Allow customization of the description and summary fields
        let data = {
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

        if (realRequester) {
            data = {
                ...data,
                ...{
                    reporter: {
                        name: realRequester,
                    },
                },
            };
        }

        // Open JIRA Subtask for approval
        // In body
        // [atomist:sha:]
        // [atomist:owner:]
        // [atomist:repo:]
        // [atomist:branch:]
        const result = await createJiraTicket(data);

        const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
        return {
            state: SdmGoalState.in_process,
            description: gi.goal.inProcessDescription,
            data: result.id,
            externalUrls: [
                {label: result.key, url: `${jiraConfig.url}/browse/${result.key}`},
            ],
        };
    },
});
