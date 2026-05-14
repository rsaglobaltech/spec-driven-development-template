"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { threeWayMerge } = require("../../scripts/specops/merge");

test("threeWayMerge returns the incoming change when local is untouched", () => {
  const base = "line1\nline2\nline3\n";
  const local = base;
  const incoming = "line1\nline2-changed\nline3\n";
  const res = threeWayMerge(base, local, incoming);
  assert.equal(res.conflict, false);
  assert.equal(res.merged, incoming);
});

test("threeWayMerge keeps the local change when incoming is untouched", () => {
  const base = "line1\nline2\nline3\n";
  const local = "line1\nline2-mine\nline3\n";
  const incoming = base;
  const res = threeWayMerge(base, local, incoming);
  assert.equal(res.conflict, false);
  assert.equal(res.merged, local);
});

test("threeWayMerge combines non-overlapping edits cleanly", () => {
  const base = "a\nb\nc\nd\n";
  const local = "a-mine\nb\nc\nd\n";
  const incoming = "a\nb\nc\nd-theirs\n";
  const res = threeWayMerge(base, local, incoming);
  assert.equal(res.conflict, false);
  assert.equal(res.merged, "a-mine\nb\nc\nd-theirs\n");
});

test("threeWayMerge flags overlapping edits as a conflict with markers", () => {
  const base = "a\nb\nc\n";
  const local = "a\nb-mine\nc\n";
  const incoming = "a\nb-theirs\nc\n";
  const res = threeWayMerge(base, local, incoming);
  assert.equal(res.conflict, true);
  assert.ok(res.conflicts >= 1);
  assert.ok(res.merged.includes("<<<<<<<"));
  assert.ok(res.merged.includes("======="));
  assert.ok(res.merged.includes(">>>>>>>"));
  assert.ok(res.merged.includes("b-mine"));
  assert.ok(res.merged.includes("b-theirs"));
});

test("threeWayMerge honours custom conflict labels", () => {
  const base = "x\n";
  const local = "y\n";
  const incoming = "z\n";
  const res = threeWayMerge(base, local, incoming, {
    local: "MY-SIDE",
    incoming: "PACK-SIDE",
  });
  assert.equal(res.conflict, true);
  assert.ok(res.merged.includes("MY-SIDE"));
  assert.ok(res.merged.includes("PACK-SIDE"));
});
