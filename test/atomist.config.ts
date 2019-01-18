/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    Configuration,
    GraphQL,
} from "@atomist/automation-client";
import {
    allSatisfied,
    goals,
    onAnyPush,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import {
    DockerBuild,
} from "@atomist/sdm-pack-docker";
import { KubernetesDeploy } from "@atomist/sdm-pack-k8";
import {
    IsMaven,
    MvnPackage,
    MvnVersion,
} from "@atomist/sdm-pack-spring";
import { onJiraIssueEventApproval } from "../lib/event/onJiraIssueEvent";
import { JiraApproval } from "../lib/goals/JiraApproval";
import { jiraSupport } from "../lib/jira";

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
    );
    const dockerBuild = new DockerBuild()
    .with({
        options: { push: true, ...sdm.configuration.sdm.dockerinfo },
        pushTest: allSatisfied(IsMaven),
    })
    .withProjectListener(MvnVersion)
    .withProjectListener(MvnPackage);

    const k8sStagingDeploy = new KubernetesDeploy({ environment: "testing", approval: true });
    const k8sDeployGoals = goals("deploy")
        .plan(k8sStagingDeploy).after(dockerBuild, JiraApproval);

    sdm.addExtensionPacks(
        jiraSupport(),
    );
    sdm.addEvent(onJiraIssueEventApproval(JiraApproval));

    sdm.withPushRules(
        // onAnyPush()
        //     .setGoals(dockerBuild),
        onAnyPush()
            .setGoals(JiraApproval),
        onAnyPush()
            .setGoals(k8sDeployGoals),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
