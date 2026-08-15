/**
 * Argument parsing and help. Pure — no side effects, no process.exit — so the
 * whole surface can be asserted in a test instead of by running the binary.
 */

import type { PermissionMode } from "./engine/types.js";

export interface CliOptions {
  prompt: string | null;
  print: boolean;
  model: string | null;
  permissionMode: PermissionMode;
  allowedTools: string[] | null;
  disallowedTools: string[] | null;
  addDirs: string[];
  cwd: string;
  maxTurns: number | null;
  resume: string | null;
  continueSession: boolean;
  engine: "toolrunner" | "scripted";
  cliPath: string | null;
  listTools: boolean;
  help: boolean;
  version: boolean;
}

export const PERMISSION_MODES: PermissionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
];

export class CliError extends Error {
  constructor(
    message: string,
    readonly fix?: string
  ) {
    super(message);
  }
}

const defaults = (cwd: string): CliOptions => ({
  prompt: null,
  print: false,
  model: null,
  permissionMode: "default",
  allowedTools: null,
  disallowedTools: null,
  addDirs: [],
  cwd,
  maxTurns: null,
  resume: null,
  continueSession: false,
  engine: "toolrunner",
  cliPath: null,
  listTools: false,
  help: false,
  version: false,
});

const list = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function parseArgs(argv: string[], cwd = process.cwd()): CliOptions {
  const opts = defaults(cwd);
  const positional: string[] = [];

  const need = (flag: string, value: string | undefined) => {
    if (value === undefined) throw new CliError(`${flag} expects a value.`);
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-p":
      case "--print":
        opts.print = true;
        break;
      case "--model":
        opts.model = need("--model", argv[++i]);
        break;
      case "--permission-mode": {
        const mode = need("--permission-mode", argv[++i]) as PermissionMode;
        if (!PERMISSION_MODES.includes(mode)) {
          throw new CliError(
            `Unknown permission mode: ${mode}.`,
            `Expected one of: ${PERMISSION_MODES.join(", ")}.`
          );
        }
        opts.permissionMode = mode;
        break;
      }
      case "--allowed-tools":
      case "--allowedTools":
        opts.allowedTools = list(need("--allowed-tools", argv[++i]));
        break;
      case "--disallowed-tools":
      case "--disallowedTools":
        opts.disallowedTools = list(need("--disallowed-tools", argv[++i]));
        break;
      case "--add-dir":
        opts.addDirs.push(need("--add-dir", argv[++i]));
        break;
      case "--cwd":
        opts.cwd = need("--cwd", argv[++i]);
        break;
      case "--max-turns": {
        const raw = need("--max-turns", argv[++i]);
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new CliError(`--max-turns expects a positive integer, got "${raw}".`);
        }
        opts.maxTurns = parsed;
        break;
      }
      case "--cli-path":
        opts.cliPath = need("--cli-path", argv[++i]);
        break;
      case "--list-tools":
        opts.listTools = true;
        break;
      case "--resume":
        opts.resume = need("--resume", argv[++i]);
        break;
      case "--continue":
        opts.continueSession = true;
        break;
      case "--engine": {
        const engine = need("--engine", argv[++i]);
        if (engine !== "toolrunner" && engine !== "scripted") {
          throw new CliError(`Unknown engine: ${engine}.`, "Expected: toolrunner | scripted.");
        }
        opts.engine = engine;
        break;
      }
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new CliError(`Unknown flag: ${arg}.`, "Run `csda-agent --help` for the full list.");
        }
        positional.push(arg);
    }
  }

  if (positional.length > 0) opts.prompt = positional.join(" ");

  // `bypassPermissions` disables every gate. It has to be typed out in full and
  // is never reachable by cycling modes at runtime.
  if (opts.permissionMode === "bypassPermissions" && !opts.print) {
    // Allowed, but the TUI shows it in red — see StatusLine.
  }

  return opts;
}

export function helpText(): string {
  return `
  csda-agent — an agent that can only drive create-spec-driven-app

  USAGE
    csda-agent [prompt] [options]

  OPTIONS
    -p, --print                 Non-interactive: run once, print, exit.
        --model <id>            Model to use (engine default when omitted).
        --permission-mode <m>   default | acceptEdits | plan | bypassPermissions
        --allowed-tools <list>  Comma-separated allowlist.
        --disallowed-tools <l>  Comma-separated denylist.
        --add-dir <path>        Grant access to another directory (repeatable).
        --cwd <path>            Working directory (default: current).
        --max-turns <n>         Stop after n agent turns — a CI safety net.
        --resume <session-id>   Resume a previous session.
        --continue              Continue the most recent session.
        --cli-path <path>       Path to create-spec-driven-app.js (auto-detected).
        --list-tools            Print the agent's entire tool set and exit.
        --engine <e>            toolrunner | scripted (default: toolrunner).
    -h, --help                  Show this help.
    -v, --version               Show the version.

  KEYS
    esc          Interrupt the turn in flight (aborts the request).
    shift+tab    Cycle permission mode: ask → auto-edit → plan.
    ctrl+c       Interrupt, or exit when idle.

  The agent has no shell and no general file access: it can call the csda
  commands and read/write files inside the project, and nothing else.
  Run --list-tools to see the whole surface.

  Non-TTY stdout falls back to --print automatically.
`;
}
