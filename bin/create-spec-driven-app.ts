#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const rootDir = path.resolve(__dirname, "..", "..");
const distScripts = path.join(__dirname, "..", "scripts");
const packageJson = require(path.join(rootDir, "package.json"));
const VERSION: string = packageJson.version || "0.0.0";
const initNodeScript = path.join(distScripts, "init_project.js");
const validateScript = path.join(distScripts, "validate_specs.js");
const expandScript = path.join(distScripts, "expand_domain_pack.js");
const packInitScript = path.join(distScripts, "init_pack.js");
const packLintScript = path.join(distScripts, "lint_pack.js");
const packInferScript = path.join(distScripts, "infer_pack.js");
const specopsSyncScript = path.join(distScripts, "specops", "sync.js");
const specopsDiffScript = path.join(distScripts, "specops", "diff.js");
const specopsAddScript = path.join(distScripts, "specops", "add.js");
const specopsRemoveScript = path.join(distScripts, "specops", "remove.js");
const harnessRunScript = path.join(distScripts, "harness", "run.js");
const planScript = path.join(distScripts, "plan.js");
const doneScript = path.join(distScripts, "done.js");

// ── Pretty output helpers ─────────────────────────────────────────────────────────

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  blue: COLOR_ENABLED ? "\x1b[34m" : "",
  magenta: COLOR_ENABLED ? "\x1b[35m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
};

function info(msg: string): void {
  process.stdout.write(`${c.cyan}ℹ${c.reset}  ${msg}\n`);
}

function error(msg: string): void {
  process.stderr.write(`${c.red}✖${c.reset}  ${msg}\n`);
}

function banner(): string {
  return (
    `\n` +
    `  ${c.bold}${c.cyan}🧭 create-spec-driven-app${c.reset}  ${c.dim}v${VERSION}${c.reset}\n` +
    `  ${c.dim}Spec-Driven Development scaffolding — specs as executable contracts.${c.reset}\n`
  );
}

function section(title: string): string {
  return `\n  ${c.bold}${title}${c.reset}\n`;
}

function cmd(emoji: string, name: string, summary: string, pad = 16): string {
  // Use Array.from to count code points (emojis with surrogate pairs count as 1)
  const visible = Array.from(name).length;
  const padding = " ".repeat(Math.max(1, pad - visible));
  return `    ${c.green}${emoji}${c.reset}  ${c.green}${name}${c.reset}${padding}${c.dim}${summary}${c.reset}\n`;
}

function flag(name: string, summary: string, pad = 18): string {
  const visible = Array.from(name).length;
  const padding = " ".repeat(Math.max(1, pad - visible));
  return `    ${c.green}${name}${c.reset}${padding}${c.dim}${summary}${c.reset}\n`;
}

function example(line: string, comment?: string): string {
  const prefix = comment ? `    ${c.dim}# ${comment}${c.reset}\n` : "";
  return `${prefix}    ${c.yellow}$${c.reset} ${line}\n`;
}

function usage() {
  process.stdout.write(
    banner() +
      section("USAGE") +
      `    ${c.cyan}create-spec-driven-app${c.reset} ${c.bold}<command>${c.reset} [options]\n` +
      `    ${c.dim}Run ‘<command> --help’ for per-command details.${c.reset}\n` +
      section("CORE COMMANDS") +
      cmd("⚡", "init", "Scaffold a new spec-driven project from a config file.") +
      cmd("✅", "validate", "Check structure, traceability, Gherkin (+ --strict-tdd gate).") +
      cmd("🧩", "expand", "Apply a domain pack (local path or remote git tag).") +
      cmd("📋", "plan", "List requirements that still need a test or implementation.") +
      cmd("✔", "done", "Mark a requirement as Implemented in traceability.md.") +
      section("PACK COMMANDS") +
      cmd("📦", "pack init", "Scaffold a new pack skeleton (backend · frontend · contracts).") +
      cmd("🔍", "pack lint", "Lint a pack: schema, cross-refs, and scenario quality (--strict).") +
      cmd("🔮", "pack infer", "Propose a pack.yaml skeleton from a .feature file.") +
      section("SPECOPS COMMANDS") +
      cmd("➕", "specops add", "Add a pack (npm-install-style); writes .specops.lock.") +
      cmd("➖", "specops remove", "Drop a pack entry from .specops.lock.") +
      cmd(
        "🔁",
        "specops sync",
        "Re-expand packs and three-way merge them, preserving local edits."
      ) +
      cmd("📊", "specops diff", "Preview what would change on a version bump (no writes).") +
      section("HARNESS COMMANDS") +
      cmd(
        "🤖",
        "harness run",
        "Run the plan → agent → verify → done loop for every pending requirement."
      ) +
      section("GLOBAL FLAGS") +
      flag("-h, --help", "Show this help.") +
      flag("-v, --version", "Show CLI version.") +
      section("EXAMPLES") +
      example(
        `npx create-spec-driven-app@latest init --config ./project.config --out ./projects`,
        "Generate a new project"
      ) +
      example(
        `npx create-spec-driven-app@latest validate ./projects/my-app --strict-tdd`,
        "Validate with the TDD gate"
      ) +
      example(
        `npx create-spec-driven-app@latest expand --pack-root ./domain-packs \\\n        --pack parking-management/backend --project-dir ./projects/my-app \\\n        --var PROJECT_NAME="My App" --var PROJECT_SLUG=my-app --var DOMAIN="parking ops"`,
        "Apply a local pack"
      ) +
      example(
        `npx create-spec-driven-app@latest expand --pack-repo https://github.com/acme/parking-specops.git \\\n        --pack-version v0.1.0 --pack backend --project-dir ./projects/smart-parking \\\n        --var PROJECT_NAME="Smart Parking"`,
        "Apply a remote pack pinned to a git tag"
      ) +
      example(
        `npx create-spec-driven-app@latest specops sync --project-dir ./projects/smart-parking`,
        "Re-expand everything in .specops.lock / specops.config.yaml"
      ) +
      example(
        `npx create-spec-driven-app@latest specops diff --project-dir ./projects/smart-parking --pack-version v0.2.0`,
        "Preview a version bump"
      ) +
      example(
        `npx create-spec-driven-app@latest plan --project-dir ./projects/smart-parking`,
        "Show what requirements still need work"
      ) +
      example(
        `npx create-spec-driven-app@latest plan --project-dir ./projects/smart-parking --format json`,
        "Same, machine-readable for AI agents"
      ) +
      example(
        `npx create-spec-driven-app@latest done REQ-007 --check`,
        "Mark REQ-007 Implemented (after validate passes)"
      ) +
      example(
        `npx create-spec-driven-app@latest pack init --out ./domain-packs --name "Billing Backend" --type contracts`,
        "Scaffold a contracts-flavoured pack"
      ) +
      section("LEARN MORE") +
      `    ${c.dim}📖 How-to guide   ${c.reset}${c.blue}https://github.com/rsaglobaltech/spec-driven-development-template/blob/main/docs/how-to.md${c.reset}\n` +
      `    ${c.dim}🌐 Documentation  ${c.reset}${c.blue}https://rsaglobaltech.github.io/spec-driven-development-template/${c.reset}\n` +
      `    ${c.dim}🪲 Report a bug   ${c.reset}${c.blue}https://github.com/rsaglobaltech/spec-driven-development-template/issues${c.reset}\n` +
      `\n`
  );
}

function ensureExecutable(scriptPath: string): void {
  if (!fs.existsSync(scriptPath)) {
    error(`Required script not found: ${scriptPath}`);
    process.exit(3);
  }
}

function runNodeScript(scriptPath: string, args: string[]): void {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    error(`Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    error(`Process terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
  }

  const command = args[0];

  if (command === "init") {
    const passThrough = args.slice(1);
    // Reject --engine=shell — the Bash engine was removed in this release.
    const engineIdx = passThrough.indexOf("--engine");
    if (
      passThrough.includes("--engine=shell") ||
      (engineIdx !== -1 && passThrough[engineIdx + 1] === "shell")
    ) {
      error(
        "--engine=shell was removed. The CLI is now Node-only. Drop the flag to use the (sole) Node engine."
      );
      process.exit(2);
    }
    ensureExecutable(initNodeScript);
    runNodeScript(initNodeScript, passThrough);
    return;
  }

  if (command === "validate") {
    ensureExecutable(validateScript);

    const validateArgs = args.slice(1);
    const positional = validateArgs.filter((a) => !a.startsWith("-"));
    if (positional.length !== 1) {
      error(`'validate' expects exactly one positional argument: <project_dir>`);
      usage();
      process.exit(2);
    }
    const unknownFlags = validateArgs.filter((a) => a.startsWith("-") && a !== "--strict-tdd");
    if (unknownFlags.length > 0) {
      error(`Unknown flag(s) for validate: ${unknownFlags.join(", ")}`);
      usage();
      process.exit(2);
    }

    runNodeScript(validateScript, validateArgs);
    return;
  }

  if (command === "expand") {
    ensureExecutable(expandScript);
    const passThrough = args.slice(1);
    runNodeScript(expandScript, passThrough);
    return;
  }

  if (command === "plan") {
    ensureExecutable(planScript);
    runNodeScript(planScript, args.slice(1));
    return;
  }

  if (command === "done") {
    ensureExecutable(doneScript);
    runNodeScript(doneScript, args.slice(1));
    return;
  }

  if (command === "pack") {
    const subCommand = args[1];
    if (subCommand === "init") {
      ensureExecutable(packInitScript);
      runNodeScript(packInitScript, args.slice(1));
      return;
    }
    if (subCommand === "lint") {
      ensureExecutable(packLintScript);
      runNodeScript(packLintScript, args.slice(1));
      return;
    }
    if (subCommand === "infer") {
      ensureExecutable(packInferScript);
      runNodeScript(packInferScript, args.slice(1));
      return;
    }
    error(`Unknown pack sub-command: ${subCommand || "(none)"}. Expected: init, lint, infer`);
    usage();
    process.exit(2);
  }

  if (command === "harness") {
    const subCommand = args[1];
    if (subCommand === "run") {
      ensureExecutable(harnessRunScript);
      runNodeScript(harnessRunScript, args.slice(2));
      return;
    }
    error(`Unknown harness sub-command: ${subCommand || "(none)"}. Expected: run`);
    usage();
    process.exit(2);
  }

  if (command === "specops") {
    const subCommand = args[1];
    if (subCommand === "sync") {
      ensureExecutable(specopsSyncScript);
      runNodeScript(specopsSyncScript, args.slice(2));
      return;
    }
    if (subCommand === "diff") {
      ensureExecutable(specopsDiffScript);
      runNodeScript(specopsDiffScript, args.slice(2));
      return;
    }
    if (subCommand === "add") {
      ensureExecutable(specopsAddScript);
      runNodeScript(specopsAddScript, args.slice(2));
      return;
    }
    if (subCommand === "remove") {
      ensureExecutable(specopsRemoveScript);
      runNodeScript(specopsRemoveScript, args.slice(2));
      return;
    }
    error(
      `Unknown specops sub-command: ${subCommand || "(none)"}. Expected: add, remove, sync, diff`
    );
    usage();
    process.exit(2);
  }

  info(`Unknown command: ${command}`);
  usage();
  process.exit(2);
}

main();
