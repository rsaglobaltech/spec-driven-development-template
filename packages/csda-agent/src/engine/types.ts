/**
 * The engine boundary.
 *
 * Everything the TUI paints comes from an `AgentEvent`. The TUI never imports
 * the Agent SDK, never sees an `SDKMessage`, and cannot tell which engine is
 * behind it. That is the one architectural decision this package has to get
 * right on day one: swapping the engine — for a raw Messages API loop, or for
 * a scripted engine in tests — must not touch a single line of rendering code.
 *
 * The event set is deliberately small. It is the vocabulary of a coding agent
 * as a *user* experiences it, not a faithful mirror of the SDK's ~35 message
 * types. Anything the user cannot see or act on does not belong here.
 */

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";

export interface UsageSnapshot {
  /** Tokens billed at full price this session. */
  inputTokens: number;
  outputTokens: number;
  /** Served from the prompt cache — the number that says whether caching works. */
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Accumulated cost in USD, when the engine can report it. */
  costUsd: number | null;
  /** Model actually serving the session, as reported by the engine. */
  model: string | null;
  /** Wall-clock of the last completed turn. */
  lastTurnMs: number | null;
}

export const emptyUsage = (): UsageSnapshot => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: null,
  model: null,
  lastTurnMs: null,
});

/**
 * The answer to a permission prompt.
 *
 * `allowAlways` is separate from `allow` because persisting a rule is a
 * different decision from letting one call through, and conflating them is how
 * a permission system quietly stops being one.
 */
export type PermissionAnswer =
  | { decision: "allow" }
  | { decision: "allowAlways" }
  | { decision: "deny"; message?: string };

export interface TurnInput {
  /** What the user typed. */
  prompt: string;
  /** Resume a previous session id, when the engine supports it. */
  resume?: string;
}

export type AgentEvent =
  /** The engine is ready; carries what it discovered about the session. */
  | { type: "session_start"; sessionId: string | null; model: string | null; tools: string[]; cwd: string | null }
  /** Incremental assistant text. The TUI buffers these; it does not repaint per token. */
  | { type: "text_delta"; text: string }
  /** A complete assistant message arrived (authoritative over accumulated deltas). */
  | { type: "text_complete"; text: string }
  /** The model started thinking. Carries no content — it is a progress signal. */
  | { type: "thinking_start" }
  /** A tool is about to run. */
  | { type: "tool_start"; id: string; name: string; input: unknown }
  /** A tool finished. `preview` is already truncated for display. */
  | { type: "tool_end"; id: string; ok: boolean; preview: string }
  /** The engine is waiting on a permission decision. Answer with `resolvePermission`. */
  | {
      type: "permission_request";
      id: string;
      tool: string;
      detail: string;
      /** Why the engine is asking, in one sentence. */
      reason: string;
      /** The rule that would be persisted by "always allow". */
      suggestedRule: string;
    }
  /** Context was compacted; `before` is the token count that was squeezed. */
  | { type: "compacted"; before: number | null }
  /** The turn ended. */
  | { type: "turn_end"; stopReason: string; usage: UsageSnapshot }
  /** Something went wrong. `retryable` tells the TUI whether to offer a retry. */
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface AgentEngine {
  /** A short name for the status line. */
  readonly name: string;
  /**
   * Run one turn. The returned iterable ends when the turn ends.
   *
   * Aborting the signal must abort the underlying request, not merely stop
   * consuming the iterator — a CLI whose Esc only stops painting is a CLI that
   * keeps burning tokens after the user gave up on the answer.
   */
  run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
  /** Cumulative usage for the session. */
  usage(): UsageSnapshot;
  /** Current permission mode, and how to change it. */
  permissionMode(): PermissionMode;
  setPermissionMode(mode: PermissionMode): Promise<void> | void;
  /**
   * Answer a `permission_request`. Present on engines that can ask.
   *
   * The turn is blocked until this is called — the SDK is awaiting the
   * decision — so a UI that shows the prompt must always reach an answer,
   * including on interrupt.
   */
  resolvePermission?(id: string, answer: PermissionAnswer): void;
  /** Release anything the engine is holding. */
  dispose?(): Promise<void> | void;
}

/** The order `Shift+Tab` cycles through. `bypassPermissions` is never in the cycle. */
export const PERMISSION_CYCLE: PermissionMode[] = ["default", "acceptEdits", "plan"];

export function nextPermissionMode(current: PermissionMode): PermissionMode {
  const idx = PERMISSION_CYCLE.indexOf(current);
  // An out-of-cycle mode (bypassPermissions) lands back on the safe default
  // rather than silently staying dangerous.
  if (idx === -1) return PERMISSION_CYCLE[0];
  return PERMISSION_CYCLE[(idx + 1) % PERMISSION_CYCLE.length];
}
