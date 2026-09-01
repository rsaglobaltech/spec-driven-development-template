/**
 * Which already-accepted requirement an agent should be shown as an example (D2).
 *
 * ## What the prompt is missing
 *
 * `buildPrompt` injects the requirement's facts, its Gherkin, `AI_RULES.md` and
 * the definition of done. Every one of those is **normative** — it says what
 * must be true. None of them is an *example*: an agent with no conversation
 * history has never seen what an accepted implementation looks like in this
 * repository, so it invents a house style and the reviewer spends the next
 * attempt correcting it.
 *
 * A precedent is the cheapest possible answer: here is a requirement that was
 * accepted, here is its test, here is its production code.
 *
 * ## Why the same bounded context
 *
 * A precedent from a different part of the system is worse than none — it
 * teaches conventions that do not apply here, with the authority of "this was
 * accepted". D1 already derives each requirement's bounded context and records
 * it on the trace line, so "the same context" is a question the tool can answer
 * rather than a guess from a path.
 *
 * When a project has no contexts at all, every requirement shares the empty
 * one, which is the right answer for a codebase that has not been divided yet.
 *
 * ## Why only Verified
 *
 * `Implemented` means the code exists. `Verified` means somebody checked it.
 * Showing an agent an unverified implementation as a precedent would propagate
 * whatever is wrong with it, and do so as an example to copy.
 *
 * ## Why this module reads nothing
 *
 * Choosing the precedent is a rule; reading the files is I/O. Keeping them
 * apart is what lets every case below be tested without a repository.
 */

export interface PrecedentRow {
  readonly requirementId: string;
  readonly status: string;
  readonly testArtifact: string;
  readonly technicalArtifact: string;
}

export interface PrecedentChoice {
  readonly requirementId: string;
  readonly testArtifact: string;
  readonly technicalArtifact: string;
}

/** A path cell that names nothing. The matrix uses several spellings of "no". */
function isPlaceholder(cell: string): boolean {
  const value = String(cell || "")
    .replace(/`/g, "")
    .trim();
  return value === "" || value === "-" || value === "—" || /^tbd$/i.test(value);
}

function clean(cell: string): string {
  return String(cell || "")
    .replace(/`/g, "")
    .trim();
}

/**
 * The most recent accepted requirement in `forRequirement`'s bounded context.
 *
 * "Most recent" is the highest requirement id below the current one, which is
 * the order they were written in. Returns `null` when there is nothing worth
 * showing — no verified sibling, or one with no artifacts to point at.
 */
export function choosePrecedent(
  rows: readonly PrecedentRow[],
  contexts: Readonly<Record<string, string>>,
  forRequirement: string
): PrecedentChoice | null {
  const own = contexts[forRequirement] || "";

  const candidates = rows
    .filter((row) => row.requirementId && row.requirementId !== forRequirement)
    .filter((row) => /^verified$/i.test(String(row.status || "").trim()))
    .filter((row) => (contexts[row.requirementId] || "") === own)
    // A precedent with neither a test nor an implementation to look at is not a
    // precedent; it is a row.
    .filter((row) => !isPlaceholder(row.testArtifact) || !isPlaceholder(row.technicalArtifact))
    // Ids sort lexically the way they were written: REQ-002 before REQ-010
    // requires the padding the format already guarantees.
    .filter((row) => row.requirementId < forRequirement)
    .sort((a, b) => b.requirementId.localeCompare(a.requirementId));

  const best = candidates[0];
  if (!best) return null;

  return {
    requirementId: best.requirementId,
    testArtifact: isPlaceholder(best.testArtifact) ? "" : clean(best.testArtifact),
    technicalArtifact: isPlaceholder(best.technicalArtifact) ? "" : clean(best.technicalArtifact),
  };
}

/**
 * The first `lines` lines of a file's content, marked when it was cut short.
 *
 * A precedent is an example of shape, not a file to read: a thousand-line class
 * in the prompt costs tokens the agent needs for its own work, and the part
 * that teaches the convention is the top.
 */
export function excerpt(content: string, lines = 40): string {
  const all = String(content || "").split("\n");
  if (all.length <= lines) return all.join("\n").trimEnd();
  return `${all.slice(0, lines).join("\n").trimEnd()}\n… (${all.length - lines} more lines)`;
}
