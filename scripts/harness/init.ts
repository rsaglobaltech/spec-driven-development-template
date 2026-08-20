#!/usr/bin/env node
/**
 * `harness init` — scaffold `harness.config.yaml` and `.harness/prompt-prefix.md`.
 *
 * The config was documented in the tutorial and named in `harness run`'s own
 * error message ("set `agent:` in harness.config.yaml") long before anything
 * created it, so every project had to hand-copy it out of a guide. A tool that
 * documents a config file and never writes one is asking its users to do the
 * scaffolder's job.
 *
 * Usage:
 *   csda harness init [--project-dir <dir>] [--test-cmd <cmd>]
 *                                       [--force] [--stdout] [--json]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { renderTemplate } from "../domain-pack/common";
import { resolveProjectDir } from "../lib/project-root";
import { agentIo, wantsJson } from "../lib/agent";
import { error, info, warning, errorMessage } from "../lib/diagnostics";
import { BaseCommand } from "../lib/command";

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const TEMPLATES = path.join(ROOT_DIR, "templates", "harness");

const CONFIG_FILE = "harness.config.yaml";
const PREFIX_FILE = path.join(".harness", "prompt-prefix.md");

const NULL_SHAPE = { projectDir: null, files: [] };

/**
 * Guess the project's extra gate from the build file that is actually present,
 * or `null` when nothing gives it away.
 *
 * `null` matters more than the guesses. `test_cmd` is an *additional* gate —
 * `harness run` always runs `validate --strict-tdd` first — so leaving it
 * unset is safe, while filling it with a placeholder is not. A placeholder
 * like `echo "set this"` exits 0, which is a gate that passes unconditionally:
 * the harness would mark requirements done without ever running a test. A
 * freshly scaffolded project has no build file yet precisely because no code
 * exists, so this is the common case, not the edge one.
 */
export function detectTestCommand(projectDir) {
  const has = (file) => fs.existsSync(path.join(projectDir, file));
  if (has("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
      const scripts = pkg.scripts || {};
      // `verify` is this project's own convention for "the fast gate";
      // prefer it, because `test` in a spec-driven repo often includes the
      // end-to-end suite that stays red until the last requirement lands.
      if (scripts.verify) return "npm run verify";
      if (scripts.test) return "npm test";
    } catch {
      // A malformed package.json is the user's problem, not a reason to fail
      // scaffolding. Fall through to the generic guess.
    }
    return "npm test";
  }
  if (has("pom.xml")) return "mvn -B test";
  if (has("build.gradle") || has("build.gradle.kts")) return "./gradlew test";
  if (has("Cargo.toml")) return "cargo test";
  if (has("go.mod")) return "go test ./...";
  if (has("pyproject.toml") || has("setup.py")) return "pytest";
  return null;
}

export function projectName(projectDir) {
  const specPath = path.join(projectDir, "spec.md");
  if (fs.existsSync(specPath)) {
    const heading = /^#\s+(.+)$/m.exec(fs.readFileSync(specPath, "utf8"));
    if (heading) return heading[1].trim();
  }
  return path.basename(projectDir);
}

function usage() {
  process.stdout.write(
    "\n  🤖 harness init — scaffold the harness configuration\n\n" +
      "  USAGE\n" +
      "    csda harness init [options]\n\n" +
      "  WRITES\n" +
      `    ${CONFIG_FILE}        agent, gate, retries, CI mode\n` +
      `    ${PREFIX_FILE}   Role / Active Project Boundary / Execution Policy\n\n` +
      "  OPTIONS\n" +
      "    --project-dir <dir>  Project root (auto-detected from cwd if omitted).\n" +
      "    --test-cmd <cmd>     The gate. Detected from the build files if omitted.\n" +
      "    --force              Overwrite files that already exist.\n" +
      "    --stdout             Print both files instead of writing them.\n" +
      "    --json               Machine-readable output.\n" +
      "    -h, --help           Show this help.\n\n"
  );
}

/** Parsed command-line options for this command. */
export interface HarnessInitOptions {
  projectDir: string;
  testCmd: string | null;
  force: boolean;
  stdout: boolean;
  json: boolean;
}

function parseArgs(argv) {
  const opts: HarnessInitOptions = {
    projectDir: ".",
    testCmd: null,
    force: false,
    stdout: false,
    json: wantsJson(argv),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--test-cmd" && argv[i + 1]) opts.testCmd = argv[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "--json") continue;
    else if (a === "--format" && argv[i + 1] === "json") i++;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${a}\n`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

export class InitCommand extends BaseCommand {
  public execute() {
    let argv = this.args;
    // Reachable as `harness init …` through the dispatcher, or directly.
    if (argv[0] === "harness") argv = argv.slice(1);
    if (argv[0] === "init") argv = argv.slice(1);

    const opts = parseArgs(argv);
    const io = agentIo(opts.json);

    let projectDir;
    try {
      projectDir = resolveProjectDir(opts.projectDir);
    } catch (err) {
      io.usage(NULL_SHAPE, [
        error("no_project", errorMessage(err), {
          fix: "Run from inside a spec-driven project, or pass --project-dir <path>.",
        }),
      ]);
      return;
    }

    const testCmd = opts.testCmd || detectTestCommand(projectDir);
    // Rendered into the config as a live key when known, and as a commented-out
    // one when not — see detectTestCommand for why a placeholder would be worse
    // than an absent key.
    const vars = {
      PROJECT_NAME: projectName(projectDir),
      TEST_CMD_LINE: testCmd
        ? `test_cmd: "${testCmd}"`
        : '# test_cmd: "npm test"   # ← set this once the project has a test command',
      GATE_COMMAND: testCmd
        ? `${testCmd}\ncsda validate . --strict-tdd`
        : "csda validate . --strict-tdd",
    };

    const outputs = [
      {
        dest: CONFIG_FILE,
        body: renderTemplate(
          fs.readFileSync(path.join(TEMPLATES, "harness.config.yaml.tpl"), "utf8"),
          vars
        ),
      },
      {
        dest: PREFIX_FILE,
        body: renderTemplate(
          fs.readFileSync(path.join(TEMPLATES, "prompt-prefix.md.tpl"), "utf8"),
          vars
        ),
      },
    ];

    if (opts.stdout) {
      io.emit({ projectDir, testCmd, files: outputs.map((o) => o.dest) }, () => {
        for (const out of outputs) {
          process.stdout.write(
            `# ── ${out.dest} ${"─".repeat(Math.max(0, 60 - out.dest.length))}\n`
          );
          process.stdout.write(out.body);
          process.stdout.write("\n");
        }
      });
      return;
    }

    const existing = outputs
      .map((o) => o.dest)
      .filter((dest) => fs.existsSync(path.join(projectDir, dest)));
    if (existing.length > 0 && !opts.force) {
      io.fail({ ...NULL_SHAPE, projectDir }, [
        error("harness_config_exists", `Already present: ${existing.join(", ")}`, {
          target: existing[0],
          fix: "Re-run with --force to overwrite, or --stdout to print and merge by hand.",
        }),
      ]);
      return;
    }

    const written = [];
    for (const out of outputs) {
      const abs = path.join(projectDir, out.dest);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, out.body, "utf8");
      written.push(out.dest);
    }

    const status = [
      info("harness_agent_unset", "No agent is configured, deliberately.", {
        fix: 'Pass it explicitly: csda harness run --req REQ-001 --agent "<cmd> < {prompt_file}"',
      }),
    ];
    if (!testCmd) {
      status.push(
        warning(
          "harness_test_cmd_unset",
          "No test command detected, so `test_cmd` is commented out.",
          {
            target: CONFIG_FILE,
            fix: "Set it once the project has one. Until then the gate is `validate --strict-tdd` alone, which is a real gate — a placeholder that exits 0 would not be.",
          }
        )
      );
    }

    io.emit(
      {
        projectDir,
        testCmd,
        files: written,
        status,
      },
      () => {
        for (const file of written) process.stdout.write(`ℹ️ [INFO] write ${file}\n`);
        process.stdout.write(
          "ℹ️ [INFO] ✅ Harness configured.\n" +
            `ℹ️ [INFO]   gate: validate --strict-tdd${testCmd ? ` + ${testCmd}` : " (no test command detected)"}\n` +
            "ℹ️ [INFO]   agent: not set — that is your choice and your credentials.\n" +
            "ℹ️ [INFO] Next:\n" +
            "ℹ️ [INFO]   1. Read .harness/prompt-prefix.md and make it sound like your team.\n" +
            "ℹ️ [INFO]   2. csda harness prompt REQ-001        — see it before paying for it\n" +
            'ℹ️ [INFO]   3. csda harness run --req REQ-001 --agent "<cmd> < {prompt_file}"\n'
        );
      }
    );
  }
}

if (require.main === module) new InitCommand(process.argv.slice(2)).execute();
