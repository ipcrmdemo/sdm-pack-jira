import { configurationValue, GitHubRepoRef, GraphQL, logger, OnEvent, Success } from "@atomist/automation-client";
import { EventHandlerRegistration, findSdmGoalOnCommit, Goal, SdmGoalState, updateGoal } from "@atomist/sdm";
import { JiraConfig } from "../jira";
import { getJiraDetails } from "../support/jiraDataLookup";
import * as jiraTypes from "../support/jiraDefs";
import * as types from "../typings/types";

/**
 * This event handler is used in conjunction with the JiraApproval goal.  Given an issue created with the JiraApproval goal, this
 * handler searches the description of the issue for specific markers and provided they are there and the issue state is approved,
 * this event handler will set the approval goal to success.
 *
 * @param {Goal} goal
 */
export const onJiraIssueEventApprovalHandler = (goal: Goal): OnEvent<types.OnJiraIssueEvent.Subscription> => {
    return async (e, ctx) => {
        const event =  e.data.JiraIssue[0];

        // Some events are sent with null values - throw those out
        if (event.issue === null || event.issue.self === null) {
            return Success;
        }
        const issue = await getJiraDetails<jiraTypes.Issue>(event.issue.self + "?expand=changelog", true, 30);

        // Validate new state is approved (only process if this issue is a state change)
        if (
            event.webhookEvent !== "jira:issue_updated" ||
            !event.issue_event_type_name.match(/^(issue_generic|issue_updated|issue_assigned)$/) ||
            issue.changelog === null
        ) {
            logger.info(`JIRA onJiraIssueEventApprovalHandler: Not searching for approval, wrong event type.`);
            return Success;
        }

        // Search environment for tags
        let sha: string;
        let owner: string;
        let repo: string;
        let branch: string;
        try {
            sha = /\[atomist:sha:(.*)\]/gm.exec(issue.fields.description)[1];
            owner = /\[atomist:owner:(.*)\]/gm.exec(issue.fields.description)[1];
            repo = /\[atomist:repo:(.*)\]/gm.exec(issue.fields.description)[1];
            branch = /\[atomist:branch:(.*)\]/gm.exec(issue.fields.description)[1];
        } catch (e) {
            logger.info(`JIRA onJiraIssueEventApprovalHandler: No environment data found on issue, skipping event...`);
            return Success;
        }

        // Get new status
        const status = issue.changelog.histories.slice(-1)[0].items.filter(c => c.field === "status");
        logger.info(`JIRA onJiraIssueEventApprovalHandler: New status => ${JSON.stringify(status)}`);
        // TODO: Make the 'status' required configuration
        if (status[0].toString === "Done") {
            const repoRef = GitHubRepoRef.from({
                owner,
                repo,
                sha,
                branch,
            });

            const sdmGoalData =
                await ctx.graphClient.query<types.GetGoalByJiraIssueId.Query, types.GetGoalByJiraIssueId.Variables>({
                    name: "GetGoalByJiraIssueId",
                    variables: { issueId: e.data.JiraIssue[0].issue.id },
                });

            if (!(sdmGoalData.SdmGoal.length > 0)) {
                logger.info(`JIRA onJiraIssueEventApprovalHandler: No matching goal found for this issue, skipping...`);
                return Success;
            }

            const sdmGoal = await findSdmGoalOnCommit(
                ctx,
                repoRef,
                sdmGoalData.SdmGoal[0].repo.providerId,
                goal,
            );

            // Set goal state to succesful
            const jiraConfig = configurationValue<JiraConfig>("sdm.jira");
            await updateGoal(ctx, sdmGoal, {
                state: SdmGoalState.success,
                description: goal.successDescription,
                url: `${jiraConfig.url}/browse/${event.issue.key}`,
            });

            // TODO: Update JIRA ticket?
            return Success;
        } else {
            return Success;
        }
    };
};

export const onJiraIssueEventApproval = (goal: Goal):
    EventHandlerRegistration<types.OnJiraIssueEvent.Subscription> => {
    return {
        name: "OnJiraIssueEventApproval",
        subscription: GraphQL.subscription("OnJiraIssueEvent"),
        listener: onJiraIssueEventApprovalHandler(goal),
    };
};
