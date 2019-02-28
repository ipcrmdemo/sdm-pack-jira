export interface JiraIssueWebhook {
    timestamp: number;
    webhookEvent: string;
    issue_event_type_name: string;
    user: User;
    issue: Issue;
    comment: Comment;
    changelog: JiraChangelog;
}
export interface AvatarUrls {
    "48x48": string;
    "24x24": string;
    "16x16": string;
    "32x32": string;
}
export interface User {
    self: string;
    name: string;
    key: string;
    emailAddress: string;
    avatarUrls: AvatarUrls;
    displayName: string;
    active: boolean;
    timeZone: string;
}
export interface Issuetype {
    self: string;
    id: string;
    description: string;
    iconUrl: string;
    name: string;
    subtask: boolean;
}
export interface Project {
    self: string;
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
    avatarUrls: AvatarUrls;
    issueTypes: Issuetype[];
}
export interface FixVersion {
    self: string;
    id: string;
    name: string;
    archived: boolean;
    released: boolean;
    releaseDate: string;
}
// TODO - Fix TimeTracking
// tslint:disable-next-line:no-empty-interface
export interface Timetracking {
}
export interface Watches {
    self: string;
    watchCount: number;
    isWatching: boolean;
}
export interface Creator {
    self: string;
    name: string;
    key: string;
    emailAddress: string;
    avatarUrls: AvatarUrls;
    displayName: string;
    active: boolean;
    timeZone: string;
}
export interface StatusCategory {
    self: string;
    id: number;
    key: string;
    colorName: string;
    name: string;
}
export interface Status {
    self: string;
    description: string;
    iconUrl: string;
    name: string;
    id: string;
    statusCategory: StatusCategory;
}
export interface Priority {
    self: string;
    iconUrl: string;
    name: string;
    id: string;
}
export interface SubTaskFields {
    summary: string;
    status: Status;
    priority: Priority;
    issuetype: Issuetype;
}
export interface Subtask {
    id: string;
    key: string;
    self: string;
    fields: SubTaskFields;
}
export interface Reporter {
    self: string;
    name: string;
    key: string;
    emailAddress: string;
    avatarUrls: AvatarUrls;
    displayName: string;
    active: boolean;
    timeZone: string;
}
export interface Aggregateprogress {
    progress: number;
    total: number;
}
export interface Progress {
    progress: number;
    total: number;
}
export interface Author {
    self: string;
    name: string;
    key: string;
    emailAddress: string;
    avatarUrls: AvatarUrls;
    displayName: string;
    active: boolean;
    timeZone: string;
}
export interface Comment {
    self: string;
    id: string;
    author: Author;
    body: string;
    updateAuthor: Author;
    created: Date;
    updated: Date;
}
export interface Comments {
    comments: Comment[];
    maxResults: number;
    total: number;
    startAt: number;
}
export interface Votes {
    self: string;
    votes: number;
    hasVoted: boolean;
}
export interface Worklog {
    startAt: number;
    maxResults: number;
    total: number;
    worklogs: any[];
}
export interface Assignee {
    self: string;
    name: string;
    key: string;
    emailAddress: string;
    avatarUrls: AvatarUrls;
    displayName: string;
    active: boolean;
    timeZone: string;
}
export interface IssueParent {
    id: string;
    key: string;
    self: string;
    fields: SubTaskFields;
}
export interface Fields {
    issuetype: Issuetype;
    parent: IssueParent;
    components: any[];
    timespent?: any;
    timeoriginalestimate?: any;
    description?: any;
    project: Project;
    fixVersions: FixVersion[];
    aggregatetimespent?: any;
    resolution?: any;
    timetracking: Timetracking;
    customfield_10005: string;
    customfield_10006: number;
    attachment: any[];
    aggregatetimeestimate?: any;
    resolutiondate?: any;
    workratio: number;
    summary: string;
    lastViewed: Date;
    watches: Watches;
    creator: Creator;
    subtasks: Subtask[];
    created: Date;
    reporter: Reporter;
    customfield_10000?: any;
    aggregateprogress: Aggregateprogress;
    priority: Priority;
    customfield_10100: string;
    labels: any[];
    customfield_10004: string[];
    environment?: any;
    timeestimate?: any;
    aggregatetimeoriginalestimate?: any;
    versions: any[];
    duedate?: any;
    progress: Progress;
    comment: Comments;
    issuelinks: any[];
    votes: Votes;
    worklog: Worklog;
    assignee: Assignee;
    updated: Date;
    status: Status;
}
export interface Issue {
    id: string;
    self: string;
    key: string;
    fields: Fields;
}

export interface ChangelogItem {
    field: string;
    fieldtype: string;
    from: string;
    fromString: string;
    to: string;
    toString: string;
}

export interface JiraChangelog {
    id: string;
    items: ChangelogItem[];
}
