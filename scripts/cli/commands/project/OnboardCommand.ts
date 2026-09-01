import * as fs from "node:fs";
import * as path from "node:path";
import { resolveProjectDir } from "../../../lib/project-root";
import { error, info } from "../../../lib/diagnostics";
import { agentIo, wantsJson, EXIT } from "../../../lib/agent";
import { detectStack } from "./AdoptCommand";
import { BaseCommand } from "../../../lib/command";

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  cyan: COLOR ? "\x1b[36m" : "",
};

export const NOT_DOMAIN = new Set([
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

function subdirectories(dir: string) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export function descendThroughWrappers(root: string) {
  let current = root;
  for (let depth = 0; depth < 6; depth++) {
    const children = subdirectories(current);
    if (children.length !== 1) return current;
    current = path.join(current, children[0]);
  }
  return current;
}

function countFiles(dir: string) {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total < 500) {
    const next = stack.pop()!;
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

export function titleCase(name: string) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function proposeCapabilities(projectDir: string) {
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

function isAdopted(projectDir: string) {
  return fs.existsSync(path.join(projectDir, "spec.md"));
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🧭 onboard${c.reset}  ${c.dim}— the guided tour for an existing repository${c.reset}\n\n` +
      "  USAGE\n    specgate onboard [--project-dir <path>] [--json]\n\n" +
      "  Reads the repository, proposes the capabilities its code already implies,\n" +
      "  and tells you the one command to run next. Writes nothing.\n\n"
  );
}

function renderHuman({ projectDir, adopted, stack, capabilities, nextCommand }: any) {
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
      : `     ${c.dim}· not adopted yet — \`specgate adopt\` writes the skeleton without touching code${c.reset}`
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

export class OnboardCommand extends BaseCommand {
  public execute(): void {
    const argv = this.args;
    const io = agentIo(wantsJson(argv));
    const NULL_SHAPE = { onboarding: null };

    if (argv.includes("--help") || argv.includes("-h")) {
      usage();
      process.exit(EXIT.OK);
    }

    const dirFlag = argv.indexOf("--project-dir");
    const requested = dirFlag !== -1 ? argv[dirFlag + 1] : ".";

    let projectDir: string;
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
      ? "specgate adopt"
      : capabilities.length > 0
        ? `specgate change new describe-${capabilities[0].id}`
        : 'specgate req add "<the first behaviour you rely on>"';

    const diagnostics = [];
    if (!stack.detected) {
      diagnostics.push(
        info("stack_undetected", "Could not detect the stack from a manifest file.", {
          fix: 'Pass it explicitly: specgate adopt --var STACK="…" --var TEST_CMD="…"',
        })
      );
    }
    if (capabilities.length === 0) {
      diagnostics.push(
        info("capabilities_undetected", "No capability structure was obvious from the layout.", {
          fix: "Name them yourself — one per area of behaviour a user would recognise. `specgate change new <id>` opens the first.",
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
}
