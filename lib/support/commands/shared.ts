import * as types from "../../typings/types";

export interface JiraProject {
    id: string;
    key: string;
    name: string;
    self: string;
    components: types.OnJiraIssueEvent.Components[];
}
