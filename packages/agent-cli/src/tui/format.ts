/**
 * Pure formatting helpers for the TUI.
 *
 * Kept free of React and Ink so they can be tested directly: a status line
 * that silently prints "NaN" or a tool card that dumps 400 lines into the
 * scrollback are the two ways this surface goes wrong, and both are cheaper
 * to catch here than through a rendered snapshot.
 */

import type { AgentEvent, UsageSnapshot } from "../engine/types.js";

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatCost(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  // Exactly zero is a fact, not a rounding artefact — saying "<$0.01" for a
  // free turn reads as "something was spent".
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

/**
 * Cache hit rate — the number that says whether prompt caching is working.
 * Returns null when nothing has been read or written yet, so the status line
 * can show "—" instead of a misleading 0 %.
 */
export function cacheHitRate(usage: UsageSnapshot): number | null {
  const denominator = usage.cacheReadTokens + usage.cacheCreationTokens + usage.inputTokens;
  if (denominator <= 0) return null;
  return usage.cacheReadTokens / denominator;
}

/** A short, human label for what a tool call is about to do. */
export function summarizeToolInput(name: string, input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>;
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return null;
  };

  switch (name) {
    case "Bash":
      return truncate(first("command") ?? "", 80);
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return truncate(first("file_path", "path", "notebook_path") ?? "", 80);
    case "Glob":
      return truncate(first("pattern") ?? "", 80);
    case "Grep":
      return truncate(first("pattern") ?? "", 80);
    case "WebFetch":
    case "WebSearch":
      return truncate(first("url", "query") ?? "", 80);
    default: {
      const summary = first("description", "prompt", "command", "file_path", "pattern", "query");
      if (summary) return truncate(summary, 80);
      const keys = Object.keys(record);
      return keys.length === 0 ? "" : truncate(keys.join(", "), 80);
    }
  }
}

export function truncate(text: string, limit: number): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1))}…`;
}

/**
 * Clip a tool result to a few lines, saying how much was hidden.
 *
 * A `Bash` that prints 400 lines must not push the conversation out of the
 * scrollback; the user asked the agent a question, not for a log dump.
 */
export function clipLines(text: string, maxLines: number): { shown: string; hiddenLines: number } {
  const lines = String(text ?? "").split("\n");
  if (lines.length <= maxLines) return { shown: lines.join("\n"), hiddenLines: 0 };
  return {
    shown: lines.slice(0, maxLines).join("\n"),
    hiddenLines: lines.length - maxLines,
  };
}

/** The transcript entries the TUI paints, derived from the event stream. */
export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; id: string; name: string; summary: string; state: "running" | "ok" | "error"; preview: string }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

/**
 * Fold one event into the transcript.
 *
 * Returns a new array when something changed and the same reference when the
 * event does not affect the transcript, so React can skip a repaint.
 */
export function applyEvent(entries: Entry[], event: AgentEvent): Entry[] {
  switch (event.type) {
    case "text_delta": {
      const last = entries[entries.length - 1];
      if (last && last.kind === "assistant") {
        const next = entries.slice(0, -1);
        next.push({ kind: "assistant", text: last.text + event.text });
        return next;
      }
      return [...entries, { kind: "assistant", text: event.text }];
    }

    case "text_complete": {
      // Authoritative: replace the streamed accumulation rather than append,
      // so a shed delta cannot leave the transcript with a truncated answer.
      const last = entries[entries.length - 1];
      if (last && last.kind === "assistant") {
        const next = entries.slice(0, -1);
        next.push({ kind: "assistant", text: event.text });
        return next;
      }
      return [...entries, { kind: "assistant", text: event.text }];
    }

    case "tool_start":
      return [
        ...entries,
        {
          kind: "tool",
          id: event.id,
          name: event.name,
          summary: summarizeToolInput(event.name, event.input),
          state: "running",
          preview: "",
        },
      ];

    case "tool_end": {
      const idx = entries.findIndex((e) => e.kind === "tool" && e.id === event.id);
      if (idx === -1) return entries;
      const next = entries.slice();
      const tool = next[idx] as Extract<Entry, { kind: "tool" }>;
      next[idx] = { ...tool, state: event.ok ? "ok" : "error", preview: event.preview };
      return next;
    }

    case "compacted":
      return [
        ...entries,
        {
          kind: "notice",
          text:
            event.before === null
              ? "Context compacted."
              : `Context compacted (${formatTokens(event.before)} tokens squeezed).`,
        },
      ];

    case "error":
      return [...entries, { kind: "error", text: event.message }];

    default:
      return entries;
  }
}
