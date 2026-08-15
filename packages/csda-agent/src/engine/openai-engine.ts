/**
 * The OpenAI engine: a hand-written tool loop over chat completions.
 *
 * There is no Tool Runner here — that helper belongs to the Anthropic SDK — so
 * the request → execute → loop cycle is written out. It is about forty lines,
 * and having it explicit makes the one thing that matters visible: the tools
 * it loops over are the *same* objects the Anthropic engine uses, built from
 * the same manifest. The boundary is the tool set, not the vendor.
 */

import OpenAI from "openai";
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

export interface OpenAIEngineOptions {
  model: string;
  maxTokens?: number;
  permissionMode?: PermissionMode;
  scope: FileScope;
  exec: ExecOptions;
  maxIterations?: number;
}

export class OpenAIAgentEngine implements AgentEngine {
  readonly name = "openai";

  private client = new OpenAI();
  private history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  private snapshot: UsageSnapshot = emptyUsage();
  private mode: PermissionMode;
  private pending = new Map<string, Deferred<PermissionAnswer>>();
  private counter = 0;

  constructor(private readonly options: OpenAIEngineOptions) {
    this.mode = options.permissionMode ?? "default";
    this.snapshot.model = options.model;
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
    this.history = [{ role: "system", content: SYSTEM_PROMPT }];
    this.snapshot = emptyUsage();
    this.snapshot.model = this.options.model;
  }

  async *run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const queue = new AsyncQueue<AgentEvent>();

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
        queue.push({ type: "tool_start", id, name: tool, input: toolInput });
        return id;
      },
      onEnd: (id, ok, preview) => {
        if (id) queue.push({ type: "tool_end", id, ok, preview });
      },
      confirm: async (tool, detail) => {
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
        return (await waiting.promise).decision !== "deny";
      },
    };

    const tools = buildTools(ctx);
    const byName = new Map(tools.map((t) => [t.name, t]));
    // Same JSON Schema the Anthropic side uses, in OpenAI's envelope.
    const toolSpecs = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: (tool as any).description,
        parameters: (tool as any).input_schema,
      },
    }));

    this.history.push({ role: "user", content: input.prompt });

    const pump = (async () => {
      try {
        const maxIterations = this.options.maxIterations ?? 24;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
          if (signal.aborted) break;

          const response = await this.client.chat.completions.create(
            {
              model: this.options.model,
              max_completion_tokens: this.options.maxTokens ?? 16000,
              messages: this.history,
              tools: toolSpecs,
            },
            { signal }
          );

          this.accumulate(response.usage);
          const choice = response.choices[0];
          const message = choice?.message;
          if (!message) break;

          this.history.push(message as any);
          if (message.content) queue.push({ type: "text_complete", text: message.content });

          const calls = message.tool_calls ?? [];
          if (calls.length === 0) break;

          for (const call of calls) {
            if (call.type !== "function") continue;
            const tool = byName.get(call.function.name);
            let output: string;
            if (!tool) {
              output = `Error: unknown tool ${call.function.name}.`;
            } else {
              let args: unknown = {};
              try {
                args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
              } catch (err: any) {
                // Malformed arguments are the model's mistake to fix, so they
                // go back as a tool result rather than aborting the turn.
                output = `Error: arguments were not valid JSON (${err?.message}).`;
                this.history.push({ role: "tool", tool_call_id: call.id, content: output });
                continue;
              }
              output = String(await tool.run(args as any));
            }
            this.history.push({ role: "tool", tool_call_id: call.id, content: output });
          }
        }

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

  /** Chat completions report usage per response, so it accumulates. */
  private accumulate(usage: any): void {
    if (!usage) return;
    this.snapshot.inputTokens += usage.prompt_tokens ?? 0;
    this.snapshot.outputTokens += usage.completion_tokens ?? 0;
    this.snapshot.cacheReadTokens += usage.prompt_tokens_details?.cached_tokens ?? 0;
  }
}
