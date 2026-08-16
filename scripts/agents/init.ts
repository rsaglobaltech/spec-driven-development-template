#!/usr/bin/env node
"use strict";

/**
 * `csda agents init --tool <names>` — wire the spec-driven loop into the agent
 * tools a team already uses.
 *
 * One definition of the six steps (`./commands`), rendered into each tool's
 * own convention. The generated files are thin on purpose: they tell the agent
 * to run `csda change instructions`, they do not restate the rules. A markdown
 * file that copies the delta grammar is out of date the moment the grammar
 * moves; a file that calls the engine never is.
 */

const fs = require("node:fs");
const path = require("node:path");

const { resolveProjectDir } = require("../lib/project-root");
const { error, warning } = require("../lib/diagnostics");
const { agentIo, wantsJson, EXIT } = require("../lib/agent");
const { STEPS, PROJECT_RULES } = require("./commands");

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  cyan: COLOR ? "\x1b[36m" : "",
};

// ── Renderers, one per tool convention ────────────────────────────────────────

function slashCommandBody(step) {
  return [
    "---",
    `description: ${step.summary}`,
    "---",
    "",
    `# /csda:${step.name}`,
    "",
    step.summary,
    "",
    `**Use when:** ${step.when}`,
    "",
    "## Run",
    "",
    "```bash",
    ...step.run,
    "```",
    "",
    "## Guidance",
    "",
    ...step.guidance.map((g) => `- ${g}`),
    "",
    "> The authoritative rules come from `csda change instructions <artifact> --json`.",
    "> If this file and the engine disagree, the engine is right — say so and continue.",
    "",
  ].join("\n");
}

function instructionsBody(title) {
  return [
    `# ${title}`,
    "",
    "This project uses Spec-Driven Development through the `csda` CLI.",
    "Requirements, scenarios and traceability are executable artefacts, not documentation.",
    "",
    "## Non-negotiables",
    "",
    ...PROJECT_RULES.map((r) => `- ${r}`),
    "",
    "## The loop",
    "",
    ...STEPS.flatMap((s) => [
      `### ${s.name} — ${s.summary}`,
      "",
      `Use when: ${s.when}`,
      "",
      "```bash",
      ...s.run,
      "```",
      "",
    ]),
    "## Where the rules live",
    "",
    "Do not memorise the artefact formats. `csda change instructions <proposal|specs|design|tasks|apply|archive> --json`",
    "returns the template, the rules the validator enforces, the project's declared",
    "stack and what writing the artefact unblocks. It is the single source; this",
    "file is a pointer to it.",
    "",
  ].join("\n");
}

function cursorRuleBody() {
  return [
    "---",
    "description: Spec-driven development rules for this repository",
    "alwaysApply: true",
    "---",
    "",
    ...PROJECT_RULES.map((r) => `- ${r}`),
    "",
    "Run `csda change instructions <artifact> --json` for the format of any artefact.",
    "",
  ].join("\n");
}

/**
 * What each tool expects, and where.
 *
 * Adding a tool is one row: the loop below does not know any tool's name.
 */
const TOOLS = {
  claude: {
    label: "Claude Code",
    files: () => [
      ...STEPS.map((s) => ({
        path: path.join(".claude", "commands", "csda", `${s.name}.md`),
        contents: slashCommandBody(s),
      })),
      { path: "AGENTS.md", contents: instructionsBody("Agent instructions") },
    ],
  },
  cursor: {
    label: "Cursor",
    files: () => [{ path: path.join(".cursor", "rules", "csda.mdc"), contents: cursorRuleBody() }],
  },
  copilot: {
    label: "GitHub Copilot",
    files: () => [
      {
        path: path.join(".github", "copilot-instructions.md"),
        contents: instructionsBody("Copilot instructions"),
      },
    ],
  },
  windsurf: {
    label: "Windsurf",
    files: () => [{ path: path.join(".windsurf", "rules", "csda.md"), contents: cursorRuleBody() }],
  },
  aider: {
    label: "Aider",
    files: () => [{ path: "CONVENTIONS.md", contents: instructionsBody("Conventions") }],
  },
  gemini: {
    label: "Gemini CLI",
    files: () => [{ path: "GEMINI.md", contents: instructionsBody("Agent instructions") }],
  },
  cline: {
    label: "Cline",
    files: () => [{ path: path.join(".clinerules", "csda.md"), contents: cursorRuleBody() }],
  },
  codex: {
    label: "Codex",
    files: () => [{ path: "AGENTS.md", contents: instructionsBody("Agent instructions") }],
  },
};

const ALL_TOOLS = Object.keys(TOOLS);

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🤖 agents init${c.reset}  ${c.dim}— wire the loop into your agent tools${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    csda agents init [--tool <names>] [--project-dir <path>] [--dry-run] [--force] [--json]\n\n` +
      `  ${c.bold}TOOLS${c.reset}\n` +
      `    ${ALL_TOOLS.join(", ")}${c.dim}  (default: all)${c.reset}\n\n` +
      `  ${c.bold}NOTES${c.reset}\n` +
      `    ${c.dim}Existing files are never overwritten without --force.${c.reset}\n` +
      `    ${c.dim}--dry-run lists what would be written and touches nothing.${c.reset}\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = { tools: ALL_TOOLS, projectDir: ".", dryRun: false, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tool" && argv[i + 1]) {
      opts.tools = argv[++i]
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("-")) opts.unknown = a;
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  const io = agentIo(opts.json || wantsJson(argv));
  const NULL_SHAPE = { agents: null };

  if (opts.help) {
    usage();
    process.exit(EXIT.OK);
  }
  if (opts.unknown) {
    io.usage(NULL_SHAPE, [
      error("unknown_flag", `Unknown flag: ${opts.unknown}`, {
        target: opts.unknown,
        fix: "Run `csda agents init --help` for the accepted flags.",
      }),
    ]);
  }

  const unsupported = opts.tools.filter((t) => !TOOLS[t]);
  if (unsupported.length > 0) {
    io.usage(NULL_SHAPE, [
      error("tool_unknown", `Unknown tool(s): ${unsupported.join(", ")}`, {
        target: unsupported.join(","),
        fix: `Supported: ${ALL_TOOLS.join(", ")}.`,
      }),
    ]);
  }

  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err: any) {
    io.usage(NULL_SHAPE, [
      error("project_not_found", err.message, {
        fix: "Run from inside a spec-driven project, or pass --project-dir.",
      }),
    ]);
  }

  const written = [];
  const skipped = [];
  const diagnostics = [];

  // Several tools share a destination — Claude and Codex both read AGENTS.md —
  // so a file is written once and attributed to the tools that asked for it.
  const planned = new Map();
  for (const tool of opts.tools) {
    for (const file of TOOLS[tool].files()) {
      const entry = planned.get(file.path);
      if (entry) entry.tools.push(tool);
      else planned.set(file.path, { ...file, tools: [tool] });
    }
  }

  {
    for (const file of planned.values()) {
      const tool = file.tools.join("+");
      const target = path.join(projectDir, file.path);
      const exists = fs.existsSync(target);

      if (exists && !opts.force) {
        skipped.push({ tool, path: file.path, reason: "exists" });
        diagnostics.push(
          warning("agent_file_exists", `${file.path} already exists — left untouched.`, {
            file: file.path,
            fix: "Pass --force to overwrite it, or merge the generated content by hand.",
          })
        );
        continue;
      }

      if (!opts.dryRun) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.contents, "utf8");
      }
      written.push({ tool, path: file.path });
    }
  }

  io.emit(
    {
      agents: {
        projectDir,
        tools: opts.tools,
        dryRun: opts.dryRun,
        written,
        skipped,
      },
      status: diagnostics,
    },
    () => {
      const verb = opts.dryRun ? "would write" : "wrote";
      process.stdout.write(
        `\n  ${c.bold}agents init${c.reset} ${c.dim}(${opts.tools.join(", ")})${c.reset}\n\n`
      );
      for (const w of written) {
        process.stdout.write(`    ${c.green}+${c.reset} ${w.path} ${c.dim}${verb}${c.reset}\n`);
      }
      for (const s of skipped) {
        process.stdout.write(`    ${c.dim}· ${s.path} — exists, skipped${c.reset}\n`);
      }
      if (skipped.length > 0) {
        process.stdout.write(
          `\n  ${c.dim}Pass --force to overwrite the skipped files.${c.reset}\n`
        );
      }
      process.stdout.write(
        `\n  ${c.dim}Next: open your agent and run ${c.reset}/csda:explore${c.dim} (or read AGENTS.md).${c.reset}\n\n`
      );
    }
  );
  process.exit(EXIT.OK);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, TOOLS, ALL_TOOLS, parseArgs, slashCommandBody, instructionsBody };
