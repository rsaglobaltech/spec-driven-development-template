import test from "node:test";
import assert from "node:assert/strict";

import { normalize, newState, preview } from "../engine/normalize.js";
import { nextPermissionMode, type AgentEvent } from "../engine/types.js";
import { ScriptedAgentEngine } from "../engine/scripted-engine.js";

// ── normalize: SDKMessage → AgentEvent ────────────────────────────────────────

test("system/init becomes session_start and records the model", () => {
  const state = newState();
  const events = normalize(
    {
      type: "system",
      subtype: "init",
      session_id: "abc",
      model: "claude-opus-5",
      tools: ["Read", "Bash"],
      cwd: "/repo",
    },
    state
  );
  assert.deepEqual(events, [
    { type: "session_start", sessionId: "abc", model: "claude-opus-5", tools: ["Read", "Bash"], cwd: "/repo" },
  ]);
  assert.equal(state.usage.model, "claude-opus-5");
});

test("a text delta stream event becomes text_delta", () => {
  const events = normalize(
    {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hola" } },
    },
    newState()
  );
  assert.deepEqual(events, [{ type: "text_delta", text: "Hola" }]);
});

test("a thinking block start is a progress signal with no content", () => {
  const events = normalize(
    { type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking" } } },
    newState()
  );
  assert.deepEqual(events, [{ type: "thinking_start" }]);
});

test("an assistant message yields tool_start and authoritative text", () => {
  const state = newState();
  const events = normalize(
    {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Voy a leerlo." },
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/repo/a.ts" } },
        ],
      },
    },
    state
  );
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: "text_complete", text: "Voy a leerlo." });
  assert.equal(events[1].type, "tool_start");
  assert.equal(state.toolNames.get("t1"), "Read");
});

test("a tool_result becomes tool_end with a clipped preview", () => {
  const events = normalize(
    {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }],
      },
    },
    newState()
  );
  assert.deepEqual(events, [{ type: "tool_end", id: "t1", ok: true, preview: "ok" }]);
});

test("an errored tool_result is marked not-ok", () => {
  const [event] = normalize(
    {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }] },
    },
    newState()
  );
  assert.equal((event as any).ok, false);
});

test("modelUsage and total_cost_usd are read, never summed across turns", () => {
  // Both are cumulative in a streaming session: each result carries the
  // running total. Summing them double-counts every previous turn.
  const state = newState();
  const first = normalize(
    {
      type: "result",
      subtype: "success",
      is_error: false,
      stop_reason: "end_turn",
      total_cost_usd: 0.02,
      duration_ms: 1200,
      modelUsage: {
        "claude-opus-5": {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadInputTokens: 900,
          cacheCreationInputTokens: 10,
          canonicalModel: "claude-opus-5",
        },
      },
    },
    state
  );
  const firstUsage = (first.at(-1) as any).usage;
  assert.equal(firstUsage.inputTokens, 100);
  assert.equal(firstUsage.costUsd, 0.02);

  const second = normalize(
    {
      type: "result",
      subtype: "success",
      is_error: false,
      stop_reason: "end_turn",
      total_cost_usd: 0.05,
      modelUsage: {
        "claude-opus-5": {
          inputTokens: 250,
          outputTokens: 120,
          cacheReadInputTokens: 2000,
          cacheCreationInputTokens: 10,
        },
      },
    },
    state
  );
  const secondUsage = (second.at(-1) as any).usage;
  assert.equal(secondUsage.inputTokens, 250, "cumulative totals are replaced, not added");
  assert.equal(secondUsage.costUsd, 0.05);
});

test("the model with the most output names the session, not a cheap subagent", () => {
  const state = newState();
  normalize(
    {
      type: "result",
      subtype: "success",
      is_error: false,
      modelUsage: {
        "claude-haiku-4-5": { inputTokens: 9000, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        "claude-opus-5": { inputTokens: 100, outputTokens: 900, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      },
    },
    state
  );
  assert.equal(state.usage.model, "claude-opus-5");
});

test("an error result yields an error event and still ends the turn", () => {
  const events = normalize(
    { type: "result", subtype: "error_max_turns", is_error: true, result: "too many turns" },
    newState()
  );
  assert.equal(events[0].type, "error");
  assert.equal((events[0] as any).retryable, true);
  assert.equal(events[1].type, "turn_end");
});

test("a compact boundary reports how much was squeezed", () => {
  const events = normalize(
    { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 150000 } },
    newState()
  );
  assert.deepEqual(events, [{ type: "compacted", before: 150000 }]);
});

test("unknown message types are ignored, not fatal", () => {
  // The SDK's message union grows between releases; an unknown frame must not
  // crash a REPL the user is in the middle of using.
  assert.deepEqual(normalize({ type: "some_future_message", payload: 1 }, newState()), []);
  assert.deepEqual(normalize(null, newState()), []);
  assert.deepEqual(normalize("nonsense", newState()), []);
});

test("preview truncates and says how much it hid", () => {
  const long = "x".repeat(500);
  const out = preview(long, 100);
  assert.ok(out.length < 200);
  assert.match(out, /more character\(s\)/);
});

test("preview flattens content blocks", () => {
  assert.equal(preview([{ type: "text", text: "a" }, { type: "text", text: "b" }]), "a\nb");
});

// ── permission mode cycling ───────────────────────────────────────────────────

test("shift+tab cycles ask → auto-edit → plan → ask", () => {
  assert.equal(nextPermissionMode("default"), "acceptEdits");
  assert.equal(nextPermissionMode("acceptEdits"), "plan");
  assert.equal(nextPermissionMode("plan"), "default");
});

test("cycling out of bypassPermissions lands on the safe mode", () => {
  // bypassPermissions is never reachable by cycling; it must be typed in full.
  assert.equal(nextPermissionMode("bypassPermissions"), "default");
});

// ── abort ─────────────────────────────────────────────────────────────────────

test("aborting stops the run and reports an interrupted turn", async () => {
  const engine = new ScriptedAgentEngine([
    { event: { type: "text_delta", text: "one" } },
    { event: { type: "text_delta", text: "two" }, delayMs: 5_000 },
    { event: { type: "text_delta", text: "three" } },
  ]);

  const controller = new AbortController();
  const seen: AgentEvent[] = [];
  const started = Date.now();

  const consume = (async () => {
    for await (const event of engine.run({ prompt: "x" }, controller.signal)) seen.push(event);
  })();

  setTimeout(() => controller.abort(), 20);
  await consume;

  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `abort must not wait out the delay (took ${elapsed}ms)`);
  assert.equal(engine.aborted, true);
  assert.equal(seen.at(-1)?.type, "turn_end");
  assert.equal((seen.at(-1) as any).stopReason, "interrupted");
  assert.ok(
    seen.filter((e) => e.type === "text_delta").length < 3,
    "events after the abort must not be emitted"
  );
});

test("a signal already aborted produces no work at all", async () => {
  const engine = new ScriptedAgentEngine([{ event: { type: "text_delta", text: "nope" } }]);
  const controller = new AbortController();
  controller.abort();

  const seen: AgentEvent[] = [];
  for await (const event of engine.run({ prompt: "x" }, controller.signal)) seen.push(event);

  assert.equal(engine.emitted, 0);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, "turn_end");
});
