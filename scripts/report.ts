#!/usr/bin/env node
"use strict";

/**
 * `report` — spec-coverage dashboard (mejora C1 / P5).
 *
 * Reads docs/specs/traceability.md (via the same parser as `plan`) and emits
 * a single self-contained HTML file: % of requirements implemented, the REQs
 * still missing a test, specops pack health, orphan feature files, and — when
 * a history file is present — a coverage trend sparkline.
 *
 *   csda report                     # writes reports/spec-coverage.html
 *   csda report --out cov.html      # custom path
 *   csda report --format json       # machine-readable, to --out or stdout
 *   csda report --stdout            # print HTML to stdout (CI artifact piping)
 *   csda report --record            # append this run to the trend history
 *
 * The HTML is fully self-contained (inline CSS, no external requests) so it
 * drops straight into GitHub Pages / GitLab Pages or a CI artifact.
 */

const fs = require("node:fs");
const path = require("node:path");
const { resolveProjectDir } = require("./lib/project-root");
const { parseTraceability, classify, detectOrphans } = require("./plan");

const HISTORY_REL = "reports/spec-coverage-history.jsonl";

// ── Data model (pure, testable) ────────────────────────────────────────────────────

const DONE_CATEGORY = "DONE";

/**
 * Build the report data object from a project directory. Pure apart from
 * reading files under projectDir — returns a stable structure that both the
 * HTML and JSON renderers consume.
 */
function buildReport(projectDir) {
  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  const content = fs.readFileSync(tracePath, "utf8");
  const rows = parseTraceability(content);
  const items = rows.map((r) => classify(r, projectDir)).filter((x) => x !== null);
  const orphans = detectOrphans(projectDir, items);

  const byCategory = items.reduce((acc, it) => {
    acc[it.category] = (acc[it.category] || 0) + 1;
    return acc;
  }, {});

  const total = items.length;
  const implemented = byCategory[DONE_CATEGORY] || 0;
  const implementedPct = total === 0 ? 0 : Math.round((implemented / total) * 1000) / 10;

  // A REQ "needs a test" when its declared test artifact is missing (or none
  // is declared at all) — the honest gap the dashboard is meant to expose.
  const needsTest = items.filter((it) => !it.test_exists).map((it) => it.requirement);

  return {
    schemaVersion: 1,
    projectDir: path.resolve(projectDir),
    total,
    implemented,
    pending: total - implemented,
    implementedPct: implementedPct,
    byCategory: byCategory,
    needsTest: needsTest,
    orphanFeatures: orphans,
    specops: readSpecops(projectDir),
    requirements: items,
  };
}

function readSpecops(projectDir) {
  const lockPath = path.join(projectDir, ".specops.lock");
  if (!fs.existsSync(lockPath)) {
    return { used: false, packs: [], baselinePresent: true, drift: [] };
  }
  const drift = [];
  let packs = [];
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    packs = Array.isArray(lock.packs) ? lock.packs : [];
  } catch (err) {
    drift.push(`.specops.lock is not valid JSON: ${err.message}`);
  }
  const baselinePresent =
    packs.length === 0 || fs.existsSync(path.join(projectDir, ".specops", "baseline"));
  if (!baselinePresent) {
    drift.push(".specops/baseline/ is missing — `specops sync` cannot three-way merge.");
  }
  return {
    used: true,
    packs: packs.map((p) => ({
      pack: p.pack || p.name || "(unknown)",
      version: p.version || p.ref || "",
    })),
    baselinePresent: baselinePresent,
    drift,
  };
}

// ── Trend history ──────────────────────────────────────────────────────────────────

function readHistory(projectDir) {
  const file = path.join(projectDir, HISTORY_REL);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (typeof e.implementedPct === "number") out.push(e);
    } catch {
      /* skip malformed history line */
    }
  }
  return out;
}

function appendHistory(projectDir, report, now) {
  const file = path.join(projectDir, HISTORY_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = {
    ts: now.toISOString(),
    total: report.total,
    implemented: report.implemented,
    implementedPct: report.implementedPct,
  };
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

// ── Rendering ──────────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CATEGORY_LABELS = {
  DONE: "Done",
  NEEDS_STATUS_UPDATE: "Awaiting status",
  NEEDS_IMPLEMENTATION: "Code missing",
  NEEDS_TEST: "Test missing",
  NEEDS_FEATURE: "Feature missing",
  NEEDS_EVERYTHING: "Nothing yet",
};

function sparkline(history) {
  const pts = history.map((h) => h.implementedPct);
  if (pts.length < 2) return "";
  const w = 240;
  const h = 40;
  const max = 100;
  const step = w / (pts.length - 1);
  const coords = pts
    .map((p, i) => `${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(" ");
  const last = coords.split(" ").pop().split(",");
  return (
    `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" ` +
    `aria-label="Coverage trend over ${pts.length} runs">` +
    `<polyline fill="none" stroke="#2f9e44" stroke-width="2" points="${coords}"/>` +
    `<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#2f9e44"/>` +
    `</svg>`
  );
}

function tile(value, label, tone = "") {
  return (
    `<div class="tile ${tone || ""}">` +
    `<div class="tile-value">${esc(value)}</div>` +
    `<div class="tile-label">${esc(label)}</div></div>`
  );
}

function renderHtml(report, opts) {
  const generatedAt = (opts && opts.generatedAt) || new Date();
  const history = (opts && opts.history) || [];
  const pct = report.implementedPct;
  const projectName = path.basename(report.projectDir);

  const rows = report.requirements
    .map((it) => {
      const mark = (b) => (b ? '<span class="ok">✓</span>' : '<span class="no">·</span>');
      const catLabel = CATEGORY_LABELS[it.category] || it.category;
      const catClass = it.category === "DONE" ? "done" : "todo";
      return (
        `<tr>` +
        `<td class="req">${esc(it.requirement)}</td>` +
        `<td>${esc(it.status || "—")}</td>` +
        `<td class="ctr">${mark(it.feature_exists)}</td>` +
        `<td class="ctr">${mark(it.test_exists)}</td>` +
        `<td class="ctr">${mark(it.technical_exists)}</td>` +
        `<td><span class="badge ${catClass}">${esc(catLabel)}</span></td>` +
        `</tr>`
      );
    })
    .join("\n");

  const specopsBlock = report.specops.used
    ? `<h2>Domain packs</h2><p>${
        report.specops.packs
          .map((p) => `<code>${esc(p.pack)}</code> ${esc(p.version)}`)
          .join(", ") || "—"
      }</p>` +
      (report.specops.drift.length
        ? `<ul class="drift">${report.specops.drift.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
        : `<p class="ok-line">✓ No specops drift detected.</p>`)
    : "";

  const orphanBlock = report.orphanFeatures.length
    ? `<h2>Orphan feature files</h2><ul class="drift">${report.orphanFeatures
        .map((f) => `<li><code>${esc(f)}</code></li>`)
        .join("")}</ul>`
    : "";

  const trendBlock = sparkline(history)
    ? `<div class="trend"><span class="trend-label">Coverage trend</span>${sparkline(history)}</div>`
    : "";

  const pctTone = pct >= 80 ? "good" : pct >= 40 ? "warn" : "bad";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spec coverage — ${esc(projectName)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0; padding: 2rem; background: #f7f8fa; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #16181d; color: #e6e6e6; } }
  header { max-width: 960px; margin: 0 auto 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .meta { color: #888; font-size: .85rem; }
  main { max-width: 960px; margin: 0 auto; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem; margin: 1.5rem 0; }
  .tile { background: #fff; border: 1px solid #e3e5e9; border-radius: 10px; padding: 1rem 1.25rem; }
  @media (prefers-color-scheme: dark) { .tile { background: #21242b; border-color: #2f333c; } }
  .tile-value { font-size: 2rem; font-weight: 700; line-height: 1; }
  .tile-label { color: #888; font-size: .8rem; margin-top: .35rem; text-transform: uppercase; letter-spacing: .03em; }
  .tile.good .tile-value { color: #2f9e44; }
  .tile.warn .tile-value { color: #e8a91d; }
  .tile.bad .tile-value { color: #e03131; }
  .bar { height: 12px; border-radius: 6px; background: #e3e5e9; overflow: hidden; margin: .5rem 0 0; }
  @media (prefers-color-scheme: dark) { .bar { background: #2f333c; } }
  .bar > span { display: block; height: 100%; background: #2f9e44; }
  .trend { display: flex; align-items: center; gap: 1rem; margin: 1rem 0; }
  .trend-label { color: #888; font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; font-size: .9rem;
    background: #fff; border: 1px solid #e3e5e9; border-radius: 10px; overflow: hidden; }
  @media (prefers-color-scheme: dark) { table { background: #21242b; border-color: #2f333c; } }
  th, td { padding: .55rem .75rem; text-align: left; border-bottom: 1px solid #eceef1; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #2a2e36; } }
  th { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  td.ctr, th.ctr { text-align: center; }
  td.req { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  .ok { color: #2f9e44; font-weight: 700; }
  .no { color: #c0c4cc; }
  .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .75rem; }
  .badge.done { background: #d3f9d8; color: #2b8a3e; }
  .badge.todo { background: #fff3bf; color: #b08900; }
  @media (prefers-color-scheme: dark) {
    .badge.done { background: #133a1c; color: #69db7c; }
    .badge.todo { background: #3a3312; color: #ffd43b; }
  }
  h2 { font-size: 1rem; margin: 1.75rem 0 .5rem; }
  .drift { color: #e03131; }
  .ok-line { color: #2f9e44; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  .table-wrap { overflow-x: auto; }
</style>
</head>
<body>
<header>
  <h1>Spec coverage — ${esc(projectName)}</h1>
  <div class="meta">Generated ${esc(generatedAt.toISOString())} · ${esc(report.total)} requirement(s)</div>
</header>
<main>
  <div class="tiles">
    ${tile(pct + "%", "Implemented", pctTone)}
    ${tile(report.implemented, "Done")}
    ${tile(report.pending, "Pending")}
    ${tile(report.needsTest.length, "Missing a test", report.needsTest.length ? "warn" : "good")}
    ${tile(report.orphanFeatures.length, "Orphan features", report.orphanFeatures.length ? "bad" : "good")}
  </div>
  <div class="bar"><span style="width:${pct}%"></span></div>
  ${trendBlock}
  <div class="table-wrap">
  <table>
    <thead><tr>
      <th>REQ</th><th>Status</th><th class="ctr">Feature</th>
      <th class="ctr">Test</th><th class="ctr">Code</th><th>State</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
  ${specopsBlock}
  ${orphanBlock}
</main>
</body>
</html>
`;
}

function renderJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}

// ── CLI ────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts: any = {
    projectDir: ".",
    format: "html",
    out: null,
    stdout: false,
    record: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--format" && argv[i + 1]) opts.format = argv[++i];
    else if (a === "--html") opts.format = "html";
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "--record") opts.record = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  if (!["html", "json"].includes(opts.format)) {
    process.stderr.write(`Invalid --format: ${opts.format}. Expected: html | json.\n`);
    process.exit(2);
  }
  return opts;
}

function usage() {
  process.stdout.write(
    `\n  📊 report — spec-coverage dashboard\n\n` +
      `  USAGE\n` +
      `    create-spec-driven-app report [--project-dir <path>] [--format html|json]\n` +
      `                                  [--out <file>] [--stdout] [--record]\n\n` +
      `  OPTIONS\n` +
      `    --project-dir <path>  Project root (default: cwd).\n` +
      `    --format html|json    Output format (default: html).\n` +
      `    --out <file>          Write here (default: reports/spec-coverage.{html,json}).\n` +
      `    --stdout              Print to stdout instead of a file.\n` +
      `    --record              Append this run to reports/spec-coverage-history.jsonl (trend).\n` +
      `    -h, --help            Show this help.\n\n`
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    process.stderr.write(`docs/specs/traceability.md not found in ${projectDir}\n`);
    process.exit(2);
  }

  const report = buildReport(projectDir);
  const now = new Date();
  if (opts.record) appendHistory(projectDir, report, now);

  const history = readHistory(projectDir);
  const output =
    opts.format === "json" ? renderJson(report) : renderHtml(report, { generatedAt: now, history });

  if (opts.stdout) {
    process.stdout.write(output);
  } else {
    const defaultOut =
      opts.format === "json" ? "reports/spec-coverage.json" : "reports/spec-coverage.html";
    const outPath = path.isAbsolute(opts.out || defaultOut)
      ? opts.out || defaultOut
      : path.join(projectDir, opts.out || defaultOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
    process.stdout.write(
      `📊 Wrote ${path.relative(projectDir, outPath) || outPath} — ` +
        `${report.implementedPct}% implemented (${report.implemented}/${report.total}).\n`
    );
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { buildReport, renderHtml, renderJson, readSpecops, sparkline, parseArgs };
