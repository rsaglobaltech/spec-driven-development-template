"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { scanPacks } = require("../../src/scan");
const { renderIndex, renderCard, escape } = require("../../src/render");

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const PACKS_DIR = path.join(REPO_ROOT, "packs");

// ── escape ────────────────────────────────────────────────────────────────────

test("escape converts HTML special chars", () => {
  assert.equal(escape("<script>"), "&lt;script&gt;");
  assert.equal(escape('a & "b"'), "a &amp; &quot;b&quot;");
});

test("escape handles null and undefined", () => {
  assert.equal(escape(null), "");
  assert.equal(escape(undefined), "");
});

// ── renderCard ────────────────────────────────────────────────────────────────

test("renderCard includes pack name, id, and counts", () => {
  const html = renderCard({
    id: "auth/backend",
    name: "Auth Pack",
    version: "1.0.0",
    language: "en",
    project_type: "backend",
    requirements: 5,
    useCases: 5,
    aggregates: 2,
    events: 5,
    scenarios: 3,
    lintStatus: "pass",
    lintMessages: [],
  });
  assert.ok(html.includes("Auth Pack"));
  assert.ok(html.includes("auth/backend"));
  assert.ok(html.includes("5</strong> requirements"));
  assert.ok(html.includes("verified"));
});

test("renderCard shows lint warnings when present", () => {
  const html = renderCard({
    id: "x/y",
    name: "X",
    version: "1.0.0",
    language: "en",
    project_type: "backend",
    requirements: 1,
    useCases: 1,
    aggregates: 0,
    events: 0,
    scenarios: 1,
    lintStatus: "warn",
    lintMessages: ["Pack contains 3 TODO placeholder(s)."],
  });
  assert.ok(html.includes("warn"));
  assert.ok(html.includes("TODO placeholder"));
});

// ── renderIndex ───────────────────────────────────────────────────────────────

test("renderIndex emits valid HTML5", () => {
  const html = renderIndex([], { title: "Test", generated: "2026-01-01T00:00:00Z" });
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("<title>Test</title>"));
  assert.ok(html.includes("0 pack(s)"));
});

test("renderIndex shows verified count", () => {
  const packs = [
    { id: "a", name: "A", version: "1", language: "en", project_type: "backend",
      requirements: 1, useCases: 1, aggregates: 0, events: 0, scenarios: 1, lintStatus: "pass", lintMessages: [] },
    { id: "b", name: "B", version: "1", language: "en", project_type: "backend",
      requirements: 1, useCases: 1, aggregates: 0, events: 0, scenarios: 1, lintStatus: "warn", lintMessages: [] },
  ];
  const html = renderIndex(packs);
  assert.ok(html.includes("2 pack(s)"));
  assert.ok(html.includes("1 verified"));
});

// ── scanPacks (integration with the real packs/ dir) ──────────────────────────

test("scanPacks discovers all 11 curated packs", () => {
  const packs = scanPacks(PACKS_DIR);
  assert.equal(
    packs.length,
    11,
    `expected 11 packs, found ${packs.length}: ${packs.map((p) => p.id).join(", ")}`
  );
  const ids = packs.map((p) => p.id);
  assert.ok(ids.includes("auth/backend"));
  assert.ok(ids.includes("billing/backend"));
  assert.ok(ids.includes("audit-log/backend"));
  assert.ok(ids.includes("notifications/backend"));
  assert.ok(ids.includes("feature-flags/backend"));
  assert.ok(ids.includes("multi-tenant/backend"));
  assert.ok(ids.includes("file-storage/backend"));
  assert.ok(ids.includes("search/backend"));
  assert.ok(ids.includes("reporting/backend"));
  assert.ok(ids.includes("webhooks/backend"));
  assert.ok(ids.includes("sample-contracts/contracts"));
});

test("scanPacks marks every curated pack as verified (lintStatus=pass)", () => {
  const packs = scanPacks(PACKS_DIR);
  for (const p of packs) {
    assert.equal(p.lintStatus, "pass", `${p.id} should pass lint, got ${p.lintStatus}: ${p.lintMessages.join("; ")}`);
  }
});

test("scanPacks throws when packsRoot does not exist", () => {
  assert.throws(() => scanPacks("/no/such/dir"), /does not exist/);
});

test("scanPacks returns empty array when packsRoot has no packs", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "empty-packs-"));
  try {
    assert.deepEqual(scanPacks(empty), []);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
