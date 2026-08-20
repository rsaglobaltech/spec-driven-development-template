import { HttpAlmClient } from "./http-client";
import type {
  AlmCapabilities,
  AlmConfig,
  AlmProvider,
  FetchLike,
  IssueRef,
  IssueStatus,
} from "../port";

/** The slices of Azure's work-item responses this connector reads. */
interface AzureWorkItem {
  readonly id: number | string;
  readonly _links?: { readonly html?: { readonly href?: string } };
  readonly fields?: Readonly<Record<string, string>>;
}

/** States the shipped Azure templates use for a finished work item. */
const DONE_STATES: readonly string[] = ["Done", "Closed", "Completed", "Resolved"];

const API_VERSION = "api-version=7.1";

/**
 * Azure Boards work items.
 *
 * The inverse of Jira: `System.State` is a plain field, so closing is a write
 * rather than a transition search, and the target state is configurable —
 * which is why this provider, and only this one, declares `done_state`.
 */
class AzureClient extends HttpAlmClient {
  readonly capabilities: AlmCapabilities = { create: true, readStatus: true, close: true };

  private readonly authorization: string;
  private readonly projectKey: string;
  private readonly issueType: string;
  private readonly doneState: string;

  constructor(cfg: AlmConfig, fetchImpl?: FetchLike) {
    super(cfg, fetchImpl);
    const token = HttpAlmClient.requireEnv(cfg.token_env);
    this.authorization = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
    this.projectKey = String(cfg.project_key ?? "");
    this.issueType = cfg.issue_type ?? "Task";
    this.doneState = cfg.done_state ?? "Done";
  }

  /** Work-item writes are JSON Patch; reads are not. */
  private patchHeaders(): Record<string, string> {
    return { Authorization: this.authorization, "Content-Type": "application/json-patch+json" };
  }

  async createIssue(reqId: string, title: string): Promise<IssueRef> {
    const path =
      `/${this.projectKey}/_apis/wit/workitems/` +
      `$${encodeURIComponent(this.issueType)}?${API_VERSION}`;

    const created = await this.requestJson<AzureWorkItem>(
      path,
      `Azure create work item for ${reqId}`,
      {
        method: "POST",
        headers: this.patchHeaders(),
        body: JSON.stringify([
          { op: "add", path: "/fields/System.Title", value: `${reqId} — ${title}` },
          { op: "add", path: "/fields/System.Tags", value: `spec-driven; ${reqId}` },
        ]),
      }
    );
    return { key: String(created.id), url: created._links?.html?.href ?? null };
  }

  async getIssueStatus(issueKey: string): Promise<IssueStatus> {
    const item = await this.requestJson<AzureWorkItem>(
      `/_apis/wit/workitems/${issueKey}?fields=System.State&${API_VERSION}`,
      `Azure read work item ${issueKey}`,
      { headers: { Authorization: this.authorization } }
    );
    const state = item.fields?.["System.State"];
    return state !== undefined && DONE_STATES.includes(state) ? "done" : "open";
  }

  async closeIssue(issueKey: string): Promise<void> {
    await this.request(
      `/_apis/wit/workitems/${issueKey}?${API_VERSION}`,
      `Azure close work item ${issueKey}`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify([{ op: "add", path: "/fields/System.State", value: this.doneState }]),
      }
    );
  }
}

export const azureProvider: AlmProvider = {
  id: "azure",
  label: "Azure Boards",
  config: {
    required: ["base_url", "project_key", "token_env"],
    optional: ["issue_type", "done_state"],
  },
  capabilities: { create: true, readStatus: true, close: true },
  create: (cfg, fetchImpl) => new AzureClient(cfg, fetchImpl),
};

export default azureProvider;
