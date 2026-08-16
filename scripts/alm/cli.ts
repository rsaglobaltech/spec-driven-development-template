#!/usr/bin/env node
"use strict";

/**
 * `alm` — keep the traceability matrix and the enterprise ALM
 * (Jira / Azure Boards) in sync.
 *
 * Usage:
 *   create-spec-driven-app alm sync   [--project-dir <dir>] [--dry-run]
 *   create-spec-driven-app alm link   <REQ-id> <issue-key> [--project-dir <dir>]
 *   create-spec-driven-app alm status [--project-dir <dir>]
 */

const { resolveProjectDir } = require("../lib/project-root");
const {
  readAlmConfig,
  readAlmMap,
  writeAlmMap,
  extractRequirements,
  syncRequirements,
} = require("./core");
const { makeClient } = require("./clients");

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logWarn(msg) {
  process.stdout.write(`⚠️ [WARN] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app alm sync   [--project-dir <dir>] [--dry-run]\n" +
      "  create-spec-driven-app alm link   <REQ-id> <issue-key> [--project-dir <dir>]\n" +
      "  create-spec-driven-app alm status [--project-dir <dir>]\n\n" +
      "sync   Creates an ALM issue for every unlinked REQ, closes issues whose REQ\n" +
      "       is Implemented, and reports drift (issue done, REQ still open).\n" +
      "link   Manually map an existing issue to a requirement.\n" +
      "status Print the current REQ ↔ issue mapping without network access.\n\n" +
      "Configuration: alm.config.yaml at the project root (provider, base_url,\n" +
      "project_key, token_env). Tokens come from the environment, never the file.\n"
  );
}

function parseCommon(argv) {
  const opts = { projectDir: ".", dryRun: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (argv[i] === "--dry-run") opts.dryRun = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      usage();
      process.exit(0);
    } else opts.rest.push(argv[i]);
  }
  return opts;
}

async function main() {
  let argv = process.argv.slice(2);
  if (argv[0] === "alm") argv = argv.slice(1);
  const sub = argv[0];
  const opts = parseCommon(argv.slice(1));

  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir, { requireSentinel: true });
  } catch (err) {
    logError(err.message);
    process.exit(2);
  }

  if (sub === "status") {
    const map = readAlmMap(projectDir);
    const reqs = extractRequirements(projectDir);
    for (const req of reqs) {
      const linked = map[req.id];
      process.stdout.write(
        `${req.id}  [${req.status}]  →  ${linked ? linked.issue : "(unlinked)"}\n`
      );
    }
    process.exit(0);
  }

  if (sub === "link") {
    const [reqId, issueKey] = opts.rest;
    if (!reqId || !issueKey) {
      logError("alm link expects: <REQ-id> <issue-key>");
      usage();
      process.exit(2);
    }
    if (!/^REQ-\d+$/.test(reqId)) {
      logError(`'${reqId}' is not a REQ id (expected REQ-NNN).`);
      process.exit(2);
    }
    const map = readAlmMap(projectDir);
    map[reqId] = { issue: issueKey, url: null };
    const written = writeAlmMap(projectDir, map, false);
    logInfo(`Linked ${reqId} → ${issueKey} (${written}). Commit the mapping file.`);
    process.exit(0);
  }

  if (sub === "sync") {
    try {
      const cfg = readAlmConfig(projectDir);
      const client = makeClient(cfg);
      const map = readAlmMap(projectDir);
      const reqs = extractRequirements(projectDir);
      const actions = await syncRequirements(reqs, map, client, { dryRun: opts.dryRun });

      let drift = 0;
      for (const a of actions) {
        if (a.action === "drift") {
          drift++;
          logWarn(`DRIFT ${a.req}: ${a.detail}`);
        } else if (a.action !== "in-sync") {
          logInfo(`${a.action} ${a.req}${a.issue ? ` → ${a.issue}` : ""}`);
        }
      }
      if (!opts.dryRun) writeAlmMap(projectDir, map, false);

      const summary = actions.reduce((acc, a) => {
        acc[a.action] = (acc[a.action] || 0) + 1;
        return acc;
      }, {});
      logInfo(`Summary: ${JSON.stringify(summary)}`);
      if (drift > 0) {
        logWarn(`${drift} drift finding(s) — reconcile the matrix or the board.`);
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      logError(err.message);
      process.exit(1);
    }
  }

  logError(`Unknown alm subcommand: ${sub || "(none)"}`);
  usage();
  process.exit(2);
}

main().catch((err) => {
  logError(err && err.message ? err.message : String(err));
  process.exit(1);
});
