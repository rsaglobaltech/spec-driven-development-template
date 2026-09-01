import * as fs from "node:fs";
import * as path from "node:path";
import { SURFACE, mcpTools } from "./lib/surface";

const OUT_FILE = path.join(__dirname, "../packages/mcp-spec-driven/src/tools.ts");
const toolsMap = mcpTools() as Record<string, string>;

// Convert toolsMap { toolName: "command name" } back into lookup by "command name"
const cmdToTool = Object.entries(toolsMap).reduce(
  (acc, [tool, cmd]) => {
    acc[cmd] = tool;
    return acc;
  },
  {} as Record<string, string>
);

let out = `// GENERATED FILE - DO NOT EDIT BY HAND
// Derived from scripts/lib/surface.ts

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
    const combined = (result.stdout || "") + "\\n" + (result.stderr || "");
    try {
      if (result.stdout && result.stdout.trim().startsWith("{")) {
         return JSON.parse(result.stdout.trim());
      }
    } catch {
      // Not JSON: fall through to the raw envelope below.
    }
    
    return {
      exitCode: typeof result.status === "number" ? result.status : 1,
      raw: combined.trim(),
    };
  }
}

export const TOOLS: Record<string, ITool> = {};

`;

for (const command of SURFACE) {
  const processCmd = (cmdDef: any, subDef: any) => {
    const cmdString = subDef ? `${cmdDef.name} ${subDef.name}` : cmdDef.name;
    const toolName = cmdToTool[cmdString];
    if (!toolName) return; // skipped via mcp: false

    const summary =
      (subDef ? subDef.help?.summary : cmdDef.help?.summary) || `Run specgate ${cmdString}`;

    out += `TOOLS["${toolName}"] = new GenericCliTool(
  "${toolName}",
  ${JSON.stringify(summary)},
  "${cmdString}",
  {
    type: "object",
    properties: {
      projectDir: { type: "string" },
      cliPath: { type: "string" }
    },
    required: ["projectDir"]
  }
);\n`;
  };

  if (command.subcommands) {
    for (const sub of command.subcommands) {
      processCmd(command, sub);
    }
  } else {
    processCmd(command, null);
  }
}

// Add the 3 legacy manual tools that aren't CLI commands
out += `
// Legacy exports for tests
export const readSpec = (args: any) => TOOLS["csda_read_spec"] ? TOOLS["csda_read_spec"].handler(args) : {};
export const listRequirements = (args: any) => TOOLS["csda_list_requirements"] ? TOOLS["csda_list_requirements"].handler(args) : {};
export const updateTraceability = (args: any) => TOOLS["csda_update_traceability"] ? TOOLS["csda_update_traceability"].handler(args) : {};
export const lintPack = (args: any) => TOOLS["csda_pack_lint"].handler(args);
export const validateProject = (args: any) => TOOLS["csda_validate"].handler(args);
export const plan = (args: any) => TOOLS["csda_plan"].handler(args);
export const markRequirementDone = (args: any) => TOOLS["csda_done"].handler(args);
`;

fs.writeFileSync(OUT_FILE, out);
console.log("Generated tools.ts");
