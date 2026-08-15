/**
 * The engine: Messages API + Tool Runner, with a closed tool set.
 *
 * The SDK's tool runner drives the request → execute → loop cycle over tools
 * *we* define. There are no built-in tools, no filesystem access we did not
 * write, and no shell — which is the whole point. The restriction is not a
 * policy layer over a general agent; it is the absence of any tool that could
 * do anything else.
 *
 * See docs/specs/adr/0016-csda-agent-closed-tool-set.md.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentEngine,
  AgentEvent,
  PermissionAnswer,
  PermissionMode,
  TurnInput,
  UsageSnapshot,
} from "./types.js";
import { emptyUsage } from "./types.js";
import { AsyncQueue, deferred, type Deferred } from "./queue.js";
import { buildTools, type ToolContext } from "../tools/registry.js";
import type { FileScope } from "../tools/files.js";
import type { ExecOptions } from "../tools/exec.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

export interface ToolRunnerEngineOptions {
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  permissionMode?: PermissionMode;
  scope: FileScope;
  exec: ExecOptions;
  maxIterations?: number;
}

const DEFAULT_MODEL = "claude-opus-5";

export class ToolRunnerAgentEngine implements AgentEngine {
  readonly name = "tool-runner";

  private client = new Anthropic();
  private history: Anthropic.Beta.BetaMessageParam[] = [];
  private snapshot: UsageSnapshot = emptyUsage();
  private mode: PermissionMode;
  private pending = new Map<string, Deferred<PermissionAnswer>>();
  private counter = 0;

  constructor(private readonly options: ToolRunnerEngineOptions) {
    this.mode = options.permissionMode ?? "default";
    this.snapshot.model = options.model ?? DEFAULT_MODEL;
  }

  usage(): UsageSnapshot {
    return { ...this.snapshot };
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

  clear(): void {
    this.history = [];
    this.snapshot = emptyUsage();
    this.snapshot.model = this.options.model ?? DEFAULT_MODEL;
  }

  async *run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const queue = new AsyncQueue<AgentEvent>();
    const toolIds = new Map<string, string>();

    const releasePending = (message: string) => {
      for (const [id, waiting] of this.pending) {
        this.pending.delete(id);
        waiting.resolve({ decision: "deny", message });
      }
    };
    signal.addEventListener("abort", () => releasePending("Interrupted by the user."), {
      once: true,
    });

    const ctx: ToolContext = {
      exec: this.options.exec,
      scope: this.options.scope,
      onStart: (tool, toolInput) => {
        const id = `tool-${++this.counter}`;
        toolIds.set(id, tool);
        queue.push({ type: "tool_start", id, name: tool, input: toolInput });
        return id;
      },
      onEnd: (id, ok, preview) => {
        if (!id) return;
        queue.push({ type: "tool_end", id, ok, preview });
      },
      confirm: async (tool, detail) => {
        // plan mode never changes anything; bypass never asks.
        if (this.mode === "plan") return false;
        if (this.mode === "bypassPermissions" || this.mode === "acceptEdits") return true;
        if (signal.aborted) return false;

        const id = `perm-${++this.counter}`;
        const waiting = deferred<PermissionAnswer>();
        this.pending.set(id, waiting);
        queue.push({
          type: "permission_request",
          id,
          tool,
          detail,
          reason: `${tool} changes the project.`,
          suggestedRule: tool,
        });
        const answer = await waiting.promise;
        return answer.decision !== "deny";
      },
    };

    this.history.push({ role: "user", content: input.prompt });

    const pump = (async () => {
      try {
        const runner = this.client.beta.messages.toolRunner({
          model: this.options.model ?? DEFAULT_MODEL,
          max_tokens: this.options.maxTokens ?? 16000,
          system: SYSTEM_PROMPT,
          thinking: { type: "adaptive" },
          output_config: { effort: this.options.effort ?? "high" },
          tools: buildTools(ctx),
          messages: this.history,
          max_iterations: this.options.maxIterations ?? 24,
        } as any);

        for await (const message of runner) {
          if (signal.aborted) break;
          for (const block of message.content ?? []) {
            if (block.type === "text" && block.text) {
              queue.push({ type: "text_complete", text: block.text });
            }
          }
          this.accumulate(message.usage);
          if (message.stop_reason === "refusal") {
            queue.push({
              type: "error",
              code: "refusal",
              message: "The model declined this request.",
              retryable: false,
            });
          }
        }

        // Carry the conversation forward so the next turn has context.
        const params = (runner as any).params;
        if (params?.messages) this.history = params.messages;

        queue.push({
          type: "turn_end",
          stopReason: signal.aborted ? "interrupted" : "end_turn",
          usage: { ...this.snapshot },
        });
      } catch (err: any) {
        if (signal.aborted) {
          queue.push({ type: "turn_end", stopReason: "interrupted", usage: { ...this.snapshot } });
        } else {
          queue.push({
            type: "error",
            code: err?.constructor?.name ?? "engine_error",
            message: err?.message ?? String(err),
            retryable: err?.status === 429 || (err?.status ?? 0) >= 500,
          });
          queue.push({ type: "turn_end", stopReason: "error", usage: { ...this.snapshot } });
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
      releasePending("The turn ended.");
    }
  }

  /**
   * Messages API usage is **per response**, so it accumulates — unlike the
   * Agent SDK's cumulative totals, which are read.
   */
  private accumulate(usage: any): void {
    if (!usage) return;
    this.snapshot.inputTokens += usage.input_tokens ?? 0;
    this.snapshot.outputTokens += usage.output_tokens ?? 0;
    this.snapshot.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    this.snapshot.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
  }
}
