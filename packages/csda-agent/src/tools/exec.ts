/**
 * Running csda.
 *
 * `spawn` with an argv array and **no shell**. The agent never composes a
 * command string, so there is nothing to quote, escape or inject: an argument
 * containing `; rm -rf /` is one literal argument to csda, not two commands.
 * That property is why the manifest is a boundary rather than a filter.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";

export interface ExecResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecOptions {
  /** Absolute path to the csda entry point. */
  cliPath: string;
  cwd: string;
  timeoutMs?: number;
  /** Cap on captured output, so one noisy command cannot fill the context. */
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT = 100_000;

export function runCsda(argv: string[], options: ExecOptions): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [options.cliPath, ...argv], {
      cwd: options.cwd,
      // No shell. This is the load-bearing line.
      shell: false,
      env: { ...process.env, NO_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (buffer: string, chunk: string) =>
      buffer.length >= maxOutput ? buffer : buffer + chunk;

    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, String(chunk));
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: String(err), timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const truncate = (text: string) =>
        text.length > maxOutput
          ? `${text.slice(0, maxOutput)}\n… output truncated at ${maxOutput} bytes`
          : text;
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        timedOut,
      });
    });
  });
}

/**
 * What the model sees after a command runs.
 *
 * The exit code is stated explicitly. A model shown only stdout will happily
 * report success for a command that exited 1 — `validate` in particular prints
 * plenty on the way to failing.
 */
export function formatResult(argv: string[], result: ExecResult): string {
  const head = `$ csda ${argv.join(" ")}\nexit code: ${result.timedOut ? "timed out" : result.code}`;
  const parts = [head];
  if (result.stdout.trim()) parts.push(`--- stdout ---\n${result.stdout.trim()}`);
  if (result.stderr.trim()) parts.push(`--- stderr ---\n${result.stderr.trim()}`);
  if (!result.stdout.trim() && !result.stderr.trim()) parts.push("(no output)");
  return parts.join("\n\n");
}

/** Locate the csda entry point, preferring an explicit path. */
export function resolveCliPath(explicit: string | null, repoRoot: string): string {
  if (explicit) return path.resolve(explicit);
  return path.resolve(repoRoot, "bin", "create-spec-driven-app.js");
}
