#!/usr/bin/env node

/**
 * `studio` — local-first, read-only visualizer. Serves a single static page on
 * localhost showing project status and a Mermaid graph of the requirement →
 * scenario → status map, built straight from `traceability.md`.
 *
 * Thin layer over the CLI: it reuses the same parser/summary as `status` and
 * never writes. Not an editor, not a hosted product — just a window on the repo.
 *
 *   csda studio                 # serve on http://localhost:4173
 *   csda studio --port 8080
 *   csda studio --json          # print the model once and exit (no server)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { resolveProjectDir } from "./lib/project-root";
import { parseTraceability } from "./plan";

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
};

const DONE = new Set(["Implemented", "Verified", "Released"]);

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🎨 studio${c.reset}  ${c.dim}— local read-only visualizer (status + REQ graph)${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda studio${c.reset} [--port <n>] [--project-dir <path>] [--json]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--port <n>${c.reset}           ${c.dim}Port to serve on (default 4173).${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset} ${c.dim}Project root (auto-detected from cwd if omitted).${c.reset}\n` +
      `    ${c.green}--json${c.reset}               ${c.dim}Print the model as JSON and exit (no server).${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}           ${c.dim}Show this help.${c.reset}\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = { projectDir: ".", port: 4173, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    process.stderr.write(`Invalid --port: ${opts.port}\n`);
    process.exit(2);
  }
  return opts;
}

/** Build the view model from traceability text. Pure. */
function buildModel(traceContent) {
  const rows = parseTraceability(traceContent).filter((r) => /^REQ-\d+/.test(r.requirement || ""));
  const requirements = rows.map((r) => ({
    requirement: r.requirement,
    scenarioId: r.scenarioId || "",
    status: r.status || "Draft",
    featureFile: r.featureFile || "",
    done: DONE.has(r.status),
  }));
  const total = requirements.length;
  const done = requirements.filter((r) => r.done).length;
  return { total, done, pending: total - done, requirements };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;"
  );
}

/** Mermaid flowchart: one node per REQ, coloured done/pending, linked to its scenario. */
function mermaid(model) {
  const lines = ["flowchart LR"];
  for (const r of model.requirements) {
    const id = r.requirement.replace(/-/g, "_");
    lines.push(`  ${id}["${r.requirement}<br/>${esc(r.status)}"]:::${r.done ? "done" : "pending"}`);
    if (r.scenarioId && r.scenarioId !== "-") {
      const sid = r.scenarioId.replace(/-/g, "_");
      lines.push(`  ${id} --> ${sid}(["${esc(r.scenarioId)}"])`);
    }
  }
  lines.push("  classDef done fill:#16a34a,color:#fff,stroke:#15803d;");
  lines.push("  classDef pending fill:#f59e0b,color:#111,stroke:#b45309;");
  return lines.join("\n");
}

function renderHtml(projectDir, model) {
  const rowsHtml = model.requirements
    .map(
      (r) =>
        `<tr><td>${esc(r.requirement)}</td><td>${esc(r.scenarioId)}</td><td>${esc(
          r.status
        )}</td><td>${esc(r.featureFile)}</td></tr>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>csda studio — ${esc(path.basename(projectDir))}</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#111;background:#fafafa}
  h1{font-size:1.2rem} .muted{color:#666}
  table{border-collapse:collapse;margin-top:1rem;background:#fff}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}
  .pill{display:inline-block;padding:.1rem .5rem;border-radius:999px;color:#fff}
  .done{background:#16a34a}.pending{background:#f59e0b;color:#111}
  .mermaid{margin-top:1rem;background:#fff;padding:1rem;border:1px solid #eee}
</style></head>
<body>
  <h1>🎨 csda studio <span class="muted">${esc(projectDir)}</span></h1>
  <p>${model.total} requirements ·
     <span class="pill done">${model.done} done</span>
     <span class="pill pending">${model.pending} pending</span></p>
  <div class="mermaid">
${esc(mermaid(model))}
  </div>
  <table>
    <thead><tr><th>Requirement</th><th>Scenario</th><th>Status</th><th>Feature</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  <p class="muted">Read-only. Edit with <code>csda req</code> / <code>csda done</code>; refresh to update.</p>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true });
  </script>
</body></html>`;
}

function loadModel(projectDir) {
  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    process.stderr.write(
      `${c.red}✖${c.reset}  docs/specs/traceability.md not found in ${projectDir}\n`
    );
    process.exit(2);
  }
  return buildModel(fs.readFileSync(tracePath, "utf8"));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err: any) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { schema_version: 1, project_dir: projectDir, ...loadModel(projectDir) },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  }

  const server = http.createServer((req, res) => {
    // Re-read on every request so edits show on refresh (local-first, no cache).
    const model = loadModel(projectDir);
    if (req.url === "/status.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ project_dir: projectDir, ...model }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHtml(projectDir, model));
  });

  server.listen(opts.port, () => {
    process.stdout.write(
      `\n  ${c.bold}🎨 csda studio${c.reset} serving ${c.dim}${projectDir}${c.reset}\n` +
        `  ${c.green}▶ http://localhost:${opts.port}${c.reset}  ${c.dim}(Ctrl-C to stop · /status.json for the model)${c.reset}\n\n`
    );
  });
  server.on("error", (err: any) => {
    process.stderr.write(`${c.red}✖${c.reset}  Could not start server: ${err.message}\n`);
    process.exit(1);
  });
}

if (require.main === module) main();

export { parseArgs, buildModel, mermaid, renderHtml };
