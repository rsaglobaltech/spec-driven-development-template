"use strict";

/**
 * Pure module — no MCP transport dependency.
 * Implements the business logic of every MCP tool exposed by the server.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync, SpawnSyncOptionsWithStringEncoding } from "node:child_process";

// ── Interfaces ───────────────────────────────────────────────────────────────────

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly csda?: string;
  handler(args: Record<string, unknown>): unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

class ProjectHelper {
  public static ensureProjectDir(projectDir: unknown): string {
    if (!projectDir || typeof projectDir !== "string") {
      throw new Error("projectDir is required (absolute path to a spec-driven project)");
    }
    if (!fs.existsSync(projectDir)) {
      throw new Error(`projectDir does not exist: ${projectDir}`);
    }
    const specFile = path.join(projectDir, "spec.md");
    if (!fs.existsSync(specFile)) {
      throw new Error(`Not a spec-driven project (no spec.md): ${projectDir}`);
    }
    return projectDir;
  }
}

class CliInvoker {
  private static parseCliCommand(cliPath: string | undefined): string[] {
    const raw = (cliPath || "npx create-spec-driven-app").trim();
    const tokens: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    }
    return tokens;
  }

  public static spawnCli(
    cliPath: string | undefined,
    argv: string[],
    options: SpawnSyncOptionsWithStringEncoding
  ) {
    const cliCmd = this.parseCliCommand(cliPath);
    const useShell = process.platform === "win32";
    const quote = (s: string) => (useShell && /\s/.test(s) ? `"${s}"` : s);
    return spawnSync(quote(cliCmd[0]), [...cliCmd.slice(1), ...argv].map(quote), {
      encoding: "utf8",
      shell: useShell,
      ...options,
    });
  }
}

// ── Tools ────────────────────────────────────────────────────────────────────────

export class ReadSpecTool implements ITool {
  public readonly name = "read_spec";
  public readonly description =
    "Read the spec.md file (and list other spec markdown) of a spec-driven project.";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: {
        type: "string",
        description: "Absolute path to the spec-driven project root.",
      },
    },
    required: ["projectDir"],
  };

  public handler(args: Record<string, unknown>): { specMd: string; files: string[] } {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const specMd = fs.readFileSync(path.join(dir, "spec.md"), "utf8");

    const docsSpecsDir = path.join(dir, "docs", "specs");
    const files: string[] = [];
    if (fs.existsSync(docsSpecsDir)) {
      for (const entry of fs.readdirSync(docsSpecsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(path.join("docs/specs", entry.name));
        }
      }
    }

    return { specMd, files: files.sort() };
  }
}

export class ListRequirementsTool implements ITool {
  public readonly name = "list_requirements";
  public readonly description =
    "List every REQ-NNN in the project with its title, source file, and line number.";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: {
        type: "string",
        description: "Absolute path to the spec-driven project root.",
      },
    },
    required: ["projectDir"],
  };

  private static REQ_LINE = /\bREQ-(\d{3,})\b/g;
  private static REQ_HEADING = /^(##+)\s*(REQ-\d{3,})\b\s*[:\-—]?\s*(.*)$/m;

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const sources = [
      { file: "spec.md", path: path.join(dir, "spec.md") },
      { file: "docs/specs/traceability.md", path: path.join(dir, "docs/specs/traceability.md") },
    ];

    const requirements = new Map<
      string,
      { id: string; title: string; file: string; line: number }
    >();
    for (const source of sources) {
      if (!fs.existsSync(source.path)) continue;
      const lines = fs.readFileSync(source.path, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        ListRequirementsTool.REQ_LINE.lastIndex = 0;
        let match;
        while ((match = ListRequirementsTool.REQ_LINE.exec(line)) !== null) {
          const id = `REQ-${match[1]}`;
          if (!requirements.has(id)) {
            let title = "";
            const headingMatch = line.match(ListRequirementsTool.REQ_HEADING);
            if (headingMatch && headingMatch[2] === id) {
              title = (headingMatch[3] || "").trim();
            } else {
              const idx = line.indexOf(id);
              title = line
                .slice(idx + id.length)
                .replace(/^[\s:\-—|]+/, "")
                .replace(/\|.*$/, "")
                .trim();
            }
            requirements.set(id, { id, title, file: source.file, line: i });
          }
        }
      }
    }

    return {
      requirements: Array.from(requirements.values()).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
}

export class UpdateTraceabilityTool implements ITool {
  public readonly name = "update_traceability";
  public readonly description = "Append a row to the traceability matrix. Idempotent.";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      requirement: { type: "string", description: "e.g. REQ-001" },
      scenario: { type: "string", description: "e.g. SCN-005 (optional)" },
      feature: {
        type: "string",
        description: "Path to the .feature file (relative to project root)",
      },
      status: { type: "string", enum: ["Draft", "Approved", "Implemented", "Verified"] },
    },
    required: ["projectDir", "requirement", "feature", "status"],
  };

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const tracePath = path.join(dir, "docs/specs/traceability.md");
    if (!fs.existsSync(tracePath)) {
      throw new Error("docs/specs/traceability.md not found in this project");
    }

    const required = ["requirement", "feature", "status"];
    for (const k of required) {
      if (!args[k]) throw new Error(`Missing argument: ${k}`);
    }

    const content = fs.readFileSync(tracePath, "utf8");
    const tag = `${args.requirement}.*${args.feature}`;
    if (new RegExp(tag).test(content)) {
      return { updated: false, rowsAdded: 0 };
    }

    const isRich = content.includes(
      "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |"
    );
    const row = isRich
      ? `| ${args.requirement} | ${args.scenario || "TBD"} | \`${args.feature}\` | TBD | TBD | TBD | TBD | TBD | TBD | ${args.status} |`
      : `| \`${args.feature}\` | ${args.requirement} | ${args.scenario || "TBD"} | ${args.status} |`;

    fs.appendFileSync(tracePath, `\n${row}\n`, "utf8");
    return { updated: true, rowsAdded: 1 };
  }
}

export class LintPackTool implements ITool {
  public readonly name = "lint_pack";
  public readonly description = "Run pack lint on a domain pack and return errors/warnings.";
  public readonly csda = "pack lint";
  public readonly inputSchema = {
    type: "object",
    properties: {
      packRoot: { type: "string", description: "Directory containing pack folders." },
      packId: {
        type: "string",
        description: "Pack identifier, e.g. parking-management/backend.",
      },
      cliPath: {
        type: "string",
        description: "Override the CLI command (default: 'npx create-spec-driven-app').",
      },
    },
    required: ["packRoot", "packId"],
  };

  public handler(args: Record<string, unknown>) {
    if (!args.packRoot || !args.packId) {
      throw new Error("packRoot and packId are required");
    }
    const result = CliInvoker.spawnCli(
      args.cliPath as string,
      ["pack", "lint", "--pack-root", args.packRoot as string, "--pack", args.packId as string],
      { timeout: 30_000, encoding: "utf8" }
    );

    const combined = (result.stdout || "") + "\n" + (result.stderr || "");
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const line of combined.split("\n")) {
      if (line.includes("[ERROR]")) errors.push(line.replace(/^.*\[ERROR\]\s*/, "").trim());
      else if (line.includes("[WARN]")) warnings.push(line.replace(/^.*\[WARN\]\s*/, "").trim());
    }

    return {
      exitCode: typeof result.status === "number" ? result.status : 1,
      errors,
      warnings,
      raw: combined.trim(),
    };
  }
}

export class ValidateProjectTool implements ITool {
  public readonly name = "validate_project";
  public readonly description = "Run validate on a spec-driven project and return errors/warnings.";
  public readonly csda = "validate";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" },
    },
    required: ["projectDir"],
  };

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const result = CliInvoker.spawnCli(args.cliPath as string, ["validate", dir], {
      timeout: 30_000,
      encoding: "utf8",
    });

    const combined = (result.stdout || "") + "\n" + (result.stderr || "");
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const line of combined.split("\n")) {
      if (line.includes("[ERROR]")) errors.push(line.replace(/^.*\[ERROR\]\s*/, "").trim());
      else if (line.includes("[WARN]")) warnings.push(line.replace(/^.*\[WARN\]\s*/, "").trim());
    }

    return {
      exitCode: typeof result.status === "number" ? result.status : 1,
      passed: result.status === 0,
      errors,
      warnings,
      raw: combined.trim(),
    };
  }
}

export class PlanTool implements ITool {
  public readonly name = "plan";
  public readonly description =
    "List every requirement and its work bucket (NEEDS_FEATURE, NEEDS_TEST, NEEDS_IMPLEMENTATION, NEEDS_STATUS_UPDATE, DONE). Use this BEFORE writing code to discover what to do next.";
  public readonly csda = "plan";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: { type: "string", description: "Absolute path to the project root." },
      cliPath: { type: "string" },
    },
    required: ["projectDir"],
  };

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const result = CliInvoker.spawnCli(
      args.cliPath as string,
      ["plan", "--project-dir", dir, "--format", "json"],
      {
        timeout: 30_000,
        encoding: "utf8",
      }
    );
    if (result.status !== 0) {
      throw new Error(
        `plan failed (${result.status}): ${result.stderr || result.stdout || "unknown error"}`
      );
    }
    try {
      return JSON.parse(result.stdout || "{}");
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`plan returned non-JSON output: ${error.message}\nstdout: ${result.stdout}`);
    }
  }
}

export class MarkRequirementDoneTool implements ITool {
  public readonly name = "mark_requirement_done";
  public readonly description =
    "Update the Status of a requirement row in traceability.md (default: Implemented). Pass check=true to run `validate` first and abort on failure.";
  public readonly csda = "done";
  public readonly inputSchema = {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      requirement: { type: "string", description: "e.g. REQ-007" },
      status: {
        type: "string",
        enum: ["Draft", "Approved", "Implemented", "Verified", "Released", "Deprecated"],
        description: "Target status (default: Implemented)",
      },
      check: {
        type: "boolean",
        description: "Run validate before updating; abort if it fails.",
      },
      cliPath: { type: "string" },
    },
    required: ["projectDir", "requirement"],
  };

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    if (!args.requirement) throw new Error("Missing argument: requirement (e.g. REQ-007)");
    const argv = ["done", args.requirement as string, "--project-dir", dir];
    if (args.status) argv.push("--status", args.status as string);
    if (args.check) argv.push("--check");
    const result = CliInvoker.spawnCli(args.cliPath as string, argv, {
      timeout: 60_000,
      encoding: "utf8",
    });
    const raw = (result.stdout || "") + (result.stderr ? `\n${result.stderr}` : "");
    return {
      exitCode: typeof result.status === "number" ? result.status : 1,
      success: result.status === 0,
      raw: raw.trim(),
    };
  }
}

// ── Tool registry ────────────────────────────────────────────────────────────────

export const TOOLS: Record<string, ITool> = {
  read_spec: new ReadSpecTool(),
  list_requirements: new ListRequirementsTool(),
  update_traceability: new UpdateTraceabilityTool(),
  lint_pack: new LintPackTool(),
  validate_project: new ValidateProjectTool(),
  plan: new PlanTool(),
  mark_requirement_done: new MarkRequirementDoneTool(),
};

// Legacy exports for tests
export const readSpec = (args: any) => TOOLS.read_spec.handler(args);
export const listRequirements = (args: any) => TOOLS.list_requirements.handler(args);
export const updateTraceability = (args: any) => TOOLS.update_traceability.handler(args);
export const lintPack = (args: any) => TOOLS.lint_pack.handler(args);
export const validateProject = (args: any) => TOOLS.validate_project.handler(args);
export const plan = (args: any) => TOOLS.plan.handler(args);
export const markRequirementDone = (args: any) => TOOLS.mark_requirement_done.handler(args);
