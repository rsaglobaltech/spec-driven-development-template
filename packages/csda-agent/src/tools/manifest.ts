/**
 * The csda command catalogue — the agent's entire vocabulary.
 *
 * This file *is* the security boundary. There is no `Bash` tool, no shell, no
 * way to compose an arbitrary command: the agent can invoke exactly what is
 * declared here, with exactly the flags declared here, and nothing else. A
 * restriction expressed as a closed tool set is auditable by reading one file;
 * the same restriction expressed as permission rules over a general agent is a
 * policy you have to trust to be complete.
 *
 * Every entry carries a `when` line. Tool descriptions are the single biggest
 * lever on whether a model reaches for the right tool, and a description that
 * only says what a command *is* leaves the model guessing about when to call
 * it.
 */

export type ParamType = "string" | "boolean" | "integer" | "string[]";

export interface Param {
  name: string;
  type: ParamType;
  description: string;
  required?: boolean;
  /** The CLI flag. Omit for a positional argument. */
  flag?: string;
  /** Fixed set of accepted values. */
  enum?: string[];
  /** For repeatable flags like --var KEY=VALUE. */
  repeatable?: boolean;
}

export interface CommandSpec {
  /** Tool name exposed to the model. */
  tool: string;
  /** The csda argv prefix, e.g. ["specops", "sync"]. */
  argv: string[];
  /** What it does. */
  summary: string;
  /** When the model should reach for it — the highest-value line here. */
  when: string;
  /** Does it change the working tree? Drives confirmation and plan mode. */
  mutating: boolean;
  params: Param[];
}

const projectDir: Param = {
  name: "project_dir",
  type: "string",
  flag: "--project-dir",
  description: "Project root. Defaults to the working directory the agent was started in.",
};

export const COMMANDS: CommandSpec[] = [
  {
    tool: "csda_init",
    argv: ["init"],
    summary: "Scaffold a new spec-driven project from a config file.",
    when:
      "Call this only to create a brand-new project from scratch. Never call it on a directory that already contains spec.md — that is an existing project.",
    mutating: true,
    params: [
      { name: "config", type: "string", flag: "--config", required: true, description: "Path to the project YAML or .config file." },
      { name: "out", type: "string", flag: "--out", description: "Directory to generate into." },
      { name: "dry_run", type: "boolean", flag: "--dry-run", description: "Report what would be written without writing it." },
      { name: "force", type: "boolean", flag: "--force", description: "Overwrite an existing target directory." },
      { name: "no_git", type: "boolean", flag: "--no-git", description: "Skip git initialisation." },
    ],
  },
  {
    tool: "csda_validate",
    argv: ["validate"],
    summary: "Check structure, traceability and Gherkin coverage.",
    when:
      "Call this after any change to docs/specs/ or features/, and before telling the user work is finished. With strict_tdd it also fails when a requirement past Draft has no test artifact — that is the gate that decides whether the work is really done.",
    mutating: false,
    params: [
      { name: "target", type: "string", required: true, description: "Project directory to validate." },
      { name: "strict_tdd", type: "boolean", flag: "--strict-tdd", description: "Also enforce the TDD gate." },
    ],
  },
  {
    tool: "csda_plan",
    argv: ["plan"],
    summary: "List requirements that still need a feature file, a test, code or a status update.",
    when:
      "Call this to find out what is left to do, and whenever the user asks what to work on next. It is the task queue — prefer it over reading the traceability matrix by hand.",
    mutating: false,
    params: [
      projectDir,
      { name: "format", type: "string", flag: "--format", enum: ["text", "json"], description: "Use json when you need to reason over the result." },
    ],
  },
  {
    tool: "csda_done",
    argv: ["done"],
    summary: "Mark a requirement as Implemented in the traceability matrix.",
    when:
      "Call this only after the requirement's test exists and csda_validate passes. Use check=true so the command refuses when validation fails, rather than recording a claim that is not true.",
    mutating: true,
    params: [
      { name: "requirement", type: "string", required: true, description: "Requirement id, e.g. REQ-007." },
      projectDir,
      { name: "check", type: "boolean", flag: "--check", description: "Validate before marking. Strongly recommended." },
      { name: "strict", type: "boolean", flag: "--strict", description: "Validate with the strict TDD gate before marking." },
    ],
  },
  {
    tool: "csda_expand",
    argv: ["expand"],
    summary: "Apply a domain pack onto a project, from a local path or a git tag.",
    when:
      "Low-level. Prefer csda_specops_add, which does the same thing and records the pack in .specops.lock so it can be synced later.",
    mutating: true,
    params: [
      { name: "pack", type: "string", flag: "--pack", required: true, description: "Pack id inside the repo, e.g. parking-management/backend." },
      { name: "pack_root", type: "string", flag: "--pack-root", description: "Local directory holding the pack." },
      { name: "pack_repo", type: "string", flag: "--pack-repo", description: "Git URL of the pack repository." },
      { name: "pack_version", type: "string", flag: "--pack-version", description: "Tag or commit to pin." },
      projectDir,
      { name: "var", type: "string[]", flag: "--var", repeatable: true, description: "Template variables as KEY=VALUE." },
      { name: "dry_run", type: "boolean", flag: "--dry-run", description: "Report without writing." },
    ],
  },
  {
    tool: "csda_pack_init",
    argv: ["pack", "init"],
    summary: "Scaffold a new domain pack skeleton.",
    when: "Call this when the user wants to author a reusable pack, not when they want to consume one.",
    mutating: true,
    params: [
      { name: "out", type: "string", flag: "--out", description: "Directory to create the pack in." },
      { name: "name", type: "string", flag: "--name", description: "Human-readable pack name." },
      { name: "type", type: "string", flag: "--type", enum: ["backend", "frontend", "contracts"], description: "Pack flavour." },
    ],
  },
  {
    tool: "csda_pack_lint",
    argv: ["pack", "lint"],
    summary: "Lint a pack: schema, cross-references and scenario quality.",
    when:
      "Call this after editing any pack.yaml, and before tagging a pack version. With graph it also renders the REQ→UC→CMD/AGG→EVT graph, which doubles as a link check.",
    mutating: false,
    params: [
      { name: "pack_root", type: "string", flag: "--pack-root", description: "Directory holding the pack." },
      { name: "pack", type: "string", flag: "--pack", description: "Pack id to lint." },
      { name: "strict", type: "boolean", flag: "--strict", description: "Also fail on scenario-quality warnings." },
      { name: "graph", type: "boolean", flag: "--graph", description: "Render the cross-reference graph." },
    ],
  },
  {
    tool: "csda_pack_infer",
    argv: ["pack", "infer"],
    summary: "Propose a pack.yaml skeleton from an existing .feature file.",
    when:
      "Call this to start a pack from a scenario the user already wrote, rather than from a blank file. The output is a skeleton with explicit TODOs — never present it as finished.",
    mutating: false,
    params: [
      { name: "from", type: "string", flag: "--from", required: true, description: "Path to the .feature file." },
      { name: "format", type: "string", flag: "--format", enum: ["yaml", "json"], description: "Output format." },
    ],
  },
  {
    tool: "csda_specops_add",
    argv: ["specops", "add"],
    summary: "Add a domain pack to a project, npm-install style, writing .specops.lock.",
    when:
      "This is the normal way to adopt a pack. Prefer it over csda_expand: it records the source, version and variables so the pack can be synced and diffed later.",
    mutating: true,
    params: [
      { name: "pack_repo", type: "string", flag: "--pack-repo", required: true, description: "Git URL of the pack repository." },
      { name: "pack", type: "string", flag: "--pack", required: true, description: "Pack id inside that repository." },
      { name: "pack_version", type: "string", flag: "--pack-version", description: "Tag to pin. Always pin explicitly." },
      projectDir,
      { name: "var", type: "string[]", flag: "--var", repeatable: true, description: "Template variables as KEY=VALUE." },
    ],
  },
  {
    tool: "csda_specops_remove",
    argv: ["specops", "remove"],
    summary: "Drop a pack entry from .specops.lock.",
    when: "Call this when the user no longer wants a pack tracked. It does not delete the files the pack already rendered.",
    mutating: true,
    params: [
      { name: "pack", type: "string", flag: "--pack", required: true, description: "Pack id to remove." },
      projectDir,
    ],
  },
  {
    tool: "csda_specops_sync",
    argv: ["specops", "sync"],
    summary: "Re-expand locked packs and three-way merge them, preserving local edits.",
    when:
      "Call this to apply a pack upgrade, or after a fresh clone. Run csda_specops_diff first so the user knows what is coming. It exits non-zero when a file is left conflicted — say so plainly rather than reporting success.",
    mutating: true,
    params: [
      projectDir,
      { name: "pack", type: "string", flag: "--pack", description: "Limit to one pack." },
      { name: "pack_version", type: "string", flag: "--pack-version", description: "Bump to this version." },
      { name: "dry_run", type: "boolean", flag: "--dry-run", description: "Report without writing." },
      { name: "force", type: "boolean", flag: "--force", description: "Discard local edits. Ask the user before using this." },
      { name: "abort_on_conflict", type: "boolean", flag: "--abort-on-conflict", description: "Leave conflicting files untouched instead of writing markers." },
    ],
  },
  {
    tool: "csda_specops_diff",
    argv: ["specops", "diff"],
    summary: "Preview what a pack version bump would change. Writes nothing.",
    when:
      "Call this before csda_specops_sync, and whenever the user asks what a newer pack version would do. Safe to call at any time — it never writes.",
    mutating: false,
    params: [
      projectDir,
      { name: "pack", type: "string", flag: "--pack", description: "Limit to one pack." },
      { name: "pack_version", type: "string", flag: "--pack-version", description: "Version to compare against." },
      { name: "format", type: "string", flag: "--format", enum: ["text", "json"], description: "Use json when you need to reason over the result." },
    ],
  },
  {
    tool: "csda_harness_prompt",
    argv: ["harness", "prompt"],
    summary: "Print the prompt the harness would hand an agent for one requirement.",
    when:
      "Call this to inspect what an implementing agent would receive for a requirement — useful for debugging AI_RULES.md or a prompt prefix. It runs no agent and touches no files.",
    mutating: false,
    params: [
      { name: "requirement", type: "string", required: true, description: "Requirement id, e.g. REQ-001." },
      projectDir,
    ],
  },
  {
    tool: "csda_harness_run",
    argv: ["harness", "run"],
    summary: "Run the plan → agent → verify → done loop for every pending requirement, in isolated git worktrees.",
    when:
      "Expensive and long-running: it shells out to a coding agent per requirement and creates git branches. Always confirm with the user before calling it, and prefer csda_harness_prompt when they only want to see what it would do.",
    mutating: true,
    params: [
      projectDir,
      { name: "agent", type: "string", flag: "--agent", description: "Agent command with a {prompt_file} placeholder." },
      { name: "test_cmd", type: "string", flag: "--test-cmd", description: "Test command used as the reward signal." },
      { name: "req", type: "string", flag: "--req", description: "Limit the run to one requirement." },
      { name: "dry_run", type: "boolean", flag: "--dry-run", description: "Build the prompt without running the agent." },
      { name: "max_attempts", type: "integer", flag: "--max-attempts", description: "Retries per requirement before giving up." },
    ],
  },
];

export const COMMAND_BY_TOOL = new Map(COMMANDS.map((c) => [c.tool, c]));

/** Build the argv for one call, from validated input. */
export function buildArgv(spec: CommandSpec, input: Record<string, unknown>): string[] {
  const argv = [...spec.argv];

  for (const param of spec.params) {
    const value = input[param.name];
    if (value === undefined || value === null || value === "") continue;

    if (param.type === "boolean") {
      if (value === true && param.flag) argv.push(param.flag);
      continue;
    }
    if (param.type === "string[]") {
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (param.flag) argv.push(param.flag, String(item));
        else argv.push(String(item));
      }
      continue;
    }
    if (param.flag) argv.push(param.flag, String(value));
    else argv.push(String(value));
  }

  return argv;
}

/** JSON Schema for one command, for the tool definition. */
export function inputSchema(spec: CommandSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of spec.params) {
    const base: Record<string, unknown> = { description: param.description };
    switch (param.type) {
      case "boolean":
        base.type = "boolean";
        break;
      case "integer":
        base.type = "integer";
        break;
      case "string[]":
        base.type = "array";
        base.items = { type: "string" };
        break;
      default:
        base.type = "string";
        if (param.enum) base.enum = param.enum;
    }
    properties[param.name] = base;
    if (param.required) required.push(param.name);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function toolDescription(spec: CommandSpec): string {
  return `${spec.summary}\n\nWhen to use: ${spec.when}\n\nRuns: csda ${spec.argv.join(" ")}`;
}
