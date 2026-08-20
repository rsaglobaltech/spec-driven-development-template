/**
 * The one diagnostic envelope every machine-readable surface of the CLI emits.
 *
 *   { severity, code, message, target?, fix?, file?, line? }
 *
 * `code` is a stable snake_case string — callers (CI, agents, the VS Code
 * extension) branch on it, never on the message text. `fix` is one actionable
 * sentence or command; a diagnostic without a fix is a diagnostic the user
 * cannot act on, so treat writing one as part of writing the check.
 *
 * Casing is camelCase everywhere in JSON output, decided once here so we do not
 * inherit the snake/camel split that OpenSpec documents as a known defect.
 */

/** The one diagnostic envelope, as ADR-0017 fixes it. */
export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  target?: string;
  fix?: string;
  file?: string;
  line?: number;
}

export const SEVERITY = Object.freeze({
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
});

export function diagnostic(severity, code, message, extra?) {
  const d: Diagnostic = { severity, code, message };
  if (extra) {
    if (extra.target !== undefined) d.target = extra.target;
    if (extra.fix !== undefined) d.fix = extra.fix;
    if (extra.file !== undefined) d.file = extra.file;
    if (extra.line !== undefined && extra.line !== null) d.line = extra.line;
  }
  return d;
}

export const error = (code, message, extra?) => diagnostic(SEVERITY.ERROR, code, message, extra);
export const warning = (code, message, extra?) =>
  diagnostic(SEVERITY.WARNING, code, message, extra);
export const info = (code, message, extra?) => diagnostic(SEVERITY.INFO, code, message, extra);

export function hasErrors(diags) {
  return (diags || []).some((d) => d.severity === SEVERITY.ERROR);
}

export function countBySeverity(diags) {
  const out = { error: 0, warning: 0, info: 0 };
  for (const d of diags || []) {
    if (out[d.severity] !== undefined) out[d.severity]++;
  }
  return out;
}

// ── Human rendering ───────────────────────────────────────────────────────────

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
};

const MARK = {
  error: `${c.red}✖${c.reset}`,
  warning: `${c.yellow}▲${c.reset}`,
  info: `${c.cyan}ℹ${c.reset}`,
};

export function formatDiagnostic(d) {
  const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : d.target || "";
  const head = `${MARK[d.severity] || "-"}  ${where ? `${c.dim}${where}${c.reset} ` : ""}${d.message}`;
  const fix = d.fix ? `\n     ${c.dim}fix:${c.reset} ${d.fix}` : "";
  const code = `${c.dim}[${d.code}]${c.reset}`;
  return `${head} ${code}${fix}`;
}

export function printDiagnostics(diags, stream?) {
  const out = stream || process.stderr;
  for (const d of diags || []) out.write(`${formatDiagnostic(d)}\n`);
}

/**
 * The failure shape for `--json` mode: one JSON document on stdout carrying the
 * command's null-shape plus the diagnostics, and exit 1. Prose never goes to
 * stdout in JSON mode, so a consumer can always `| jq .`.
 */
export function failJson(nullShape, diags) {
  process.stdout.write(`${JSON.stringify({ ...nullShape, status: diags }, null, 2)}\n`);
  process.exit(1);
}

/**
 * The message of whatever was thrown.
 *
 * `catch (err)` appeared eleven times across `scripts/` purely to reach
 * `.message`. A catch binding is genuinely `unknown` — anything can be thrown —
 * so the honest form is to narrow it once, here.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return errorMessage(err);
  if (typeof err === "string") return err;
  return String(err);
}
