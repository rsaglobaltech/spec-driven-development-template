/**
 * SDKMessage → AgentEvent.
 *
 * A pure function, kept separate from the engine that calls it so the mapping
 * can be tested without a network, an API key, or a subprocess. This is where
 * the SDK's ~35 message types collapse into the handful a user can actually
 * see, and it is the only file in the package that knows their shape.
 *
 * Defensive by construction: every field is read through optional access. The
 * SDK's message union grows between releases, and an unknown message must be
 * ignored rather than crash a REPL the user is in the middle of using.
 */

import type { AgentEvent, UsageSnapshot } from "./types.js";
import { emptyUsage } from "./types.js";

export interface NormalizeState {
  usage: UsageSnapshot;
  /** Tool ids seen, so a tool_result can be matched to the call that made it. */
  toolNames: Map<string, string>;
  turnStartedAt: number | null;
}

export const newState = (): NormalizeState => ({
  usage: emptyUsage(),
  toolNames: new Map(),
  turnStartedAt: null,
});

const MAX_PREVIEW = 400;

/** Trim a tool result for display without hiding that it was trimmed. */
export function preview(value: unknown, limit = MAX_PREVIEW): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (Array.isArray(value)) {
    text = value
      .map((block: any) => (typeof block === "string" ? block : block?.text ?? JSON.stringify(block)))
      .join("\n");
  } else if (value === null || value === undefined) text = "";
  else text = JSON.stringify(value);

  text = text.trim();
  if (text.length <= limit) return text;
  const shown = text.slice(0, limit).trimEnd();
  const remaining = text.length - shown.length;
  return `${shown}\n… ${remaining} more character(s)`;
}

/**
 * Accumulate usage from a result message.
 *
 * `modelUsage` and `total_cost_usd` are **cumulative across turns** in a
 * streaming session — each result carries the running total. They are read,
 * never summed; adding them up double-counts every previous turn.
 */
function readUsage(message: any, state: NormalizeState): UsageSnapshot {
  const modelUsage = message?.modelUsage;
  if (modelUsage && typeof modelUsage === "object") {
    const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
    let primaryModel: string | null = null;
    let maxOutput = -1;
    for (const [model, usage] of Object.entries<any>(modelUsage)) {
      totals.input += usage?.inputTokens ?? 0;
      totals.output += usage?.outputTokens ?? 0;
      totals.cacheRead += usage?.cacheReadInputTokens ?? 0;
      totals.cacheCreation += usage?.cacheCreationInputTokens ?? 0;
      // The model that produced the most output is the one worth naming in the
      // status line; subagents on cheaper models should not take the label.
      if ((usage?.outputTokens ?? 0) > maxOutput) {
        maxOutput = usage?.outputTokens ?? 0;
        primaryModel = usage?.canonicalModel ?? model;
      }
    }
    state.usage.inputTokens = totals.input;
    state.usage.outputTokens = totals.output;
    state.usage.cacheReadTokens = totals.cacheRead;
    state.usage.cacheCreationTokens = totals.cacheCreation;
    if (primaryModel) state.usage.model = primaryModel;
  }

  if (typeof message?.total_cost_usd === "number") {
    state.usage.costUsd = message.total_cost_usd;
  }
  if (typeof message?.duration_ms === "number") {
    state.usage.lastTurnMs = message.duration_ms;
  }
  return { ...state.usage };
}

/**
 * Map one SDK message to zero or more events.
 *
 * Zero is a normal outcome: most of the SDK's message types are telemetry a
 * user cannot act on.
 */
export function normalize(message: any, state: NormalizeState): AgentEvent[] {
  if (!message || typeof message !== "object") return [];

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        if (typeof message.model === "string") state.usage.model = message.model;
        return [
          {
            type: "session_start",
            sessionId: message.session_id ?? null,
            model: message.model ?? null,
            tools: Array.isArray(message.tools) ? message.tools : [],
            cwd: message.cwd ?? null,
          },
        ];
      }
      if (message.subtype === "compact_boundary") {
        return [
          {
            type: "compacted",
            before: message.compact_metadata?.pre_tokens ?? null,
          },
        ];
      }
      return [];

    case "stream_event": {
      const event = message.event;
      if (!event) return [];
      if (event.type === "content_block_start" && event.content_block?.type === "thinking") {
        return [{ type: "thinking_start" }];
      }
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          return [{ type: "text_delta", text: delta.text }];
        }
      }
      return [];
    }

    case "assistant": {
      const events: AgentEvent[] = [];
      const content = message.message?.content;
      if (!Array.isArray(content)) return events;
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
          // Authoritative over the accumulated deltas: partial-message streaming
          // is best effort, and the buffered block is the complete text.
          events.push({ type: "text_complete", text: block.text });
        } else if (block?.type === "tool_use") {
          state.toolNames.set(block.id, block.name);
          events.push({
            type: "tool_start",
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }
      return events;
    }

    case "user": {
      const events: AgentEvent[] = [];
      const content = message.message?.content;
      if (!Array.isArray(content)) return events;
      for (const block of content) {
        if (block?.type === "tool_result") {
          events.push({
            type: "tool_end",
            id: block.tool_use_id,
            ok: block.is_error !== true,
            preview: preview(block.content),
          });
        }
      }
      return events;
    }

    case "result": {
      const usage = readUsage(message, state);
      if (message.subtype !== "success" || message.is_error === true) {
        return [
          {
            type: "error",
            code: String(message.subtype ?? "result_error"),
            message: String(message.result ?? "The turn ended in an error."),
            // A turn that ran out of turns or hit an API error is worth
            // retrying; one the model refused is not.
            retryable: message.subtype !== "refusal",
          },
          { type: "turn_end", stopReason: String(message.subtype ?? "error"), usage },
        ];
      }
      return [{ type: "turn_end", stopReason: message.stop_reason ?? "end_turn", usage }];
    }

    default:
      return [];
  }
}
