import type {
  AlmCapabilities,
  AlmClient,
  AlmConfig,
  FetchLike,
  HttpResponse,
  IssueRef,
  IssueStatus,
} from "../port";

/**
 * What every HTTP-backed ALM connector shares: a credential read from the
 * environment, a base URL that does not grow a doubled slash, and a refusal to
 * carry on past a failed response.
 *
 * Credentials come from environment variables named in `alm.config.yaml` —
 * never from the file itself, which is committed.
 */
export abstract class HttpAlmClient implements AlmClient {
  abstract readonly capabilities: AlmCapabilities;

  protected readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  protected constructor(cfg: AlmConfig, fetchImpl?: FetchLike) {
    // A trailing slash in the config is invisible until it produces
    // `https://host//rest/api` against a real server, so it is stripped once,
    // here, rather than in each provider's URL building.
    this.baseUrl = String(cfg.base_url ?? "").replace(/\/$/, "");
    this.fetchImpl = fetchImpl ?? ((globalThis as { fetch: FetchLike }).fetch as FetchLike);
  }

  abstract createIssue(reqId: string, title: string): Promise<IssueRef>;
  abstract getIssueStatus(issueKey: string): Promise<IssueStatus>;
  abstract closeIssue(issueKey: string): Promise<void>;

  /** Read a credential, naming the variable and how to set it when it is absent. */
  protected static requireEnv(name: string | undefined): string {
    const value = name ? process.env[name] : undefined;
    if (!value) {
      throw new Error(
        `Environment variable ${name ?? "(unnamed)"} is not set.\n` +
          "Fix: export the ALM API token in that variable (CI: a masked secret)."
      );
    }
    return value;
  }

  /** Perform a request and fail loudly, with the server's own words, when it is refused. */
  protected async request(
    path: string,
    what: string,
    init?: Record<string, unknown>
  ): Promise<HttpResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${what} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    return res;
  }

  /** The same, returning the parsed body, which is what every caller wants. */
  protected async requestJson<T>(
    path: string,
    what: string,
    init?: Record<string, unknown>
  ): Promise<T> {
    const res = await this.request(path, what, init);
    return (await res.json()) as T;
  }
}
