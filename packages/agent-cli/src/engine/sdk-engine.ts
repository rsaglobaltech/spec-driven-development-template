/**
 * The Claude Agent SDK behind the `AgentEngine` boundary.
 *
 * The SDK is Claude Code packaged as a library: it brings the agent loop, the
 * built-in file and bash tools, context management and sessions. Reimplementing
 * that on top of the raw Messages API would be rewriting the part that is
 * already solved — so this engine's whole job is translation, and it is
 * deliberately thin.
 *
 * See ADR (planned) and `mejoras/agent-cli-plan.md` §2 for why this is option A
 * and what would make us reach for a hand-rolled engine instead.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentEngine,
  AgentEvent,
  PermissionMode,
  TurnInput,
  UsageSnapshot,
} from "./types.js";
import { emptyUsage } from "./types.js";
import { newState, normalize, type NormalizeState } from "./normalize.js";

export interface SdkEngineOptions {
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  additionalDirectories?: string[];
  appendSystemPrompt?: string;
  maxTurns?: number;
  resume?: string;
  continueSession?: boolean;
}

export class SdkAgentEngine implements AgentEngine {
  readonly name = "claude-agent-sdk";

  private state: NormalizeState = newState();
  private mode: PermissionMode;
  private sessionId: string | null = null;
  private active: { interrupt: () => Promise<unknown> } | null = null;

  constructor(private readonly options: SdkEngineOptions = {}) {
    this.mode = options.permissionMode ?? "default";
  }

  usage(): UsageSnapshot {
    return { ...this.state.usage };
  }

  permissionMode(): PermissionMode {
    return this.mode;
  }

  setPermissionMode(mode: PermissionMode): void {
    // Applied to the next turn. Changing it mid-turn is a control request the
    // SDK only supports in streaming-input mode, which F2 introduces along
    // with the interactive permission prompt.
    this.mode = mode;
  }

  async *run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    // The SDK takes an AbortController, not a signal. Bridge the one the TUI
    // owns onto a fresh controller so Esc aborts the actual request rather
    // than merely stopping our consumption of the iterator.
    const controller = new AbortController();
    const forward = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forward, { once: true });

    const stream = query({
      prompt: input.prompt,
      options: {
        abortController: controller,
        includePartialMessages: true,
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

    try {
      for await (const message of stream) {
        for (const event of normalize(message, this.state)) {
          if (event.type === "session_start" && event.sessionId) {
            // Remember it so the next turn continues the same conversation.
            this.sessionId = event.sessionId;
          }
          yield event;
        }
      }
    } catch (err: any) {
      if (signal.aborted || controller.signal.aborted) {
        yield {
          type: "turn_end",
          stopReason: "interrupted",
          usage: { ...this.state.usage },
        };
        return;
      }
      yield {
        type: "error",
        code: err?.name === "AbortError" ? "aborted" : "engine_error",
        message: err?.message ?? String(err),
        retryable: true,
      };
      yield { type: "turn_end", stopReason: "error", usage: { ...this.state.usage } };
    } finally {
      signal.removeEventListener("abort", forward);
      this.active = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.active) {
      try {
        await this.active.interrupt();
      } catch {
        // Disposing is best effort — the process is going away regardless.
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
