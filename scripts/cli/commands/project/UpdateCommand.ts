import * as fs from "node:fs";
import * as path from "node:path";
import { resolveProjectDir } from "../../../lib/project-root";
import { error, warning, info, errorMessage } from "../../../lib/diagnostics";
import { agentIo, wantsJson, EXIT } from "../../../lib/agent";
import { threeWayMerge } from "../../../../packages/core/src/infrastructure/GitMergeDriver";
import { TOOLS, ALL_TOOLS } from "../../../agents/init";
import { BaseCommand } from "../../../lib/command";

export const BASELINE_DIR = path.join(".csda", "baseline");

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  yellow: COLOR ? "\x1b[33m" : "",
  red: COLOR ? "\x1b[31m" : "",
  cyan: COLOR ? "\x1b[36m" : "",
};

function readIfExists(file: string) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function baselinePath(projectDir: string, rel: string) {
  return path.join(projectDir, BASELINE_DIR, rel);
}

export function generatedFiles(projectDir: string) {
  const planned = new Map();
  for (const tool of ALL_TOOLS) {
    for (const file of TOOLS[tool].files()) {
      const entry = planned.get(file.path);
      if (entry) entry.tools.push(tool);
      else planned.set(file.path, { ...file, tools: [tool] });
    }
  }
  return [...planned.values()].filter((f) => fs.existsSync(path.join(projectDir, f.path)));
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

export interface UpdateOptions {
  dryRun?: boolean;
}

export interface UpdateResult {
  path: string;
  outcome: "unchanged" | "written" | "adopted" | "updated" | "conflict";
  note?: string;
  conflicts?: number;
}

export function updateFile(
  projectDir: string,
  file: GeneratedFile,
  opts: UpdateOptions
): UpdateResult {
  const target = path.join(projectDir, file.path);
  const local = readIfExists(target);
  const base = readIfExists(baselinePath(projectDir, file.path));
  const incoming = file.contents;

  if (local === incoming) {
    return { path: file.path, outcome: "unchanged" };
  }

  if (base === null) {
    if (!opts.dryRun) writeBaseline(projectDir, file.path, incoming);
    return {
      path: file.path,
      outcome: local === null ? "written" : "adopted",
      ...(local === null ? {} : { note: "no baseline — kept your version, tracking from now on" }),
    };
  }

  if (base === incoming) {
    return { path: file.path, outcome: "unchanged" };
  }

  const { merged, conflict, conflicts } = threeWayMerge(base, local ?? "", incoming, {
    local: "local (your edits)",
    base: "base (last update)",
    incoming: "incoming (new CLI version)",
  });

  if (!opts.dryRun) {
    fs.writeFileSync(target, merged, "utf8");
    writeBaseline(projectDir, file.path, incoming);
  }

  return {
    path: file.path,
    outcome: conflict ? "conflict" : "updated",
    ...(conflict ? { conflicts } : {}),
  };
}

function writeBaseline(projectDir: string, rel: string, contents: string) {
  const file = baselinePath(projectDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🔄 update${c.reset}  ${c.dim}— refresh generated files, keeping your edits${c.reset}\n\n` +
      "  USAGE\n    csda update [--project-dir <path>] [--dry-run] [--json]\n\n" +
      "  Three-way merges the files `agents init` generates against the baseline\n" +
      "  recorded in .csda/baseline/. Local edits win; upstream changes land;\n" +
      "  conflicts are marked in the file and reported, never resolved silently.\n\n" +
      "  Only files the project already has are touched. Adding a tool is\n" +
      "  `csda agents init --tool <name>`.\n\n"
  );
}

const MARK = {
  unchanged: `${c.dim}·${c.reset}`,
  updated: `${c.green}~${c.reset}`,
  written: `${c.green}+${c.reset}`,
  adopted: `${c.yellow}=${c.reset}`,
  conflict: `${c.red}!${c.reset}`,
};

function renderHuman(results: UpdateResult[], dryRun?: boolean) {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});

  process.stdout.write(
    `\n  ${c.bold}update${c.reset}${dryRun ? ` ${c.dim}(dry run — nothing written)${c.reset}` : ""}\n\n`
  );
  for (const r of results) {
    const note = r.note ? ` ${c.dim}— ${r.note}${c.reset}` : "";
    const conflicts = r.conflicts ? ` ${c.red}(${r.conflicts} conflict(s))${c.reset}` : "";
    process.stdout.write(`    ${MARK[r.outcome]} ${r.path}${conflicts}${note}\n`);
  }

  const summary = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
  process.stdout.write(`\n  ${summary}\n`);

  if (counts.conflict) {
    process.stdout.write(
      `\n  ${c.red}Resolve the <<<<<<< markers before committing.${c.reset}\n` +
        `  ${c.dim}Your version is the first block in each conflict.${c.reset}\n`
    );
  }
  process.stdout.write("\n");
}

export class UpdateCommand extends BaseCommand {
  public execute(): void {
    const argv = this.args;
    const io = agentIo(wantsJson(argv));
    const NULL_SHAPE = { update: null };

    if (argv.includes("--help") || argv.includes("-h")) {
      usage();
      process.exit(EXIT.OK);
    }

    const dryRun = argv.includes("--dry-run");
    const dirFlag = argv.indexOf("--project-dir");

    let projectDir: string;
    try {
      projectDir = resolveProjectDir(dirFlag !== -1 ? argv[dirFlag + 1] : ".");
    } catch (err) {
      io.usage(NULL_SHAPE, [
        error("project_not_found", errorMessage(err), {
          fix: "Run from inside a spec-driven project, or pass --project-dir.",
        }),
      ]);
      return;
    }

    const files = generatedFiles(projectDir);
    if (files.length === 0) {
      io.emit(
        {
          update: { projectDir, dryRun, files: [] },
          status: [
            info("nothing_generated", "This project has no generated agent files yet.", {
              fix: "csda agents init",
            }),
          ],
        },
        () =>
          process.stdout.write(
            `\n  ${c.dim}Nothing to update — this project has no generated agent files.${c.reset}\n` +
              `  ${c.green}csda agents init${c.reset}${c.dim} writes them.${c.reset}\n\n`
          )
      );
      return;
    }

    const results = files.map((f) => updateFile(projectDir, f, { dryRun }));
    const conflicted = results.filter((r) => r.outcome === "conflict");
    const diagnostics = conflicted.map((r) =>
      warning("update_conflict", `${r.path} has ${r.conflicts} conflict(s) to resolve by hand.`, {
        file: r.path,
        fix: "Open it and resolve the <<<<<<< markers. Your version is the first block.",
      })
    );

    io.emit({ update: { projectDir, dryRun, files: results }, status: diagnostics }, () =>
      renderHuman(results, dryRun)
    );
    process.exit(EXIT.OK);
  }
}
