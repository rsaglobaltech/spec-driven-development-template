import test from "node:test";
import assert from "node:assert/strict";

import {
  applyEvent,
  cacheHitRate,
  clipLines,
  formatCost,
  formatDuration,
  formatTokens,
  summarizeToolInput,
  truncate,
  type Entry,
} from "../tui/format.js";
import { emptyUsage } from "../engine/types.js";
import { CliError, parseArgs } from "../cli.js";

// ── formatting ────────────────────────────────────────────────────────────────

test("token counts stay readable at every magnitude", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(48000), "48k");
  assert.equal(formatTokens(2_400_000), "2.4M");
});

test("nonsense token counts never render as NaN", () => {
  assert.equal(formatTokens(Number.NaN), "0");
  assert.equal(formatTokens(-5), "0");
});

test("cost shows an em dash before anything is known, never $0.00", () => {
  assert.equal(formatCost(null), "—");
  assert.equal(formatCost(0), "$0.00", "a free turn is not '<$0.01'");
  assert.equal(formatCost(0.004), "<$0.01");
  assert.equal(formatCost(1.239), "$1.24");
});

test("durations are readable", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(450), "450ms");
  assert.equal(formatDuration(2400), "2.4s");
  assert.equal(formatDuration(125_000), "2m 5s");
});

test("cache hit rate is null until there is something to divide", () => {
  assert.equal(cacheHitRate(emptyUsage()), null);
  const usage = { ...emptyUsage(), cacheReadTokens: 900, inputTokens: 100 };
  assert.equal(cacheHitRate(usage), 0.9);
});

test("tool inputs summarise to the field a human would want", () => {
  assert.equal(summarizeToolInput("Bash", { command: "npm test" }), "npm test");
  assert.equal(summarizeToolInput("Read", { file_path: "/repo/a.ts" }), "/repo/a.ts");
  assert.equal(summarizeToolInput("Grep", { pattern: "TODO" }), "TODO");
  assert.equal(summarizeToolInput("Unknown", { description: "do a thing" }), "do a thing");
  // An unrecognised tool with no obvious field still says something useful.
  assert.equal(summarizeToolInput("Weird", { alpha: 1, beta: 2 }), "alpha, beta");
  assert.equal(summarizeToolInput("Weird", {}), "");
});

test("truncate collapses whitespace and marks the cut", () => {
  assert.equal(truncate("a   b\n c", 40), "a b c");
  assert.equal(truncate("x".repeat(50), 10), `${"x".repeat(9)}…`);
});

test("clipLines reports how many lines it hid", () => {
  const { shown, hiddenLines } = clipLines("1\n2\n3\n4\n5", 2);
  assert.equal(shown, "1\n2");
  assert.equal(hiddenLines, 3);
  assert.deepEqual(clipLines("only", 5), { shown: "only", hiddenLines: 0 });
});

// ── transcript folding ────────────────────────────────────────────────────────

test("consecutive deltas accumulate into one assistant entry", () => {
  let entries: Entry[] = [];
  entries = applyEvent(entries, { type: "text_delta", text: "Ho" });
  entries = applyEvent(entries, { type: "text_delta", text: "la" });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { kind: "assistant", text: "Hola" });
});

test("text_complete replaces the streamed accumulation, it does not append", () => {
  // Partial-message streaming is best effort: a shed delta must not leave the
  // transcript showing a truncated answer once the buffered block arrives.
  let entries: Entry[] = [];
  entries = applyEvent(entries, { type: "text_delta", text: "Hol" });
  entries = applyEvent(entries, { type: "text_complete", text: "Hola, qué tal" });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { kind: "assistant", text: "Hola, qué tal" });
});

test("a tool call becomes a card that later resolves in place", () => {
  let entries: Entry[] = [];
  entries = applyEvent(entries, {
    type: "tool_start",
    id: "t1",
    name: "Bash",
    input: { command: "npm test" },
  });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    kind: "tool",
    id: "t1",
    name: "Bash",
    summary: "npm test",
    state: "running",
    preview: "",
  });

  entries = applyEvent(entries, { type: "tool_end", id: "t1", ok: true, preview: "35 passing" });
  assert.equal(entries.length, 1, "the result resolves the card rather than adding one");
  assert.equal((entries[0] as any).state, "ok");
  assert.equal((entries[0] as any).preview, "35 passing");
});

test("a tool_end for an unknown id is ignored", () => {
  const entries: Entry[] = [{ kind: "assistant", text: "x" }];
  assert.equal(applyEvent(entries, { type: "tool_end", id: "ghost", ok: true, preview: "" }), entries);
});

test("a failed tool card is marked as an error", () => {
  let entries: Entry[] = [];
  entries = applyEvent(entries, { type: "tool_start", id: "t1", name: "Bash", input: {} });
  entries = applyEvent(entries, { type: "tool_end", id: "t1", ok: false, preview: "exit 1" });
  assert.equal((entries[0] as any).state, "error");
});

test("compaction and errors are visible in the transcript", () => {
  let entries: Entry[] = [];
  entries = applyEvent(entries, { type: "compacted", before: 150000 });
  assert.match((entries[0] as any).text, /150k/);
  entries = applyEvent(entries, { type: "error", code: "x", message: "boom", retryable: false });
  assert.deepEqual(entries[1], { kind: "error", text: "boom" });
});

test("events with nothing to show leave the transcript untouched", () => {
  const entries: Entry[] = [{ kind: "assistant", text: "x" }];
  assert.equal(applyEvent(entries, { type: "thinking_start" }), entries);
  assert.equal(
    applyEvent(entries, { type: "turn_end", stopReason: "end_turn", usage: emptyUsage() }),
    entries,
    "the same reference lets React skip the repaint"
  );
});

// ── argument parsing ──────────────────────────────────────────────────────────

test("a bare prompt is collected from the positional arguments", () => {
  const opts = parseArgs(["fix", "the", "failing", "test"], "/repo");
  assert.equal(opts.prompt, "fix the failing test");
  assert.equal(opts.print, false);
  assert.equal(opts.engine, "toolrunner");
});

test("flags map onto options", () => {
  const opts = parseArgs(
    [
      "-p",
      "--model",
      "claude-opus-5",
      "--permission-mode",
      "plan",
      "--allowed-tools",
      "Read, Grep",
      "--add-dir",
      "../other",
      "--max-turns",
      "5",
    ],
    "/repo"
  );
  assert.equal(opts.print, true);
  assert.equal(opts.model, "claude-opus-5");
  assert.equal(opts.permissionMode, "plan");
  assert.deepEqual(opts.allowedTools, ["Read", "Grep"]);
  assert.deepEqual(opts.addDirs, ["../other"]);
  assert.equal(opts.maxTurns, 5);
});

test("an unknown permission mode is rejected with the valid list", () => {
  assert.throws(
    () => parseArgs(["--permission-mode", "yolo"]),
    (err: CliError) => {
      assert.match(err.message, /Unknown permission mode/);
      assert.match(err.fix ?? "", /bypassPermissions/);
      return true;
    }
  );
});

test("an unknown flag is rejected rather than silently ignored", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown flag/);
});

test("--max-turns rejects nonsense", () => {
  assert.throws(() => parseArgs(["--max-turns", "zero"]), /positive integer/);
  assert.throws(() => parseArgs(["--max-turns", "-3"]), /positive integer/);
});

test("a flag missing its value is an error, not undefined", () => {
  assert.throws(() => parseArgs(["--model"]), /expects a value/);
});
