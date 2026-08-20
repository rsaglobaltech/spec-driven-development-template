#!/usr/bin/env node
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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { BaseCommand } from "../../../lib/command";

import { resolveProjectDir } from "../../../lib/project-root";
import { buildPrompt } from "../../../harness/prompt";
import {
  readHarnessConfig,
  resolveHarnessSettings,
} from "../../../../packages/core/src/infrastructure/HarnessConfigFile";
import {
  AttemptRecord,
  scheduleLevels,
  substituteAgentCommand,
  substituteGateCommand,
} from "../../../../packages/core/src/domain/HarnessRun";

// Three levels up from dist/scripts/cli/commands/harness is dist/scripts,
// where the command entry points live.
const SCRIPTS_DIR = path.join(__dirname, "..", "..", "..");
const PLAN_SCRIPT = path.join(SCRIPTS_DIR, "plan.js");
const DONE_SCRIPT = path.join(SCRIPTS_DIR, "done.js");
const VALIDATE_SCRIPT = path.join(SCRIPTS_DIR, "validate_specs.js");

/**
 * In `--format json` mode stdout carries exactly one JSON document and nothing
 * else — rule 1 of the agent contract (ADR-0017). It did not: progress lines
 * went to stdout alongside the report, so
 * `harness run --format json 2>/dev/null | jq .` did not parse. Nobody noticed
 * because nothing parsed it until the worker pool did.
 */
let jsonMode = false;

export function setJsonMode(on) {
  jsonMode = Boolean(on);
}

function info(msg) {
  (jsonMode ? process.stderr : process.stdout).write(`ℹ️  [harness] ${msg}\n`);
}
function warn(msg) {
  (jsonMode ? process.stderr : process.stdout).write(`⚠️  [harness] ${msg}\n`);
}
export function error(msg) {
  process.stderr.write(`❌ [harness] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  csda harness run [options]\n\n" +
      "Runs the plan → agent → verify → done loop for every pending requirement.\n\n" +
      "  --agent <cmd>          Agent command; must contain the {prompt_file} placeholder.\n" +
      '                         e.g. --agent "claude -p < {prompt_file}"\n' +
      "  --test-cmd <cmd>       Project test command run as part of the gate (optional).\n" +
      "                         Substitutes {req}, {scenario} and {feature_file}, so the\n" +
      "                         gate can run the scenario under test.\n" +
      "  --max-attempts <n>     Retries per requirement, feeding back the failure (default 3).\n" +
      "  --concurrency <n>      Requirements in flight at once (default 1). Only requirements\n" +
      "                         that do not depend on each other ever run together.\n" +
      "  --req <REQ-NNN>        Limit to specific requirement(s); repeatable.\n" +
      "  --project-dir <path>   Project root (auto-detected from cwd if omitted).\n" +
      "  --base-branch <ref>    Branch/ref each worktree is cut from (default: current HEAD).\n" +
      "  --timeout <seconds>    Per-agent-invocation timeout (default 1200).\n" +
      "  --keep-worktrees       Do not remove worktrees after each requirement.\n" +
      "  --force                Recreate harness/REQ-NNN branches that already exist.\n" +
      "  --format <text|json>   Report format (default text).\n" +
      "  --dry-run              Build prompts and print them; never invoke the agent.\n\n" +
      "CI mode (unattended runners — a nightly job that leaves PRs to review):\n" +
      "  --push                 Push each green harness/REQ-NNN branch to the remote.\n" +
      "  --remote <name>        Remote to push to (default origin).\n" +
      "  --pr-cmd <cmd>         Command run after a successful push, with {branch} and\n" +
      '                         {req} placeholders. e.g. --pr-cmd "gh pr create --head {branch} \\\n' +
      "                         --title '{req} via harness' --fill\"\n\n" +
      "`--agent`, `--test-cmd`, `push`, `remote` and `pr_cmd` may also be set in harness.config.yaml.\n"
  );
}

export function parseArgs(argv) {
  const args = {
    projectDir: ".",
    agent: "",
    testCmd: "",
    maxAttempts: 0,
    concurrency: 0,
    reqs: [] as string[],
    baseBranch: "",
    // 600 was the original guess. Both real runs disproved it: the first
    // REQ-001 attempt hit 900s while the agent installed dependencies and
    // worked, and 1500 was needed comfortably. A default that times out on
    // ordinary work turns every first attempt into a wasted one.
    timeout: 1200,
    keepWorktrees: false,
    force: false,
    format: "text",
    dryRun: false,
    push: false,
    remote: "",
    prCmd: "",
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
    } else if (token === "--concurrency") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("--concurrency must be a positive integer");
      }
      args.concurrency = n;
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
    } else if (token === "--push") {
      args.push = true;
    } else if (token === "--remote") {
      args.remote = argv[++i] || "";
    } else if (token === "--pr-cmd") {
      args.prCmd = argv[++i] || "";
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

function runGate(worktreeDir, testCmd, timeoutMs, req = {}) {
  const validate = spawnSync(process.execPath, [VALIDATE_SCRIPT, worktreeDir, "--strict-tdd"], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: SUBPROCESS_MAX_BUFFER,
  });
  if (validate.status !== 0) {
    return {
      ok: false,
      stage: "validate --strict-tdd",
      output: validate.stdout + validate.stderr,
      hint: "",
    };
  }
  if (testCmd) {
    const resolved = substituteGateCommand(testCmd, req);
    // A fresh worktree carries only what git tracks, so a project with
    // dependencies has no node_modules here. Verified the hard way: an agent
    // spent its first attempt installing them and timed out. The gate command
    // is the right place to say so, since only the project knows how.
    const test = spawnSync(resolved, {
      shell: true,
      cwd: worktreeDir,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: SUBPROCESS_MAX_BUFFER,
    });
    if (test.status !== 0) {
      // Name the command. A gate that silently does the wrong thing — running
      // the whole suite because a filter did not apply, say — produces a
      // failure indistinguishable from a real one, and the operator has no way
      // to tell without the command in front of them.
      return {
        ok: false,
        stage: `test command: ${resolved}`,
        output: test.stdout + test.stderr,
      };
    }
  }
  return { ok: true, stage: "", output: "", hint: "" };
}

function attemptRequirement(req, ctx) {
  const { worktreeDir, settings, timeoutMs, hint } = ctx;
  let previousFailure = "";
  /**
   * What each attempt cost and where it ended.
   *
   * Wall-clock, because it is the one cost the harness can measure without the
   * agent's cooperation: an agent is any shell command, and only the agent
   * knows what it spent in tokens. `csda harness report` is built on this.
   */
  const attemptLog: AttemptRecord[] = [];

  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    info(`${req.requirement}: attempt ${attempt}/${settings.maxAttempts}`);
    const attemptStart = Date.now();
    let agentMs = 0;
    const record = (stage: AttemptRecord["endedAt"]) => {
      attemptLog.push({
        attempt,
        endedAt: stage,
        agentMs,
        totalMs: Date.now() - attemptStart,
      });
    };

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
    // Audit copy so a reviewer can see exactly what the agent received for
    // each attempt. It goes in the *worktree*, not the project: `git add -A`
    // below commits it with the work, so it arrives in the branch under review
    // — which is the whole point — and the main tree stays clean.
    //
    // It used to write to the project directory, which dirtied it. The harness
    // refuses to start on a dirty tree, so the second run was blocked by the
    // droppings of the first.
    //
    // Best-effort: never fail the run because of a bookkeeping write.
    try {
      const archiveDir = path.join(worktreeDir, ".specops", "harness-prompts");
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
      const agentStart = Date.now();
      const agent = spawnSync(command, {
        shell: true,
        cwd: worktreeDir,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: SUBPROCESS_MAX_BUFFER,
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Node reports a timeout as an errno-carrying Error; the base `Error`
      // type the spawnSync signature declares does not have `code`.
      agentMs = Date.now() - agentStart;
      const agentError = agent.error as NodeJS.ErrnoException | undefined;
      if (agentError?.code === "ETIMEDOUT") {
        previousFailure = `Agent timed out after ${ctx.timeoutSeconds}s.`;
        warn(`${req.requirement}: agent timed out`);
        record("agent-timeout");
        continue;
      }
      if (agent.status !== 0) {
        previousFailure = `Agent exited ${agent.status}.\n${agent.stdout || ""}${agent.stderr || ""}`;
        warn(`${req.requirement}: agent exited ${agent.status}`);
        record("agent-error");
        continue;
      }
    } finally {
      fs.rmSync(promptFile, { force: true });
    }

    const gate = runGate(worktreeDir, settings.testCmd, timeoutMs, req);
    if (!gate.ok) {
      previousFailure =
        `Gate failed at: ${gate.stage}\n\n` + (gate.hint ? `⚠ ${gate.hint}\n\n` : "") + gate.output;
      warn(`${req.requirement}: gate failed at ${gate.stage}`);
      if (gate.hint) warn(gate.hint);
      record("gate");
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
      record("done");
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
      record("commit");
      continue;
    }

    record("pass");
    return { result: "pass", attempts: attempt, attemptLog };
  }

  // Every attempt is spent. Commit what the agent produced anyway, on the
  // branch, before the worktree is removed.
  //
  // It used to be discarded: `continue` moved to the next attempt and the
  // worktree was deleted at the end, so a failed requirement left a branch
  // identical to its base and nothing to look at. Diagnosing a failure then
  // cost a second full agent run with --keep-worktrees purely to see what had
  // been written — fifteen minutes to recover information the first run had.
  //
  // The commit subject says it failed, and `csda done` never ran, so the
  // requirement is still Draft in the matrix. A human decides whether the work
  // is worth keeping; git decides nothing.
  const preserved = preserveFailedAttempt(worktreeDir, req, previousFailure);

  return {
    result: "fail",
    attempts: settings.maxAttempts,
    error: previousFailure,
    workPreserved: preserved,
    attemptLog,
  };
}

/** Where a run's record lands. Local to the machine — see `writeRunRecord`. */
export const RUNS_DIR = path.join(".harness", "runs");

/** One run, as it will be read back by `csda harness report`. */
export interface RunRecord {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  baseRef: string;
  concurrency: number;
  maxAttempts: number;
  results: unknown[];
}

/**
 * Write what a run did, so the next question about it has an answer.
 *
 * The harness printed a report and forgot it. That is fine for one run and
 * useless for the question that decides whether agent roles are worth paying
 * for (E2-01): **what does a delivered requirement cost, and how often does the
 * first attempt work?** Neither is answerable from memory, and both are
 * answerable from a directory of these.
 *
 * The agent command is deliberately *not* recorded: it is a shell command a
 * user composed, and it is exactly the kind of string that ends up carrying an
 * API key.
 *
 * The directory ignores itself. Two reasons, and the first is not optional:
 * the harness refuses to start on a dirty tree, so a ledger git could see
 * would mean the first run makes the second one refuse — H2 of the closure
 * plan, where the harness blocked itself by writing into the project. The
 * second is that a file rewritten by every run is a merge conflict waiting to
 * happen; these numbers are local measurements, not shared history.
 *
 * Best-effort — a run that produced branches must not fail over bookkeeping.
 */
function writeRunRecord(projectDir: string, record: RunRecord): string | null {
  try {
    const dir = path.join(projectDir, RUNS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const ignore = path.join(dir, ".gitignore");
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n", "utf8");
    const file = path.join(dir, `${record.startedAt.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return file;
  } catch {
    return null;
  }
}

/**
 * The repository's main line, for the staleness check.
 *
 * `origin/HEAD` is authoritative when it is set; otherwise the conventional
 * names, in order. A repository with none of them simply gets no warning —
 * guessing wrong would be worse than staying quiet.
 */
function defaultBranch(projectDir: string): string | null {
  const head = git(projectDir, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (head.status === 0) {
    const ref = String(head.stdout).trim().replace("refs/remotes/", "");
    if (ref) return ref;
  }
  for (const name of ["main", "master"]) {
    if (git(projectDir, ["rev-parse", "--verify", "--quiet", name]).status === 0) return name;
  }
  return null;
}

/** How many commits `target` has that `ref` does not. */
function commitsBehind(projectDir: string, ref: string, target: string): number {
  const r = git(projectDir, ["rev-list", "--count", `${ref}..${target}`]);
  if (r.status !== 0) return 0;
  return Number(String(r.stdout).trim()) || 0;
}

/**
 * Warn when the base a requirement is cut from is missing work that the main
 * line already has.
 *
 * This is H9. `--base-branch harness/REQ-001` behaves exactly as git says it
 * should — the new branch inherits its base, not `main` — and it cost two
 * agent runs to discover, because a fix that had landed on `main` was simply
 * not there and the gate failed for a reason that had nothing to do with the
 * requirement. Deriving the base (below) removes the need to pass the flag;
 * this says so out loud when the derived base is stale anyway.
 */
function warnIfBaseIsStale(projectDir: string, reqId: string, base: string): void {
  const mainLine = defaultBranch(projectDir);
  if (!mainLine || mainLine === base) return;
  const behind = commitsBehind(projectDir, base, mainLine);
  if (behind === 0) return;
  warn(
    `${reqId}: base ${base} is ${behind} commit(s) behind ${mainLine}. ` +
      `A fix that landed on ${mainLine} is not in this worktree — a gate failure may not be about ${reqId}.`
  );
}

/**
 * Files the harness writes itself, and whose conflicts on an integration base
 * therefore mean nothing.
 *
 * Two sibling requirement branches *always* conflict here: each run ends with
 * `csda done REQ-NNN`, which edits the same traceability matrix. The
 * integration base exists only so an agent can see the code its dependencies
 * produced; the matrix state on a throwaway branch is consulted by nobody, and
 * each real `harness/REQ-NNN` branch keeps its own row untouched.
 */
const HARNESS_WRITTEN = ["docs/specs/traceability.md"];

/**
 * Resolve conflicts in generated files by keeping the base's version, and
 * report any conflict that is left.
 *
 * @returns conflicted paths that are *not* generated — the ones a human owns
 */
function resolveGeneratedConflicts(worktree: string): string[] {
  const listed = git(worktree, ["diff", "--name-only", "--diff-filter=U"]);
  if (listed.status !== 0) return ["(could not list conflicts)"];

  const conflicted = String(listed.stdout)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rest = conflicted.filter((p) => !HARNESS_WRITTEN.includes(p));
  if (rest.length > 0) return rest;

  for (const file of conflicted) {
    git(worktree, ["checkout", "--ours", "--", file]);
    git(worktree, ["add", "--", file]);
  }
  const commit = git(worktree, ["commit", "--no-edit"]);
  return commit.status === 0 ? [] : ["(could not conclude the merge)"];
}

/**
 * Where a requirement's worktree is cut from.
 *
 * A requirement that builds on another needs that other's code to exist, and
 * the only place it exists during a run is the dependency's own
 * `harness/REQ-NNN` branch. Deriving this is what closes H12's other half:
 * nobody has to know the order and pass `--base-branch` by hand.
 *
 * Dependencies that are already `DONE` contribute nothing here — their work is
 * in the run's base already.
 *
 * @param deps   the requirement's dependencies, in declaration order
 * @param passed REQ → branch, for the dependencies that passed in this run
 */
function deriveBase(projectDir, reqId, deps, passed, ctx) {
  const branches = deps.map((d) => passed.get(d)).filter(Boolean);

  if (branches.length === 0) return { base: ctx.baseRef };
  if (branches.length === 1) return { base: branches[0] };

  // More than one dependency produced code, on branches that know nothing of
  // each other. Cutting from one would silently omit the rest, so they are
  // integrated into a throwaway base first. This is not the merge the harness
  // refuses to do — that one is into a branch a human reviews; this is
  // assembling the context the requirement was declared to need, and a
  // conflict here is a real finding rather than a nuisance.
  const integration = `harness/base/${reqId}`;
  git(projectDir, ["branch", "-D", integration]);
  const cut = git(projectDir, ["branch", integration, ctx.baseRef]);
  if (cut.status !== 0) {
    return { error: `could not create ${integration}: ${cut.stderr || cut.stdout}` };
  }

  const worktree = path.join(
    os.tmpdir(),
    `csda-harness-base-${reqId}-${crypto.randomBytes(4).toString("hex")}`
  );
  const add = git(projectDir, ["worktree", "add", worktree, integration]);
  if (add.status !== 0) {
    return { error: `could not check out ${integration}: ${add.stderr || add.stdout}` };
  }

  try {
    for (const branch of branches) {
      const merge = git(worktree, ["merge", "--no-edit", branch]);
      if (merge.status === 0) continue;

      const unresolved = resolveGeneratedConflicts(worktree);
      if (unresolved.length > 0) {
        git(worktree, ["merge", "--abort"]);
        return {
          error:
            `${branch} conflicts with the other dependencies of ${reqId} in ` +
            `${unresolved.join(", ")}. Those are source files; a human has to decide.`,
        };
      }
    }
  } finally {
    git(projectDir, ["worktree", "remove", "--force", worktree]);
  }

  info(`${reqId}: base is ${branches.join(" + ")} integrated into ${integration}`);
  return { base: integration };
}

/**
 * Commit a failed attempt so the branch carries what the agent wrote.
 *
 * Returns false when there was nothing to commit — an agent that produced no
 * files at all, which is itself worth knowing and is reported as such.
 */
function preserveFailedAttempt(worktreeDir, req, failure) {
  if (isGitClean(worktreeDir)) return false;

  git(worktreeDir, ["add", "-A"]);
  const firstLine = String(failure || "").split("\n")[0] || "gate failed";
  const commit = git(worktreeDir, [
    "commit",
    "-m",
    `wip(${req.requirement}): FAILED the gate — do not merge as is\n\n` +
      `${firstLine}\n\n` +
      "Committed by `csda harness run` so the attempt is reviewable rather than\n" +
      "discarded. The requirement is still Draft: `csda done` never ran.",
  ]);
  return commit.status === 0;
}

function processRequirement(req, ctx) {
  const { projectDir, baseRef, keepWorktrees, force } = ctx;
  const branch = `harness/${req.requirement}`;
  const worktreeDir = path.join(
    os.tmpdir(),
    `csda-harness-${req.requirement}-${crypto.randomBytes(4).toString("hex")}`
  );

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

  warnIfBaseIsStale(projectDir, req.requirement, baseRef);
  const startedAt = Date.now();

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
    const result = {
      requirement: req.requirement,
      category: req.category,
      branch,
      base: baseRef,
      durationMs: Date.now() - startedAt,
      ...outcome,
    };
    if (outcome.result === "pass") {
      Object.assign(result, publishBranch(projectDir, branch, req, ctx.settings));
    }
    return result;
  } finally {
    if (!keepWorktrees) {
      git(projectDir, ["worktree", "remove", "--force", worktreeDir]);
    } else {
      info(`${req.requirement}: worktree kept at ${worktreeDir}`);
    }
  }
}

/** What publishing a green branch produced, merged into the requirement's result. */
interface PublishOutcome {
  pushed?: boolean;
  prCreated?: boolean;
  prOutput?: string;
  publishError?: string;
}

/**
 * CI mode (B7): after a green requirement, optionally push the branch and
 * open a PR/MR via a user-configured command. Publication problems never
 * flip a pass to a fail — the code is good; the human just has to publish
 * manually — but they are reported.
 */
function publishBranch(projectDir, branch, req, settings) {
  const published: PublishOutcome = {};
  if (!settings.push) return published;

  const push = git(projectDir, ["push", "--force-with-lease", "-u", settings.remote, branch]);
  if (push.status !== 0) {
    published.pushed = false;
    published.publishError = `git push failed:\n${push.stderr || push.stdout}`;
    warn(`${req.requirement}: push to ${settings.remote} failed`);
    return published;
  }
  published.pushed = true;
  info(`${req.requirement}: pushed ${branch} to ${settings.remote}`);

  if (settings.prCmd) {
    const command = settings.prCmd
      .split("{branch}")
      .join(branch)
      .split("{req}")
      .join(req.requirement);
    const pr = spawnSync(command, {
      shell: true,
      cwd: projectDir,
      encoding: "utf8",
      maxBuffer: SUBPROCESS_MAX_BUFFER,
    });
    if (pr.status !== 0) {
      published.prCreated = false;
      published.publishError = `pr command failed:\n${pr.stderr || pr.stdout}`;
      warn(`${req.requirement}: pr command failed`);
    } else {
      published.prCreated = true;
      const firstLine = (pr.stdout || "").trim().split("\n").pop();
      if (firstLine) published.prOutput = firstLine;
      info(`${req.requirement}: pr command succeeded${firstLine ? ` → ${firstLine}` : ""}`);
    }
  }
  return published;
}

/**
 * How much of a failing gate's output the text report shows.
 *
 * Runners put the useful part at the end, so the tail is what a human needs.
 * Twenty lines is enough for a failing assertion with its stack, and short
 * enough that ten failed requirements do not bury the summary.
 */
const FAILURE_TAIL_LINES = 20;

export function printReport(results, format) {
  if (format === "json") {
    const summary = results.reduce((acc, r) => {
      acc[r.result] = (acc[r.result] || 0) + 1;
      return acc;
    }, {});
    process.stdout.write(
      JSON.stringify({ schemaVersion: 1, total: results.length, summary, results }, null, 2) + "\n"
    );
    return;
  }

  process.stdout.write("\n── harness report ──\n");
  for (const r of results) {
    const icon =
      r.result === "pass"
        ? "✅"
        : r.result === "skipped"
          ? "⏭️ "
          : r.result === "blocked"
            ? "⛔"
            : "❌";
    process.stdout.write(
      `  ${icon} ${r.requirement}  ${r.result} (${r.attempts} attempt${r.attempts === 1 ? "" : "s"})  → ${r.branch}\n`
    );
    if (r.result === "blocked") {
      // Nothing ran, so there is no gate output to show — only the reason.
      process.stdout.write(`       ${r.error}\n`);
      continue;
    }
    if (r.result !== "pass" && r.error) {
      // The full gate output — the test failure that explains *why* — was
      // captured and then thrown away here, leaving "Gate failed at: test
      // command" and nothing to act on. With the worktree removed by default,
      // that made a failed run undiagnosable. Show the tail, where runners put
      // the actual failure, and name the two flags that give more.
      const lines = String(r.error).split("\n");
      const head = lines[0];
      const tail = lines
        .slice(1)
        .filter((l) => l.trim() !== "")
        .slice(-FAILURE_TAIL_LINES);
      process.stdout.write(`       ${head}\n`);
      for (const line of tail) process.stdout.write(`       │ ${line}\n`);
      if (tail.length > 0) {
        process.stdout.write("       └ full output: --format json · reproduce: --keep-worktrees\n");
      }
      if (r.workPreserved) {
        process.stdout.write(`       ↳ the attempt is committed on ${r.branch} — review it\n`);
      } else if (r.result === "fail") {
        process.stdout.write("       ↳ the agent produced no files\n");
      }
    }
    if (r.pushed) {
      process.stdout.write(
        `       pushed${r.prCreated ? ` · PR created${r.prOutput ? `: ${r.prOutput}` : ""}` : ""}\n`
      );
    }
    if (r.publishError) {
      process.stdout.write(`       publish issue: ${String(r.publishError).split("\n")[0]}\n`);
    }
  }
  const pass = results.filter((r) => r.result === "pass").length;
  const fail = results.filter((r) => r.result === "fail").length;
  const skip = results.filter((r) => r.result === "skipped").length;
  const blocked = results.filter((r) => r.result === "blocked").length;
  // Blocked is counted apart from failed on purpose: one broken predecessor
  // used to produce N failures and N wasted agent invocations, which said
  // nothing about the N-1 requirements that were never attempted.
  const blockedNote = blocked > 0 ? ` · ${blocked} blocked` : "";
  process.stdout.write(`\n  ${pass} passed · ${fail} failed · ${skip} skipped${blockedNote}\n`);
  if (pass > 0) {
    process.stdout.write(`  Review and merge the harness/* branches you trust.\n`);
  }
}

/**
 * Run one level.
 *
 * At concurrency 1 this is the loop the harness has always had: one
 * requirement, in this process, synchronously. Above 1 each requirement is
 * handed to a worker process running this same script with `--req`, because
 * every step inside `processRequirement` is a blocking `spawnSync` and there
 * is no way to interleave two of them in one process without rewriting all of
 * it.
 *
 * The worker is not a reduced version of the real thing: it *is* `harness run`
 * scoped to one requirement, so a parallel run and a serial run execute the
 * same code.
 */
async function dispatchLevel(runnable, byId, hintByReq, ctx, concurrency) {
  if (concurrency <= 1) {
    return runnable.map((id) =>
      processRequirement(byId.get(id), {
        ...ctx,
        baseRef: ctx.baseFor ? ctx.baseFor(id) : ctx.baseRef,
        hint: hintByReq.get(id),
      })
    );
  }
  return runWorkers(runnable, ctx, concurrency);
}

/**
 * Run requirements in parallel worker processes, at most `concurrency` at a
 * time, and collect their reports.
 *
 * Each worker prints a one-requirement JSON report; the parent parses it. A
 * worker that dies without printing one is reported as a failure carrying its
 * output, rather than vanishing from the run.
 */
function runWorkers(runnable, ctx, concurrency) {
  return new Promise((resolve) => {
    const results = [];
    const queue = [...runnable];
    const running = new Map();

    const fill = () => {
      while (running.size < concurrency && queue.length > 0) {
        const id = queue.shift();
        const child = spawn(process.execPath, [__filename, ...workerArgs(id, ctx)], {
          env: { ...process.env, CSDA_HARNESS_WORKER: "1" },
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
          stdout += d;
        });
        // A worker's prose goes straight through, so a long run is not silent.
        // Its JSON report is the only thing the parent parses.
        child.stderr.on("data", (d) => {
          stderr += d;
          process.stderr.write(d);
        });

        running.set(id, child);
        info(`${id}: started (${running.size}/${concurrency} in flight)`);

        child.on("close", () => {
          running.delete(id);
          results.push(parseWorkerReport(id, stdout, stderr));
          if (queue.length === 0 && running.size === 0) resolve(results);
          else fill();
        });
      }
    };

    fill();
    if (running.size === 0) resolve(results);
  });
}

/**
 * The argv a worker gets: this same command, scoped to one requirement and
 * pinned to concurrency 1 so a worker never spawns workers of its own.
 *
 * Settings are passed explicitly rather than left to the worker's own read of
 * `harness.config.yaml`, so a profile resolved once in the parent cannot
 * resolve differently in a child.
 */
function workerArgs(id, ctx) {
  return [
    "--req",
    id,
    "--project-dir",
    ctx.projectDir,
    "--format",
    "json",
    "--concurrency",
    "1",
    "--base-branch",
    ctx.baseFor ? ctx.baseFor(id) : ctx.baseRef,
    "--timeout",
    String(ctx.timeoutSeconds),
    "--max-attempts",
    String(ctx.settings.maxAttempts),
    ...(ctx.force ? ["--force"] : []),
    ...(ctx.keepWorktrees ? ["--keep-worktrees"] : []),
    ...(ctx.settings.agent ? ["--agent", ctx.settings.agent] : []),
    ...(ctx.settings.testCmd ? ["--test-cmd", ctx.settings.testCmd] : []),
  ];
}

/** A worker's report, or an honest failure describing why there is none. */
function parseWorkerReport(id, stdout, stderr) {
  try {
    const parsed = JSON.parse(stdout);
    const one = (parsed.results || []).find((r) => r.requirement === id);
    if (one) return one;
  } catch {
    // fall through
  }
  return {
    requirement: id,
    category: "",
    result: "fail",
    attempts: 0,
    branch: `harness/${id}`,
    error: `Worker produced no report.\n${(stderr || stdout || "").slice(-2000)}`,
  };
}

/**
 * Run the queue level by level.
 *
 * **Why concurrency 1 stays on the in-process path.** Every step of a
 * requirement — the gate, the agent, `done`, git — is a `spawnSync`, and
 * §12.11 of the closure plan is a list of eleven defects that only appeared
 * when this loop ran against a real agent. Converting all of it to async so
 * that one requirement could run "in parallel" with nothing would put the one
 * path that has actually been exercised behind an untested rewrite. So the
 * default path is the path it has always been, and only `--concurrency > 1`
 * dispatches through worker processes.
 *
 * **Why a failure blocks rather than fails.** Without dependencies expressed,
 * `harness run` processed the matrix in order and a broken predecessor made
 * every successor fail too — N failures for one cause, and N wasted agent
 * invocations. A requirement whose dependency failed has not been attempted;
 * calling that a failure would be a lie in the report.
 */
export async function runLevels(pending, ctx, opts) {
  const { concurrency, hintByReq, runOne } = opts;
  const { levels, cycles, dependsOn, graph } = scheduleLevels(pending);
  const byId: Map<string, any> = new Map(pending.map((r) => [r.requirement, r]));

  if (cycles.length > 0) {
    // `validate` is the gate that reports the cycle properly. Here we only
    // have to refuse to loop forever, and say which requirements are stuck.
    for (const cycle of cycles) {
      warn(`Dependency cycle, not attempted: ${[...cycle, cycle[0]].join(" → ")}`);
    }
  }

  const results = [];
  const blocked = new Set();
  /** REQ → the branch its work landed on, for the requirements that follow it. */
  const passedBranches = new Map();

  for (const level of levels) {
    const runnable = level.filter((id) => !blocked.has(id));

    for (const id of level) {
      if (!blocked.has(id)) continue;
      const req = byId.get(id);
      results.push({
        requirement: id,
        category: req ? req.category : "",
        result: "blocked",
        attempts: 0,
        branch: `harness/${id}`,
        error: `Not attempted: ${(dependsOn[id] || []).filter((d) => blocked.has(d) || results.some((r) => r.requirement === d && r.result !== "pass")).join(", ")} did not pass.`,
      });
    }

    if (runnable.length === 0) continue;

    // A requirement is cut from its dependencies' branches, not from the run's
    // base: that is where the code it builds on exists during a run.
    const derivationFailures = new Map();
    const baseFor = (id) => {
      const derived = deriveBase(ctx.projectDir, id, dependsOn[id] || [], passedBranches, ctx);
      if (derived.error) {
        derivationFailures.set(id, derived.error);
        return ctx.baseRef;
      }
      return derived.base;
    };

    const bases = new Map(runnable.map((id) => [id, baseFor(id)]));
    const attemptable = runnable.filter((id) => !derivationFailures.has(id));

    for (const [id, reason] of derivationFailures) {
      const req = byId.get(id);
      results.push({
        requirement: id,
        category: req ? req.category : "",
        result: "blocked",
        attempts: 0,
        branch: `harness/${id}`,
        error: `Not attempted: could not assemble its base. ${reason}`,
      });
      for (const dependent of graph.transitiveDependents(id)) blocked.add(dependent);
    }

    if (attemptable.length === 0) continue;

    const levelResults = await runOne(
      attemptable,
      byId,
      hintByReq,
      { ...ctx, baseFor: (id) => bases.get(id) },
      concurrency
    );
    results.push(...levelResults);

    for (const r of levelResults) {
      if (r.result === "pass") passedBranches.set(r.requirement, r.branch);
    }

    for (const r of levelResults) {
      if (r.result !== "pass") {
        for (const dependent of graph.transitiveDependents(r.requirement)) {
          blocked.add(dependent);
        }
      }
    }
  }

  // Requirements caught in a cycle never reach a level. Report them rather
  // than dropping them from the run.
  for (const cycle of cycles) {
    for (const id of cycle) {
      if (results.some((r) => r.requirement === id)) continue;
      const req = byId.get(id);
      results.push({
        requirement: id,
        category: req ? req.category : "",
        result: "blocked",
        attempts: 0,
        branch: `harness/${id}`,
        error: `Not attempted: caught in a dependency cycle (${cycle.join(" → ")}). Run \`csda validate\` for the fix.`,
      });
    }
  }

  return results;
}

export class RunCommand extends BaseCommand {
  public async execute() {
    try {
      const args = parseArgs(this.args);
      setJsonMode(args.format === "json");
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
            hint: hintByReq.get(req.requirement) as string | undefined,
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
      const concurrencyNote =
        settings.concurrency > 1 ? `, up to ${settings.concurrency} at a time` : "";
      info(`Processing ${pending.length} requirement(s) from base ${baseRef}${concurrencyNote}.`);

      // One prune, in the parent, before anything is created. It used to run per
      // requirement, which is harmless in series and a race in parallel:
      // `git worktree prune` running while a sibling is inside
      // `git worktree add` can remove the record of the worktree being created.
      if (!process.env.CSDA_HARNESS_WORKER) {
        git(projectDir, ["worktree", "prune"]);
      }

      const ctx = {
        projectDir,
        baseRef,
        settings,
        timeoutMs: args.timeout * 1000,
        timeoutSeconds: args.timeout,
        keepWorktrees: args.keepWorktrees,
        force: args.force,
      };

      const startedAt = new Date().toISOString();
      const results = await runLevels(pending, ctx, {
        concurrency: settings.concurrency,
        hintByReq,
        runOne: dispatchLevel,
      });

      const recordPath = writeRunRecord(projectDir, {
        schemaVersion: 1,
        startedAt,
        finishedAt: new Date().toISOString(),
        baseRef,
        concurrency: settings.concurrency,
        maxAttempts: settings.maxAttempts,
        results,
      });

      printReport(results, args.format);
      if (recordPath && args.format !== "json") {
        info(`Run recorded in ${path.relative(projectDir, recordPath)} — \`csda harness report\``);
      }

      // A blocked requirement was never attempted, so it is not a pass — but it
      // is also not evidence that anything is broken beyond the failure that
      // caused it. It still fails the run, because work was left undone.
      const failed = results.filter((r) => r.result !== "pass").length;
      process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
      error(err.message);
      process.exit(1);
    }
  }
}
