#!/usr/bin/env node
"use strict";

/**
 * `csda onboard` — the guided tour for a repository that has code but no specs.
 *
 * `adopt` installs the skeleton. That is the mechanical half, and it leaves the
 * hardest question unanswered: *what are this system's capabilities?* Staring
 * at an empty `spec.md` is where brownfield adoption stalls.
 *
 * So this reads the repository and proposes an answer — capabilities inferred
 * from how the code is already organised, since a team that has directories
 * called `billing/` and `auth/` has already drawn its bounded contexts, just
 * not written them down. The proposal is a starting point to argue with, never
 * a verdict; every capability it suggests names the evidence it came from.
 */

const fs = require("node:fs");
const path = require("node:path");

const { resolveProjectDir } = require("./lib/project-root");
const { error, info } = require("./lib/diagnostics");
const { agentIo, wantsJson, EXIT } = require("./lib/agent");
const { detectStack } = require("./adopt_project");

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  cyan: COLOR ? "\x1b[36m" : "",
};

/** Directories that describe the build, not the domain. */
const NOT_DOMAIN = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "vendor",
  ".git",
  ".github",
  ".idea",
  ".vscode",
  ".next",
  ".gradle",
  ".csda",
  ".specops",
  "test",
  "tests",
  "spec",
  "specs",
  "docs",
  "doc",
  "scripts",
  "tools",
  "bin",
  "config",
  "assets",
  "public",
  "static",
  "resources",
  "fixtures",
  "examples",
  "src",
  "main",
  "java",
  "lib",
  "app",
  "internal",
  "pkg",
  "cmd",
  "features",
  "com",
  "org",
  "net",
  "io",
  "migrations",
  "templates",
  "packages",
]);

/**
 * Where a codebase keeps its domain. Checked in order; the first that exists
 * and has subdirectories wins, because that is the level a team named.
 */
const DOMAIN_ROOTS = [
  "src/main/java",
  "src/main/kotlin",
  "src/domain",
  "src/modules",
  "src/features",
  "src/contexts",
  "src/app",
  "src/packages",
  "app/domain",
  "domain",
  "modules",
  "contexts",
  "services",
  "internal",
  "pkg",
  "src",
  "app",
  "lib",
];

function subdirectories(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Walk down through single-child directories. A Java package root is
 * `src/main/java/com/acme/`, and stopping at `com` would propose `com` as a
 * capability.
 */
function descendThroughWrappers(root) {
  let current = root;
  // Descend while there is exactly one child: a directory with a single
  // subdirectory is a wrapper, not a choice. Stopping at the first *meaningful*
  // name instead proposed the organisation — `com/acme` yields `acme`, not the
  // packages under it.
  for (let depth = 0; depth < 6; depth++) {
    const children = subdirectories(current);
    if (children.length !== 1) return current;
    current = path.join(current, children[0]);
  }
  return current;
}

function countFiles(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total < 500) {
    const next = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(next, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!NOT_DOMAIN.has(entry.name.toLowerCase())) stack.push(path.join(next, entry.name));
      } else total++;
    }
  }
  return total;
}

function titleCase(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Capabilities proposed from how the code is already organised. */
function proposeCapabilities(projectDir) {
  for (const candidate of DOMAIN_ROOTS) {
    const root = path.join(projectDir, candidate);
    if (!fs.existsSync(root)) continue;

    const base = descendThroughWrappers(root);
    const names = subdirectories(base).filter((n) => !NOT_DOMAIN.has(n.toLowerCase()));
    if (names.length < 2) continue;

    return names
      .map((name) => ({
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        title: titleCase(name),
        evidence: path.relative(projectDir, path.join(base, name)).split(path.sep).join("/"),
        files: countFiles(path.join(base, name)),
      }))
      .filter((cap) => cap.files > 0)
      .sort((a, b) => b.files - a.files)
      .slice(0, 8);
  }
  return [];
}

function isAdopted(projectDir) {
  return fs.existsSync(path.join(projectDir, "spec.md"));
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🧭 onboard${c.reset}  ${c.dim}— the guided tour for an existing repository${c.reset}\n\n` +
      "  USAGE\n    csda onboard [--project-dir <path>] [--json]\n\n" +
      "  Reads the repository, proposes the capabilities its code already implies,\n" +
      "  and tells you the one command to run next. Writes nothing.\n\n"
  );
}

function main(argv) {
  const io = agentIo(wantsJson(argv));
  const NULL_SHAPE = { onboarding: null };

  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(EXIT.OK);
  }

  const dirFlag = argv.indexOf("--project-dir");
  const requested = dirFlag !== -1 ? argv[dirFlag + 1] : ".";

  // Unlike every other command, onboard runs on repositories that are not
  // spec-driven yet — that is the whole point — so a failed resolve is normal.
  let projectDir;
  try {
    projectDir = resolveProjectDir(requested);
  } catch {
    projectDir = path.resolve(requested);
  }

  if (!fs.existsSync(projectDir)) {
    io.usage(NULL_SHAPE, [
      error("project_dir_not_found", `Directory not found: ${projectDir}`, {
        fix: "Point --project-dir at the repository you want to onboard.",
      }),
    ]);
  }

  const adopted = isAdopted(projectDir);
  const stack = detectStack(projectDir);
  const capabilities = proposeCapabilities(projectDir);

  const nextCommand = !adopted
    ? "csda adopt"
    : capabilities.length > 0
      ? `csda change new describe-${capabilities[0].id}`
      : 'csda req add "<the first behaviour you rely on>"';

  const diagnostics = [];
  if (!stack.detected) {
    diagnostics.push(
      info("stack_undetected", "Could not detect the stack from a manifest file.", {
        fix: 'Pass it explicitly: csda adopt --var STACK="…" --var TEST_CMD="…"',
      })
    );
  }
  if (capabilities.length === 0) {
    diagnostics.push(
      info("capabilities_undetected", "No capability structure was obvious from the layout.", {
        fix: "Name them yourself — one per area of behaviour a user would recognise. `csda change new <id>` opens the first.",
      })
    );
  }

  io.emit(
    {
      onboarding: {
        projectDir,
        adopted,
        stack: {
          name: stack.STACK,
          testing: stack.TESTING,
          testCommand: stack.TEST_CMD,
          detectedFrom: stack.detected || null,
        },
        capabilities,
        nextCommand,
      },
      status: diagnostics,
    },
    () => renderHuman({ projectDir, adopted, stack, capabilities, nextCommand })
  );
  process.exit(EXIT.OK);
}

function renderHuman({ projectDir, adopted, stack, capabilities, nextCommand }) {
  const out = [];
  out.push(`\n  ${c.bold}${c.cyan}🧭 onboarding${c.reset}  ${c.dim}${projectDir}${c.reset}\n`);

  out.push(`  ${c.bold}1. What this is${c.reset}`);
  out.push(`     stack:  ${stack.STACK}`);
  if (stack.TEST_CMD) out.push(`     tests:  ${stack.TEST_CMD}`);
  out.push(
    `     ${stack.detected ? `${c.dim}detected from ${stack.detected}${c.reset}` : `${c.dim}no manifest found — say so with --var STACK="…"${c.reset}`}`
  );
  out.push("");

  out.push(`  ${c.bold}2. Specs${c.reset}`);
  out.push(
    adopted
      ? `     ${c.green}✔${c.reset} already adopted — spec.md is here`
      : `     ${c.dim}· not adopted yet — \`csda adopt\` writes the skeleton without touching code${c.reset}`
  );
  out.push("");

  out.push(`  ${c.bold}3. Capabilities this codebase already implies${c.reset}`);
  if (capabilities.length === 0) {
    out.push(`     ${c.dim}Nothing obvious from the layout. Name them yourself — one per`);
    out.push(`     area of behaviour a user would recognise.${c.reset}`);
  } else {
    for (const cap of capabilities) {
      out.push(
        `     ${c.green}·${c.reset} ${cap.title.padEnd(20)} ${c.dim}${cap.evidence}  (${cap.files} files)${c.reset}`
      );
    }
    out.push("");
    out.push(`     ${c.dim}A proposal, not a verdict. Merge, split or rename them.${c.reset}`);
  }
  out.push("");

  out.push(`  ${c.bold}Next${c.reset}`);
  out.push(`     ${c.green}${nextCommand}${c.reset}\n`);
  process.stdout.write(`${out.join("\n")}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, proposeCapabilities, descendThroughWrappers, titleCase, NOT_DOMAIN };
