/**
 * The Claude Agent SDK behind the `AgentEngine` boundary.
 *
 * The SDK is Claude Code packaged as a library: it brings the agent loop, the
 * built-in file and bash tools, context management and sessions. This engine's
 * whole job is translation, and it is deliberately thin.
 *
 * The one piece of real machinery here is the permission bridge. `canUseTool`
 * is a callback the SDK *calls into* and awaits, while the TUI consumes an
 * async generator. Both feed one queue: the generator drains it, and a decision
 * arriving from the UI resolves the promise the SDK is blocked on.
 *
 * See docs/specs/adr/0015-agent-cli-engine-boundary.md.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentEngine,
  AgentEvent,
  PermissionAnswer,
  PermissionMode,
  TurnInput,
  UsageSnapshot,
} from "./types.js";
import { emptyUsage } from "./types.js";
import { newState, normalize, type NormalizeState } from "./normalize.js";
import { AsyncQueue, deferred, type Deferred } from "./queue.js";
import { evaluate, suggestRule, type Ruleset } from "../config/permissions.js";
import { emptyRuleset } from "../config/permissions.js";
import { summarizeToolInput } from "../tui/format.js";

export interface SdkEngineOptions {
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  additionalDirectories?: string[];
  maxTurns?: number;
  resume?: string;
  continueSession?: boolean;
  /** Rules from the settings hierarchy. */
  ruleset?: Ruleset;
  /** Called when the user answers "always allow", so the rule can be persisted. */
  onPersistRule?: (rule: string) => void;
}

type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

export class SdkAgentEngine implements AgentEngine {
  readonly name = "claude-agent-sdk";

  private state: NormalizeState = newState();
  private mode: PermissionMode;
  private ruleset: Ruleset;
  private sessionId: string | null = null;
  private active: { interrupt: () => Promise<unknown> } | null = null;
  private pending = new Map<string, Deferred<PermissionAnswer>>();
  private counter = 0;

  constructor(private readonly options: SdkEngineOptions = {}) {
    this.mode = options.permissionMode ?? "default";
    this.ruleset = options.ruleset ?? emptyRuleset();
  }

  usage(): UsageSnapshot {
    return { ...this.state.usage };
  }

  permissionMode(): PermissionMode {
    return this.mode;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  resolvePermission(id: string, answer: PermissionAnswer): void {
    const waiting = this.pending.get(id);
    if (!waiting) return;
    this.pending.delete(id);
    waiting.resolve(answer);
  }

  async *run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    // The SDK takes an AbortController, not a signal. Bridge the one the TUI
    // owns so Esc aborts the request rather than merely stopping our
    // consumption of the iterator.
    const controller = new AbortController();
    const forward = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forward, { once: true });

    const queue = new AsyncQueue<AgentEvent>();
    const cwd = this.options.cwd ?? process.cwd();

    // Every prompt in flight must reach an answer, or the SDK stays blocked
    // and the turn hangs. An abort denies them all.
    const releasePending = (message: string) => {
      for (const [id, waiting] of this.pending) {
        this.pending.delete(id);
        waiting.resolve({ decision: "deny", message });
      }
    };
    signal.addEventListener("abort", () => releasePending("Interrupted by the user."), {
      once: true,
    });

    const canUseTool = async (
      toolName: string,
      toolInput: Record<string, unknown>
    ): Promise<PermissionResult> => {
      const decision = evaluate(toolName, toolInput, this.ruleset, {
        cwd,
        mode: this.mode,
        additionalDirs: this.options.additionalDirectories,
      });

      if (decision.behavior === "allow") {
        return { behavior: "allow", updatedInput: toolInput };
      }
      if (decision.behavior === "deny") {
        return { behavior: "deny", message: decision.reason };
      }

      const id = `perm-${++this.counter}`;
      const waiting = deferred<PermissionAnswer>();
      this.pending.set(id, waiting);

      queue.push({
        type: "permission_request",
        id,
        tool: toolName,
        detail: summarizeToolInput(toolName, toolInput),
        reason: decision.reason,
        suggestedRule: suggestRule(toolName, toolInput, cwd),
      });

      const answer = await waiting.promise;
      if (answer.decision === "allowAlways") {
        const rule = suggestRule(toolName, toolInput, cwd);
        // Widen the in-memory ruleset too, so the same call is not asked twice
        // in this session even before the file is re-read.
        this.ruleset = { ...this.ruleset, allow: [...this.ruleset.allow, rule] };
        this.options.onPersistRule?.(rule);
        return { behavior: "allow", updatedInput: toolInput };
      }
      if (answer.decision === "allow") {
        return { behavior: "allow", updatedInput: toolInput };
      }
      return { behavior: "deny", message: answer.message ?? "Denied by the user." };
    };

    // Streaming input mode, not `prompt: string`.
    //
    // `canUseTool` is delivered as a control request, and control requests are
    // only supported when streaming input/output is used. With a plain string
    // prompt the callback is simply never invoked — observed in testing, where
    // Bash ran without ever reaching our permission engine. A gate that is
    // silently not consulted is worse than no gate, because it reads as one.
    async function* promptStream() {
      yield {
        type: "user" as const,
        message: { role: "user" as const, content: input.prompt },
        parent_tool_use_id: null,
        session_id: "",
      };
    }

    const stream = query({
      prompt: promptStream(),
      options: {
        abortController: controller,
        includePartialMessages: true,
        canUseTool,
        // Isolation mode. Omitting this loads the user's own Claude Code
        // settings, which can pre-approve a tool before `canUseTool` is ever
        // consulted — observed in testing, where Bash ran despite a ruleset
        // that only allowed Read and Glob. Two settings systems silently
        // merging is exactly what makes a permission engine untrustworthy, so
        // ours is the only one. The cost is that CLAUDE.md is not auto-loaded;
        // memory discovery is ours to implement (plan A-3-03).
        settingSources: [],
        model: this.options.model,
        cwd: this.options.cwd,
        permissionMode: this.mode,
        allowedTools: this.options.allowedTools,
        disallowedTools: this.options.disallowedTools,
        additionalDirectories: this.options.additionalDirectories,
        maxTurns: this.options.maxTurns,
        resume: input.resume ?? this.options.resume ?? this.sessionId ?? undefined,
        continue: this.options.continueSession,
      },
    });

    this.active = stream;

    // Pump the SDK into the queue so permission requests can interleave.
    const pump = (async () => {
      try {
        for await (const message of stream) {
          for (const event of normalize(message, this.state)) {
            if (event.type === "session_start" && event.sessionId) {
              this.sessionId = event.sessionId;
            }
            queue.push(event);
          }
        }
      } catch (err: any) {
        if (signal.aborted || controller.signal.aborted) {
          queue.push({
            type: "turn_end",
            stopReason: "interrupted",
            usage: { ...this.state.usage },
          });
        } else {
          queue.push({
            type: "error",
            code: err?.name === "AbortError" ? "aborted" : "engine_error",
            message: err?.message ?? String(err),
            retryable: true,
          });
          queue.push({ type: "turn_end", stopReason: "error", usage: { ...this.state.usage } });
        }
      } finally {
        releasePending("The turn ended.");
        queue.close();
      }
    })();

    try {
      yield* queue.drain();
      await pump;
    } finally {
      signal.removeEventListener("abort", forward);
      releasePending("The turn ended.");
      this.active = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.active) {
      try {
        await this.active.interrupt();
      } catch {
        // Best effort — the process is going away regardless.
      }
    }
  }

  /** Reset the conversation; the next turn starts a fresh session. */
  clear(): void {
    this.sessionId = null;
    this.state = newState();
    this.state.usage = emptyUsage();
  }
}
