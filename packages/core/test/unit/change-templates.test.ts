/**
 * `templateValueDriftDelta` — route 2 of the three-way resolution for a
 * declared-value divergence (§8.6 → §11). Pure: given a requirement node and
 * the two values, it renders a `MODIFIED Requirements` delta. The wiring
 * that finds the requirement and the code value lives in
 * `tests/unit/change-value-drift.test.ts`.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { templateValueDriftDelta } from "../../src/domain/ChangeTemplates";
import { parseDelta } from "../../src/domain/SpecParser";

const REQ = {
  id: "REQ-200",
  name: "Session expiry",
  heading: "REQ-200 — Session expiry",
  line: 5,
  text: "The system SHALL expire the session after 15 minutes of inactivity.",
  scenarios: [
    {
      id: "SCN-200a",
      name: "Expires",
      heading: "SCN-200a — Expires",
      line: 9,
      steps: ["GIVEN a session idle for 15 minutes", "WHEN the user tries to use it", "THEN it has expired"],
    },
  ],
  trace: { uc: "Login", value_session_timeout: "15m" },
};

test("the value_ trace key is rewritten to the code's value", () => {
  const out = templateValueDriftDelta("auth", REQ, "session_timeout", "15m", "30m");
  assert.match(out, /value_session_timeout=30m/);
  assert.doesNotMatch(out, /value_session_timeout=15m/);
});

test("the prose is left untouched, with a TODO explaining what changed", () => {
  const out = templateValueDriftDelta("auth", REQ, "session_timeout", "15m", "30m");
  assert.match(out, /The system SHALL expire the session after 15 minutes of inactivity\./);
  assert.match(out, /TODO:.*`session_timeout`.*`15m`.*`30m`/s);
});

test("scenarios are copied verbatim — this is a value fix, not a behaviour change", () => {
  const out = templateValueDriftDelta("auth", REQ, "session_timeout", "15m", "30m");
  assert.match(out, /GIVEN a session idle for 15 minutes/);
  assert.match(out, /WHEN the user tries to use it/);
  assert.match(out, /THEN it has expired/);
});

test("other trace fields survive the rewrite", () => {
  const out = templateValueDriftDelta("auth", REQ, "session_timeout", "15m", "30m");
  assert.match(out, /uc=Login/);
});

test("the output is a valid MODIFIED-requirements delta the real parser accepts", () => {
  const out = templateValueDriftDelta("auth", REQ, "session_timeout", "15m", "30m");
  const delta = parseDelta(out);
  assert.equal(delta.modified.length, 1);
  assert.equal(delta.modified[0].id, "REQ-200");
  assert.equal(delta.added.length, 0);
  assert.equal(delta.removed.length, 0);
});
