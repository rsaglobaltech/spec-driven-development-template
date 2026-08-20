import { resolveProjectDir } from "../../../lib/project-root";
import { error } from "../../../lib/diagnostics";
import { agentIo, EXIT } from "../../../lib/agent";
import { BaseCommand } from "../../../lib/command";
import { DiskTraceabilityRepository } from "../../../../packages/core/src/infrastructure/DiskTraceabilityRepository";
import { UpdateRequirementStatusUseCase } from "../../../../packages/core/src/application/UpdateRequirementStatusUseCase";

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
};

export const ALLOWED_STATUSES = [
  "Draft",
  "Approved",
  "Implemented",
  "Verified",
  "Released",
  "Deprecated",
];

export interface DoneOptions {
  reqId: string | null;
  status: string;
  projectDir: string;
  check: boolean;
  strict: boolean;
  json?: boolean;
}

export function parseArgs(argv: string[]): DoneOptions {
  const opts: DoneOptions = {
    reqId: null,
    status: "Implemented",
    projectDir: ".",
    check: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status" && argv[i + 1]) opts.status = argv[++i];
    else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--check") opts.check = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--strict") {
      opts.strict = true;
      opts.check = true;
    } else if (!opts.reqId && !a.startsWith("-")) {
      opts.reqId = a;
    }
  }
  return opts;
}

export class DoneCommand extends BaseCommand {
  public execute(): void {
    const opts = parseArgs(this.args);
    const io = agentIo(opts.json);
    const NULL_SHAPE = { requirement: null };

    if (!opts.reqId) {
      io.usage(NULL_SHAPE, [
        error("req_id_required", "REQ-id is required (e.g. REQ-007).", {
          fix: "Pass the requirement id: csda done REQ-007",
        }),
      ]);
    }
    if (!/^REQ-\d+$/.test(opts.reqId!)) {
      io.usage(NULL_SHAPE, [
        error("req_id_malformed", `Invalid REQ-id: ${opts.reqId} (expected REQ-NNN).`, {
          target: opts.reqId!,
          fix: "Use the REQ-NNN form, e.g. REQ-007.",
        }),
      ]);
    }

    let projectDir: string;
    try {
      projectDir = resolveProjectDir(opts.projectDir);
    } catch (err: any) {
      io.usage(NULL_SHAPE, [
        error("project_not_found", err.message, {
          fix: "Run from inside a spec-driven project, or pass --project-dir.",
        }),
      ]);
      return;
    }

    const repo = new DiskTraceabilityRepository();
    const useCase = new UpdateRequirementStatusUseCase(repo);
    const result = useCase.execute(projectDir, opts.reqId!, opts.status);

    if (!result.ok) {
      if (result.code === "traceability_not_found") {
        io.usage(NULL_SHAPE, [
          error("traceability_not_found", result.error || "traceability.md not found", {
            file: "docs/specs/traceability.md",
            fix: "Scaffold it with `csda init`, or adopt the project with `csda adopt`.",
          }),
        ]);
      } else {
        io.fail(NULL_SHAPE, [
          error(
            "requirement_not_in_matrix",
            result.error || `${opts.reqId} not found in traceability.md.`,
            {
              target: opts.reqId!,
              fix: `Add a row for ${opts.reqId} — \`csda req add\` writes one for you.`,
            }
          ),
        ]);
      }
    }

    const updated = result.updated;
    io.emit({ requirement: { id: opts.reqId, status: opts.status, rowsUpdated: updated } }, () =>
      process.stdout.write(
        `${c.green}✔${c.reset}  ${c.bold}${opts.reqId}${c.reset} → ${c.bold}${opts.status}${c.reset} ${c.dim}(${updated} row${updated > 1 ? "s" : ""} updated)${c.reset}\n`
      )
    );
    process.exit(EXIT.OK);
  }
}
