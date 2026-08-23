/**
 * Did the green diff touch what the matrix said it would? (A2)
 *
 * ## The lie this catches
 *
 * A matrix row declares `test_artifact` and `technical_artifact`, and the
 * prompt hands both to the agent. Nothing checked that the diff contained them.
 * An agent can implement somewhere else entirely, pass the scenario, and leave
 * the matrix pointing at a file where the logic does not live — exactly the
 * documentary lie this repository forbids itself in `AI_RULES.md`.
 *
 * ## Why this is a warning and not a gate
 *
 * There are legitimate cases. An implementation can land in a shared module
 * that already exists, and the row naming the new module is still the honest
 * summary. Turning that into a hard failure without evidence would be the kind
 * of gate that rejects good work — which already cost two runs on REQ-002.
 * `--strict-artifacts` is there for a project that wants the stricter reading.
 *
 * ## The part that decides whether any of this is usable
 *
 * Most declarations in a real matrix are **not paths**. The scaffolded row says
 * `` `API /health`, smoke test `` and its test artifact says `TBD`. Comparing
 * prose against a diff would report every scaffolded project as untouched,
 * which is noise, and noise is how a warning gets ignored — the failure mode
 * that made `--strict`-only rules useless in H14.
 *
 * So a declaration is only checked when it names something a diff could
 * plausibly contain. Everything else is skipped in silence: this module reports
 * what it can substantiate, and nothing else.
 */

import type { Diagnostic } from "./Diagnostic";
import { error, warning } from "./Diagnostic";

export const ARTIFACT_CODES = Object.freeze({
  UNTOUCHED: "declared_artifact_untouched",
});

/**
 * Does this fragment name a file rather than describe one?
 *
 * The rule: no whitespace, and either a directory separator or a file
 * extension. `src/App.java` and `App.java` qualify; `API /health`, `smoke test`
 * and `TBD` do not. It is a heuristic, and it is deliberately biased towards
 * saying no — a missed check costs a warning nobody sees, while a false one
 * teaches people that this warning is wrong and should be ignored.
 */
export function looksLikePath(fragment: string): boolean {
  const value = fragment.trim();
  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (/^(TBD|TODO|N\/A|-|—)$/i.test(value)) return false;
  return value.includes("/") || /\.[A-Za-z0-9]{1,10}$/.test(value);
}

/**
 * The file paths a matrix cell declares.
 *
 * A cell is markdown written by a person: back-ticked, comma-separated, and
 * frequently part path and part prose — `` `src/Health.java`, smoke test ``
 * declares one path and one intention. Both halves are kept apart rather than
 * forcing the cell to be all one or all the other.
 */
export function declaredPaths(cell: string | undefined | null): string[] {
  if (!cell) return [];
  return String(cell)
    .split(",")
    .map((part) => part.replace(/`/g, "").trim())
    .filter((part) => looksLikePath(part))
    .map((part) => part.replace(/\\/g, "/").replace(/^\.\//, ""));
}

export interface DeclaredArtifactsInput {
  /** Every path the diff touched — added and modified alike. */
  readonly touched: readonly string[];
  readonly testArtifact?: string | null;
  readonly technicalArtifact?: string | null;
  /** What to call the requirement in the report. */
  readonly requirement?: string;
}

/**
 * A declared path counts as touched when the diff contains it, or contains
 * something inside it — a row may name a directory (`src/health/`) and the work
 * lands on files within.
 */
function wasTouched(declared: string, touched: readonly string[]): boolean {
  const target = declared.replace(/\/$/, "");
  return touched.some(
    (path) => path === target || path.startsWith(`${target}/`) || path.endsWith(`/${target}`)
  );
}

/**
 * Declared artifacts the diff never went near.
 *
 * `strict` promotes the finding to an error. Default is a warning, deliberately
 * — see the module note.
 */
export function checkDeclaredArtifacts(
  input: DeclaredArtifactsInput,
  strict = false
): Diagnostic[] {
  const target = input.requirement || "";
  const found: Diagnostic[] = [];
  const raise = strict ? error : warning;

  const kinds: Array<[string, string | null | undefined]> = [
    ["test", input.testArtifact],
    ["production", input.technicalArtifact],
  ];

  for (const [kind, cell] of kinds) {
    for (const declared of declaredPaths(cell)) {
      if (wasTouched(declared, input.touched)) continue;
      found.push(
        raise(
          ARTIFACT_CODES.UNTOUCHED,
          `the matrix declares \`${declared}\` as this requirement's ${kind} artifact, ` +
            `but the diff never touches it.`,
          {
            target,
            // `--code`, not `--impl`: the flag is verified against ReqCommand.
            // A fix naming a flag that does not exist is worse than no fix.
            fix:
              `Either implement it there, or correct the row: ` +
              `\`csda req link ${target || "<REQ>"} --${kind === "test" ? "test" : "code"} <path>\`.`,
          }
        )
      );
    }
  }

  return found;
}
