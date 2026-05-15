#!/usr/bin/env node
"use strict";

/**
 * `csda harness run` — the spec-driven delivery loop for AI coding agents.
 *
 * A spec-driven repo is already an environment for an agent: `plan` is the
 * task queue, the feature file + AI_RULES.md are the per-task context,
 * `validate --strict-tdd` + the project test command are the reward signal,
 * and `done` is the state transition. This command is the missing
 * orchestration layer — it runs plan → context → agent → verify → done
 * without a human copy-pasting prompts.
 *
 * For each pending requirement, in an isolated `git worktree` on a fresh
 * `harness/REQ-NNN` branch:
 *   1. Build a self-contained prompt (Gherkin + AI_RULES + paths + retry feedback).
 *   2. Shell out to the user-configured agent ({prompt_file} placeholder).
 *   3. Gate: `validate --strict-tdd` + the project test command.
 *   4. Green → `done REQ-NNN` + commit. Red → retry N times feeding the failure.
 *   5. Emit a pass/fail/attempts report.
 *
 * Vendor-neutral by construction: the agent is any shell command. The
 * harness never merges a branch — a human reviews and merges.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { resolveProjectDir } = require("../lib/project-root");
const { buildPrompt } = require("./prompt");
const { readHarnessConfig, resolveHarnessSettings } = require("./config");

const PLAN_SCRIPT = path.join(__dirname, "..", "plan.js");
const DONE_SCRIPT = path.join(__dirname, "..", "done.js");
const VALIDATE_SCRIPT = path.join(__dirname, "..", "validate_specs.js");

function info(msg) {
  process.stdout.write(`ℹ️  [harness] ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`⚠️  [harness] ${msg}\n`);
}
function error(msg) {
  process.stderr.write(`❌ [harness] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app harness run [options]\n\n" +
      "Runs the plan → agent → verify → done loop for every pending requirement.\n\n" +
      "  --agent <cmd>          Agent command; must contain the {prompt_file} placeholder.\n" +
      '                         e.g. --agent "claude -p < {prompt_file}"\n' +
      "  --test-cmd <cmd>       Project test command run as part of the gate (optional).\n" +
      "  --max-attempts <n>     Retries per requirement, feeding back the failure (default 3).\n" +
      "  --req <REQ-NNN>        Limit to specific requirement(s); repeatable.\n" +
      "  --project-dir <path>   Project root (auto-detected from cwd if omitted).\n" +
      "  --base-branch <ref>    Branch/ref each worktree is cut from (default: current HEAD).\n" +
      "  --timeout <seconds>    Per-agent-invocation timeout (default 600).\n" +
      "  --keep-worktrees       Do not remove worktrees after each requirement.\n" +
      "  --force                Recreate harness/REQ-NNN branches that already exist.\n" +
      "  --format <text|json>   Report format (default text).\n" +
      "  --dry-run              Build prompts and print them; never invoke the agent.\n\n" +
      "`--agent` and `--test-cmd` may also be set in harness.config.yaml.\n"
  );
}

function parseArgs(argv) {
  const args = {
    projectDir: ".",
    agent: "",
    testCmd: "",
    maxAttempts: 0,
    reqs: [] as string[],
    baseBranch: "",
    timeout: 600,
    keepWorktrees: false,
    force: false,
    format: "text",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--project-dir") {
      args.projectDir = argv[++i] || "";
    } else if (token === "--agent") {
      args.agent = argv[++i] || "";
    } else if (token === "--test-cmd") {
      args.testCmd = argv[++i] || "";
    } else if (token === "--max-attempts") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("--max-attempts must be a positive integer");
      }
      args.maxAttempts = n;
    } else if (token === "--req") {
      const r = argv[++i] || "";
      if (!/^REQ-\d+$/.test(r)) throw new Error(`--req expects REQ-NNN, got: ${r}`);
      args.reqs.push(r);
    } else if (token === "--base-branch") {
      args.baseBranch = argv[++i] || "";
    } else if (token === "--timeout") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--timeout must be a positive integer");
      args.timeout = n;
    } else if (token === "--keep-worktrees") {
      args.keepWorktrees = true;
    } else if (token === "--force") {
      args.force = true;
    } else if (token === "--format") {
      args.format = argv[++i] || "";
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (!["text", "json"].includes(args.format)) {
    throw new Error(`Invalid --format: ${args.format}. Expected: text | json.`);
  }
  return args;
}

/**
 * Substitute the {prompt_file} placeholder in an agent command template.
 * Throws when the template is missing the placeholder — without it the agent
 * would never receive the prompt.
 */
function substituteAgentCommand(template, promptFile) {
  if (!template.includes("{prompt_file}")) {
    throw new Error(
      "The agent command must contain the {prompt_file} placeholder, e.g. " +
        '--agent "claude -p < {prompt_file}"'
    );
  }
  return template.split("{prompt_file}").join(promptFile);
}

function git(projectDir, gitArgs, opts = {}) {
  return spawnSync("git", ["-C", projectDir, ...gitArgs], { encoding: "utf8", ...opts });
}

function isGitClean(projectDir) {
  const r = git(projectDir, ["status", "--porcelain"]);
  if (r.status !== 0) {
    throw new Error(`git status failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim() === "";
}

function branchExists(projectDir, branch) {
  const r = git(projectDir, ["branch", "--list", branch]);
  return r.status === 0 && r.stdout.trim() !== "";
}

function runPlan(projectDir) {
  const r = spawnSync(
    process.execPath,
    [PLAN_SCRIPT, "--project-dir", projectDir, "--format", "json"],
    {
      encoding: "utf8",
    }
  );
  if (r.status !== 0) {
    throw new Error(`plan failed:\n${r.stderr || r.stdout}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    throw new Error(`plan produced invalid JSON: ${err.message}`);
  }
  return parsed;
}

// Generous maxBuffer for captured subprocess output — Maven/Gradle first runs
// can easily produce >1 MB of dependency-download log, and `spawnSync`'s
// default 1 MB ceiling otherwise kills the gate with ENOBUFS.
const SUBPROCESS_MAX_BUFFER = 64 * 1024 * 1024;

/** Run the gate (validate --strict-tdd, then the optional test command). */
function runGate(worktreeDir, testCmd, timeoutMs) {
  const validate = spawnSync(process.execPath, [VALIDATE_SCRIPT, worktreeDir, "--strict-tdd"], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: SUBPROCESS_MAX_BUFFER,
  });
  if (validate.status !== 0) {
    return { ok: false, stage: "validate --strict-tdd", output: validate.stdout + validate.stderr };
  }
  if (testCmd) {
    const test = spawnSync(testCmd, {
      shell: true,
      cwd: worktreeDir,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: SUBPROCESS_MAX_BUFFER,
    });
    if (test.status !== 0) {
      return { ok: false, stage: "test command", output: test.stdout + test.stderr };
    }
  }
  return { ok: true };
}

function attemptRequirement(req, ctx) {
  const { worktreeDir, settings, timeoutMs, hint } = ctx;
  let previousFailure = "";

  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    info(`${req.requirement}: attempt ${attempt}/${settings.maxAttempts}`);

    const prompt = buildPrompt(req, worktreeDir, {
      promptPrefix: settings.promptPrefix,
      hint,
      previousFailure: previousFailure || undefined,
      attempt,
      maxAttempts: settings.maxAttempts,
    });
    const promptFile = path.join(
      os.tmpdir(),
      `csda-harness-prompt-${req.requirement}-${crypto.randomBytes(4).toString("hex")}.md`
    );
    fs.writeFileSync(promptFile, prompt, "utf8");
    // Audit copy alongside the project so reviewers can see exactly what
    // the agent received for each attempt. Best-effort: never fail the run
    // because of a bookkeeping write.
    try {
      const archiveDir = path.join(ctx.projectDir, ".specops", "harness-prompts");
      fs.mkdirSync(archiveDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.writeFileSync(
        path.join(archiveDir, `${req.requirement}-${ts}-attempt-${attempt}.md`),
        prompt,
        "utf8"
      );
    } catch {
      /* never fail the run on an audit-log write */
    }

    try {
      const command = substituteAgentCommand(settings.agent, promptFile);
      const agent = spawnSync(command, {
        shell: true,
        cwd: worktreeDir,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: SUBPROCESS_MAX_BUFFER,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (agent.error && agent.error.code === "ETIMEDOUT") {
        previousFailure = `Agent timed out after ${ctx.timeoutSeconds}s.`;
        warn(`${req.requirement}: agent timed out`);
        continue;
      }
      if (agent.status !== 0) {
        previousFailure = `Agent exited ${agent.status}.\n${agent.stdout || ""}${agent.stderr || ""}`;
        warn(`${req.requirement}: agent exited ${agent.status}`);
        continue;
      }
    } finally {
      fs.rmSync(promptFile, { force: true });
    }

    const gate = runGate(worktreeDir, settings.testCmd, timeoutMs);
    if (!gate.ok) {
      previousFailure = `Gate failed at: ${gate.stage}\n\n${gate.output}`;
      warn(`${req.requirement}: gate failed at ${gate.stage}`);
      continue;
    }

    // Green — close the loop inside the worktree.
    const done = spawnSync(
      process.execPath,
      [DONE_SCRIPT, req.requirement, "--project-dir", worktreeDir],
      { encoding: "utf8" }
    );
    if (done.status !== 0) {
      previousFailure = `done ${req.requirement} failed:\n${done.stdout}${done.stderr}`;
      warn(`${req.requirement}: done failed`);
      continue;
    }

    git(worktreeDir, ["add", "-A"]);
    const commit = git(worktreeDir, [
      "commit",
      "-m",
      `feat(${req.requirement}): implement via csda harness\n\nAttempt ${attempt}/${settings.maxAttempts}.`,
    ]);
    if (commit.status !== 0) {
      previousFailure = `git commit failed:\n${commit.stderr || commit.stdout}`;
      warn(`${req.requirement}: commit failed`);
      continue;
    }

    return { result: "pass", attempts: attempt };
  }

  return { result: "fail", attempts: settings.maxAttempts, error: previousFailure };
}

function processRequirement(req, ctx) {
  const { projectDir, baseRef, keepWorktrees, force } = ctx;
  const branch = `harness/${req.requirement}`;
  const worktreeDir = path.join(
    os.tmpdir(),
    `csda-harness-${req.requirement}-${crypto.randomBytes(4).toString("hex")}`
  );

  git(projectDir, ["worktree", "prune"]);

  if (branchExists(projectDir, branch)) {
    if (!force) {
      return {
        requirement: req.requirement,
        category: req.category,
        result: "skipped",
        attempts: 0,
        branch,
        error: `Branch ${branch} already exists. Re-run with --force to recreate it.`,
      };
    }
    git(projectDir, ["branch", "-D", branch]);
  }

  const add = git(projectDir, ["worktree", "add", "-b", branch, worktreeDir, baseRef]);
  if (add.status !== 0) {
    return {
      requirement: req.requirement,
      category: req.category,
      result: "fail",
      attempts: 0,
      branch,
      error: `git worktree add failed:\n${add.stderr || add.stdout}`,
    };
  }

  try {
    const outcome = attemptRequirement(req, { ...ctx, worktreeDir });
    return {
      requirement: req.requirement,
      category: req.category,
      branch,
      ...outcome,
    };
  } finally {
    if (!keepWorktrees) {
      git(projectDir, ["worktree", "remove", "--force", worktreeDir]);
    } else {
      info(`${req.requirement}: worktree kept at ${worktreeDir}`);
    }
  }
}

function printReport(results, format) {
  if (format === "json") {
    const summary = results.reduce((acc, r) => {
      acc[r.result] = (acc[r.result] || 0) + 1;
      return acc;
    }, {});
    process.stdout.write(
      JSON.stringify({ schema_version: 1, total: results.length, summary, results }, null, 2) + "\n"
    );
    return;
  }

  process.stdout.write("\n── harness report ──\n");
  for (const r of results) {
    const icon = r.result === "pass" ? "✅" : r.result === "skipped" ? "⏭️ " : "❌";
    process.stdout.write(
      `  ${icon} ${r.requirement}  ${r.result} (${r.attempts} attempt${r.attempts === 1 ? "" : "s"})  → ${r.branch}\n`
    );
    if (r.result !== "pass" && r.error) {
      const firstLine = String(r.error).split("\n")[0];
      process.stdout.write(`       ${firstLine}\n`);
    }
  }
  const pass = results.filter((r) => r.result === "pass").length;
  const fail = results.filter((r) => r.result === "fail").length;
  const skip = results.filter((r) => r.result === "skipped").length;
  process.stdout.write(`\n  ${pass} passed · ${fail} failed · ${skip} skipped\n`);
  if (pass > 0) {
    process.stdout.write(`  Review and merge the harness/* branches you trust.\n`);
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const projectDir = resolveProjectDir(args.projectDir, { requireSentinel: true });

    const fileConfig = readHarnessConfig(projectDir);
    const settings = resolveHarnessSettings(fileConfig, args);

    if (!args.dryRun && !settings.agent) {
      throw new Error(
        'No agent configured. Pass --agent "<cmd with {prompt_file}>" or set `agent:` ' +
          "in harness.config.yaml."
      );
    }

    const plan = runPlan(projectDir);
    let pending = (plan.requirements || []).filter((r) => r.category !== "DONE");
    if (args.reqs.length > 0) {
      const wanted = new Set(args.reqs);
      pending = pending.filter((r) => wanted.has(r.requirement));
      const found = new Set(pending.map((r) => r.requirement));
      for (const want of args.reqs) {
        if (!found.has(want)) warn(`${want} is not a pending requirement — skipped.`);
      }
    }

    if (pending.length === 0) {
      info("No pending requirements. Nothing to do.");
      process.exit(0);
    }

    const hintByReq = new Map((plan.next_steps || []).map((s) => [s.requirement, s.hint]));

    if (args.dryRun) {
      info(`Dry run — ${pending.length} requirement(s) would be processed:`);
      for (const req of pending) {
        const prompt = buildPrompt(req, projectDir, {
          promptPrefix: settings.promptPrefix,
          hint: hintByReq.get(req.requirement),
        });
        process.stdout.write(
          `\n${"═".repeat(72)}\n${req.requirement} (${req.category}) → branch harness/${req.requirement}\n${"═".repeat(72)}\n`
        );
        process.stdout.write(prompt + "\n");
      }
      process.exit(0);
    }

    if (!isGitClean(projectDir)) {
      throw new Error(
        "Working tree is not clean. Commit or stash your changes before running the harness."
      );
    }

    const baseRef = args.baseBranch || "HEAD";
    info(`Processing ${pending.length} requirement(s) from base ${baseRef}.`);

    const ctx = {
      projectDir,
      baseRef,
      settings,
      timeoutMs: args.timeout * 1000,
      timeoutSeconds: args.timeout,
      keepWorktrees: args.keepWorktrees,
      force: args.force,
    };

    const results = [];
    for (const req of pending) {
      results.push(processRequirement(req, { ...ctx, hint: hintByReq.get(req.requirement) }));
    }

    printReport(results, args.format);

    const failed = results.filter((r) => r.result !== "pass").length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, substituteAgentCommand, printReport };
