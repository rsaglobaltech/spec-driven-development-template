import { HttpAlmClient } from "./http-client";
import type {
  AlmCapabilities,
  AlmConfig,
  AlmProvider,
  FetchLike,
  IssueRef,
  IssueStatus,
  IssueSummary,
} from "../port";

/** The slices of Jira's REST responses this connector reads. */
interface JiraIssue {
  readonly key: string;
}
interface JiraStatusResponse {
  readonly fields?: { readonly status?: { readonly statusCategory?: { readonly key?: string } } };
}
interface JiraTransition {
  readonly id: string;
  readonly to?: { readonly statusCategory?: { readonly key?: string } };
}
interface JiraTransitions {
  readonly transitions?: readonly JiraTransition[];
}
interface JiraSearchResult {
  readonly issues?: readonly {
    readonly key: string;
    readonly fields?: { readonly summary?: string; readonly description?: unknown };
  }[];
}

/**
 * Jira Cloud.
 *
 * "Done" is not a state here, it is a *category*: Jira's workflows are
 * per-project, so the only portable question is whether the current status
 * belongs to the `done` category, and the only portable way to close is to
 * find a transition that leads to one. That is why this provider declares no
 * `done_state` — configuring one would be read by nobody.
 */
class JiraClient extends HttpAlmClient {
  readonly capabilities: AlmCapabilities = {
    create: true,
    readStatus: true,
    close: true,
    listIssues: true,
  };

  private readonly headers: Readonly<Record<string, string>>;
  private readonly projectKey: string;
  private readonly issueType: string;

  constructor(cfg: AlmConfig, fetchImpl?: FetchLike) {
    super(cfg, fetchImpl);
    const token = HttpAlmClient.requireEnv(cfg.token_env);
    // Jira Cloud's Basic auth pairs the token with an account email, and
    // $JIRA_USER is the conventional home for it.
    const user = HttpAlmClient.requireEnv(cfg.user_env ?? "JIRA_USER");
    this.headers = {
      Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
    this.projectKey = String(cfg.project_key ?? "");
    this.issueType = cfg.issue_type ?? "Task";
  }

  async createIssue(reqId: string, title: string): Promise<IssueRef> {
    const created = await this.requestJson<JiraIssue>(
      "/rest/api/3/issue",
      `Jira create issue for ${reqId}`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          fields: {
            project: { key: this.projectKey },
            issuetype: { name: this.issueType },
            summary: `${reqId} — ${title}`,
            labels: ["spec-driven", reqId],
          },
        }),
      }
    );
    return { key: created.key, url: `${this.baseUrl}/browse/${created.key}` };
  }

  async getIssueStatus(issueKey: string): Promise<IssueStatus> {
    const issue = await this.requestJson<JiraStatusResponse>(
      `/rest/api/3/issue/${issueKey}?fields=status`,
      `Jira read ${issueKey}`,
      { headers: this.headers }
    );
    return issue.fields?.status?.statusCategory?.key === "done" ? "done" : "open";
  }

  /**
   * Open issues carrying a label, via JQL.
   *
   * The project is pinned as well as the label: a label is global in Jira, so
   * searching on it alone reaches across every project the credential can see.
   *
   * Jira Cloud returns `description` as Atlassian Document Format — a document
   * tree, not a string — so the text is flattened out of it. A body that does
   * not flatten comes back empty rather than as `[object Object]`.
   */
  async listIssues(label: string): Promise<IssueSummary[]> {
    const jql = `project = "${this.projectKey}" AND labels = "${label}" AND statusCategory != Done`;
    const result = await this.requestJson<JiraSearchResult>(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,description&maxResults=100`,
      `Jira search for issues labelled ${label}`,
      { headers: this.headers }
    );
    return (result.issues ?? []).map((issue) => ({
      key: issue.key,
      title: String(issue.fields?.summary ?? ""),
      body: flattenAdf(issue.fields?.description),
      url: `${this.baseUrl}/browse/${issue.key}`,
    }));
  }

  async closeIssue(issueKey: string): Promise<void> {
    const transition = await this.findDoneTransition(issueKey);
    await this.request(`/rest/api/3/issue/${issueKey}/transitions`, `Jira transition ${issueKey}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ transition: { id: transition.id } }),
    });
  }

  /** The workflow decides which transition means done; there may be none. */
  private async findDoneTransition(issueKey: string): Promise<JiraTransition> {
    const { transitions } = await this.requestJson<JiraTransitions>(
      `/rest/api/3/issue/${issueKey}/transitions`,
      `Jira list transitions for ${issueKey}`,
      { headers: this.headers }
    );
    const done = (transitions ?? []).find((t) => t.to?.statusCategory?.key === "done");
    if (!done) {
      throw new Error(`Jira: no transition to a done state available for ${issueKey}.`);
    }
    return done;
  }
}

/**
 * The plain text inside an Atlassian Document Format value.
 *
 * ADF nests content nodes arbitrarily; only the `text` leaves matter here, and
 * a shape this does not recognise yields "" rather than a stringified object.
 */
function flattenAdf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((child) => flattenAdf(child))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export const jiraProvider: AlmProvider = {
  id: "jira",
  label: "Jira Cloud",
  config: {
    required: ["base_url", "project_key", "token_env"],
    // Optional because $JIRA_USER is the conventional default. Naming the
    // variable in the config is better, not compulsory.
    optional: ["user_env", "issue_type"],
  },
  capabilities: { create: true, readStatus: true, close: true, listIssues: true },
  create: (cfg, fetchImpl) => new JiraClient(cfg, fetchImpl),
};

export default jiraProvider;
