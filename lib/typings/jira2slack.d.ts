declare module "jira2slack" {
  /**
   * Convert JIRA markdown to Slack markdown
   *
   * @param {string} jiraMD The JIRA markdown
   * @return {string} The Slack markdown
   */
  export function toSlack(jiraMD: string): string;
  /**
   * Convert JIRA markdown to Slack markdown
   *
   * @param {string} slackMD The Slack markdown
   * @return {string} The JIRA markdown
   */
   export function toJira(slackMD: string): string;
}
