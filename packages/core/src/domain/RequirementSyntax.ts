/**
 * Whether a requirement's prose is checkable by a machine — EARS, opt-in (F6).
 *
 * ## Why this exists
 *
 * `PLAN_PREDICTABLE_CODE_EVOLUTION.md` §4 names the real gap against
 * Predictable Code: `csda validate` checks that the paperwork is internally
 * consistent, not that the code does what the spec says. §8.1 draws the
 * consequence — a code verifier is useless while the spec it checks against is
 * prose. `- Max 5 failed attempts per hour per user` is not checkable by
 * anything. So the first step is not a verifier; it is making the requirement
 * itself say something a machine can hold code to.
 *
 * EARS (Easy Approach to Requirements Syntax) is the narrowest tool for that:
 * five sentence shapes, each pairing a trigger keyword with an obligation.
 * This module does not attempt to parse full EARS grammar — no regex can
 * reliably tell "the system" from a response clause. It checks the one thing a
 * regex can tell honestly: whether an obligation keyword (RFC 2119) is present
 * at all, and whether a requirement that opens as an unwanted-behaviour clause
 * (`IF …`) actually resolves with `THEN …`. Anything wider would be the H13
 * mistake again — a check that claims to enforce a grammar it does not parse.
 *
 * ## Why RFC 2119 lives here now
 *
 * `DeltaSpec.ts` already enforces `no_rfc2119_keyword`, but only for
 * requirements inside a delta (`change validate` / `change archive`) — a
 * capability spec at rest has never been checked. Moving the constant here and
 * having `DeltaSpec` import it keeps one definition instead of two that can
 * drift, which is the F1/A3 lesson: a rule enforced in one place and silent in
 * another is not a rule, it is luck.
 */

import type { Diagnostic } from "./Diagnostic";
import { warning } from "./Diagnostic";

/** An obligation keyword, English or Spanish. Unchanged from `DeltaSpec`. */
export const RFC2119 = /\b(SHALL|MUST|SHOULD|MAY|DEBE|DEBERÁ|DEBERA)\b/;

/** Every code this module can emit. Callers branch on these, never on prose. */
export const REQUIREMENT_SYNTAX_CODES = Object.freeze({
  NO_RFC2119: "no_rfc2119_keyword",
  MISSING_THEN: "requirement_missing_then_clause",
});

/**
 * The one paired-keyword EARS shape a regex can check honestly: a requirement
 * that opens as "IF <trigger>" (unwanted behaviour) has to resolve with
 * "THEN <response>" in the same sentence, or it names a trigger and never says
 * what happens.
 *
 * The other four EARS shapes — ubiquitous, event-driven (`WHEN`), state-driven
 * (`WHILE`), optional-feature (`WHERE`) — have no second keyword to be missing;
 * their only checkable requirement is the obligation keyword, which
 * `NO_RFC2119` already covers. Claiming to validate their internal structure
 * beyond that would be checking a shape this module cannot actually parse.
 */
const IF_TRIGGER = /^\s*(?:IF|SI)\b/i;
const THEN_KEYWORD = /\b(?:THEN|ENTONCES)\b/i;

/**
 * Checks one requirement's prose. `text` is the requirement body as
 * `SpecParser` / `DeltaSpec` hand it over — free-text only, scenario steps
 * live separately and are not part of this check.
 *
 * Two independent findings, never conflated: a requirement can state no
 * obligation at all (`NO_RFC2119`), or state one but leave an `IF` trigger
 * unresolved (`MISSING_THEN`). A requirement missing both reports both — they
 * are different defects with different fixes.
 */
export function analyseRequirementText(
  text: string,
  opts: { target: string; file?: string; line?: number }
): Diagnostic[] {
  const trimmed = String(text || "").trim();
  const found: Diagnostic[] = [];
  const at = (extra: Record<string, unknown> = {}) => ({
    target: opts.target,
    ...(opts.file ? { file: opts.file } : {}),
    ...(opts.line ? { line: opts.line } : {}),
    ...extra,
  });

  if (!trimmed) return found;

  const hasObligation = RFC2119.test(trimmed);
  if (!hasObligation) {
    found.push(
      warning(
        REQUIREMENT_SYNTAX_CODES.NO_RFC2119,
        `${opts.target} states no obligation (SHALL / MUST / SHOULD / MAY / DEBE / DEBERÁ).`,
        at({ fix: 'Rewrite the body as "The system SHALL …" or one of its EARS forms.' })
      )
    );
  }

  if (IF_TRIGGER.test(trimmed) && !THEN_KEYWORD.test(trimmed)) {
    found.push(
      warning(
        REQUIREMENT_SYNTAX_CODES.MISSING_THEN,
        `${opts.target} opens with "IF" but never resolves with "THEN" — the trigger names a ` +
          "condition and never says what the system does about it.",
        at({ fix: 'Complete the EARS unwanted-behaviour form: "IF <trigger>, THEN the system SHALL …".' })
      )
    );
  }

  return found;
}
