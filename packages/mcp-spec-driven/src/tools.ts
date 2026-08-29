// GENERATED FILE - DO NOT EDIT BY HAND
// Derived from scripts/lib/surface.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly csda?: string;
  handler(args: Record<string, unknown>): unknown;
}

class ProjectHelper {
  public static ensureProjectDir(projectDir: unknown): string {
    if (!projectDir || typeof projectDir !== "string") {
      throw new Error("projectDir is required (absolute path to a spec-driven project)");
    }
    return projectDir;
  }
}

class CliInvoker {
  public static spawnCli(cliPath: string | undefined, args: string[]) {
    const bin = cliPath || "npx create-spec-driven-app";
    const [cmd, ...rest] = bin.split(" ");
    return spawnSync(cmd, [...rest, ...args], { encoding: "utf8", timeout: 60000 });
  }
}

export class GenericCliTool implements ITool {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly csda: string,
    public readonly inputSchema: Record<string, unknown>
  ) {}

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const argv = this.csda.split(" ");
    
    argv.push("--project-dir", dir);
    
    // Pass args safely
    for (const [k, v] of Object.entries(args)) {
      if (k === "projectDir" || k === "cliPath") continue;
      if (typeof v === "string") {
        argv.push(v); // Quick hack, we need proper arg mapping
      }
    }
    
    if (!argv.includes("--json")) {
       argv.push("--json");
    }

    const result = CliInvoker.spawnCli(args.cliPath as string, argv);
    const combined = (result.stdout || "") + "\n" + (result.stderr || "");
    try {
      if (result.stdout && result.stdout.trim().startsWith("{")) {
         return JSON.parse(result.stdout.trim());
      }
    } catch(e) {}
    
    return {
      exitCode: typeof result.status === "number" ? result.status : 1,
      raw: combined.trim(),
    };
  }
}

export const TOOLS: Record<string, ITool> = {};

TOOLS["csda_init"] = new GenericCliTool(
  "csda_init",
  "Scaffold a new project; --from-pack <repo>@<tag> also installs a pack.",
  "init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_adopt"] = new GenericCliTool(
  "csda_adopt",
  "Install SDD on an EXISTING repository (brownfield, non-invasive).",
  "adopt",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_onboard"] = new GenericCliTool(
  "csda_onboard",
  "Read an existing repo and propose the capabilities its code implies.",
  "onboard",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_doctor"] = new GenericCliTool(
  "csda_doctor",
  "Diagnose the project and environment; every finding ships a fix.",
  "doctor",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_status"] = new GenericCliTool(
  "csda_status",
  "Daily dashboard: what is done, what is orphaned, what to do next.",
  "status",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_ci_init"] = new GenericCliTool(
  "csda_ci_init",
  "Generate the spec gate for GitHub, GitLab, Azure, or Jenkins.",
  "ci init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_alm_sync"] = new GenericCliTool(
  "csda_alm_sync",
  "Sync REQs with Jira / Azure Boards (create, close, drift).",
  "alm sync",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_alm_link"] = new GenericCliTool(
  "csda_alm_link",
  "Run csda alm link",
  "alm link",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_alm_status"] = new GenericCliTool(
  "csda_alm_status",
  "Run csda alm status",
  "alm status",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_alm_pull"] = new GenericCliTool(
  "csda_alm_pull",
  "Run csda alm pull",
  "alm pull",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["validate_project"] = new GenericCliTool(
  "validate_project",
  "Check structure, traceability, Gherkin (+ --strict-tdd / --strict-scenarios / --strict-requirements / --strict-links / --against-lock gates).",
  "validate",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_expand"] = new GenericCliTool(
  "csda_expand",
  "Apply a domain pack (local path or remote git tag).",
  "expand",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["plan"] = new GenericCliTool(
  "plan",
  "List requirements that still need a test or implementation.",
  "plan",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_report"] = new GenericCliTool(
  "csda_report",
  "Spec-coverage dashboard as self-contained HTML (CI/Pages artifact).",
  "report",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["mark_requirement_done"] = new GenericCliTool(
  "mark_requirement_done",
  "Mark a requirement as Implemented in traceability.md.",
  "done",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_req_add"] = new GenericCliTool(
  "csda_req_add",
  "Run csda req add",
  "req add",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_req_link"] = new GenericCliTool(
  "csda_req_link",
  "Run csda req link",
  "req link",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_req_done"] = new GenericCliTool(
  "csda_req_done",
  "Run csda req done",
  "req done",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_req_list"] = new GenericCliTool(
  "csda_req_list",
  "Run csda req list",
  "req list",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_fix"] = new GenericCliTool(
  "csda_fix",
  "Apply the fixes validate suggests (--dry-run to preview).",
  "fix",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_new"] = new GenericCliTool(
  "csda_change_new",
  "Run csda change new",
  "change new",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_list"] = new GenericCliTool(
  "csda_change_list",
  "Run csda change list",
  "change list",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_show"] = new GenericCliTool(
  "csda_change_show",
  "Run csda change show",
  "change show",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_status"] = new GenericCliTool(
  "csda_change_status",
  "Run csda change status",
  "change status",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_validate"] = new GenericCliTool(
  "csda_change_validate",
  "Run csda change validate",
  "change validate",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_archive"] = new GenericCliTool(
  "csda_change_archive",
  "Run csda change archive",
  "change archive",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_instructions"] = new GenericCliTool(
  "csda_change_instructions",
  "Run csda change instructions",
  "change instructions",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_change_author"] = new GenericCliTool(
  "csda_change_author",
  "Run csda change author",
  "change author",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_pack_init"] = new GenericCliTool(
  "csda_pack_init",
  "Scaffold a new pack skeleton (backend · frontend · contracts).",
  "pack init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["lint_pack"] = new GenericCliTool(
  "lint_pack",
  "Lint a pack: schema, cross-refs, and scenario quality (--strict).",
  "pack lint",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_pack_infer"] = new GenericCliTool(
  "csda_pack_infer",
  "Propose a pack.yaml skeleton from a .feature file.",
  "pack infer",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_pack_bundle"] = new GenericCliTool(
  "csda_pack_bundle",
  "Export a pack repo as a git bundle for air-gapped use.",
  "pack bundle",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_specops_add"] = new GenericCliTool(
  "csda_specops_add",
  "Add a pack (npm-install-style); writes .specops.lock.",
  "specops add",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_specops_remove"] = new GenericCliTool(
  "csda_specops_remove",
  "Drop a pack entry from .specops.lock.",
  "specops remove",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_specops_sync"] = new GenericCliTool(
  "csda_specops_sync",
  "Re-expand packs and three-way merge them, preserving local edits.",
  "specops sync",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_specops_diff"] = new GenericCliTool(
  "csda_specops_diff",
  "Preview a version bump; --as-change derives a reviewable change.",
  "specops diff",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_specops_contribute"] = new GenericCliTool(
  "csda_specops_contribute",
  "Send a local change back upstream to the pack (never pushes).",
  "specops contribute",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_harness_run"] = new GenericCliTool(
  "csda_harness_run",
  "Run the plan → agent → verify → done loop for every pending requirement.",
  "harness run",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_harness_prompt"] = new GenericCliTool(
  "csda_harness_prompt",
  "Print the prompt the harness would hand an agent for one REQ.",
  "harness prompt",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_harness_init"] = new GenericCliTool(
  "csda_harness_init",
  "Scaffold harness.config.yaml and the prompt prefix.",
  "harness init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_harness_report"] = new GenericCliTool(
  "csda_harness_report",
  "What the harness has cost: first-attempt rate, time per delivered requirement.",
  "harness report",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_config_init"] = new GenericCliTool(
  "csda_config_init",
  "Run csda config init",
  "config init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_config_set"] = new GenericCliTool(
  "csda_config_set",
  "Run csda config set",
  "config set",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_config_get"] = new GenericCliTool(
  "csda_config_get",
  "Run csda config get",
  "config get",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_config_list"] = new GenericCliTool(
  "csda_config_list",
  "Run csda config list",
  "config list",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_agents_init"] = new GenericCliTool(
  "csda_agents_init",
  "Wire the loop into Claude, Cursor, Copilot, Aider and more.",
  "agents init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_update"] = new GenericCliTool(
  "csda_update",
  "Refresh generated agent files after a CLI upgrade, keeping your edits.",
  "update",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_schema_which"] = new GenericCliTool(
  "csda_schema_which",
  "Run csda schema which",
  "schema which",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_schema_init"] = new GenericCliTool(
  "csda_schema_init",
  "Run csda schema init",
  "schema init",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_schema_fork"] = new GenericCliTool(
  "csda_schema_fork",
  "Run csda schema fork",
  "schema fork",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_schema_validate"] = new GenericCliTool(
  "csda_schema_validate",
  "Run csda schema validate",
  "schema validate",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_completion_bash"] = new GenericCliTool(
  "csda_completion_bash",
  "Run csda completion bash",
  "completion bash",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_completion_zsh"] = new GenericCliTool(
  "csda_completion_zsh",
  "Run csda completion zsh",
  "completion zsh",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_completion_fish"] = new GenericCliTool(
  "csda_completion_fish",
  "Run csda completion fish",
  "completion fish",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);
TOOLS["csda_studio"] = new GenericCliTool(
  "csda_studio",
  "Serve a local, read-only HTML view of the spec tree (--json for agents).",
  "studio",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);

// Legacy exports for tests
export const readSpec = (args: any) => TOOLS["csda_read_spec"] ? TOOLS["csda_read_spec"].handler(args) : {};
export const listRequirements = (args: any) => TOOLS["csda_list_requirements"] ? TOOLS["csda_list_requirements"].handler(args) : {};
export const updateTraceability = (args: any) => TOOLS["csda_update_traceability"] ? TOOLS["csda_update_traceability"].handler(args) : {};
export const lintPack = (args: any) => TOOLS["csda_pack_lint"].handler(args);
export const validateProject = (args: any) => TOOLS["csda_validate"].handler(args);
export const plan = (args: any) => TOOLS["csda_plan"].handler(args);
export const markRequirementDone = (args: any) => TOOLS["csda_done"].handler(args);
