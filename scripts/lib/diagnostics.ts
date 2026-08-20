/**
 * Rendering diagnostics for a human at a terminal.
 *
 * The envelope itself — the `Diagnostic` shape, its constructors and its
 * predicates — is domain, and lives in `packages/core/src/domain/Diagnostic`.
 * This module is the delivery half: colours, stream writes and the `--json`
 * failure shape. It re-exports the domain half so the ~28 existing importers
 * keep one import site.
 */

import { Diagnostic, SEVERITY } from "../../packages/core/src/domain/Diagnostic";

export {
  Diagnostic,
  DiagnosticExtra,
  SEVERITY,
  diagnostic,
  error,
  warning,
  info,
  hasErrors,
  countBySeverity,
  errorMessage,
} from "../../packages/core/src/domain/Diagnostic";

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
  [SEVERITY.ERROR]: `${c.red}✖${c.reset}`,
  [SEVERITY.WARNING]: `${c.yellow}▲${c.reset}`,
  [SEVERITY.INFO]: `${c.cyan}ℹ${c.reset}`,
};

export function formatDiagnostic(d: Diagnostic) {
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
