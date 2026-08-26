/**
 * Did the agent write anything at all? (H19)
 *
 * ## The defect this closes
 *
 * The harness gate runs *before* `csda done`, so at gate time the requirement
 * is still `Draft` — and `--strict-tdd`'s "no `Test Artifact = TBD` past
 * Draft" rule does not apply to a Draft row. `done` then flips the status to
 * `Implemented` and nothing validates again.
 *
 * Reproduced on 2026-08-26 against a freshly generated project, with
 * `--agent "cat {prompt_file} > /dev/null"` — an agent that writes nothing:
 *
 *     ✅ REQ-000  pass (1 attempt)  → harness/REQ-000
 *
 * The branch carried the archived prompt and one changed line: the matrix row
 * moved to `Implemented`, its Test artifact still `TBD`. No code, no test.
 * It is H1's root cause exactly — the gate approving what it did not check.
 *
 * ## Why a hard failure and not another opt-in flag
 *
 * `--strict-artifacts` cannot catch this: it compares the diff against the
 * paths the row declares, and a row declaring none has nothing to compare.
 *
 * So the harness asks the one question that needs no declaration and has no
 * legitimate negative answer: did anything change? An agent that produced no
 * files cannot have implemented a requirement, whatever the gate concludes
 * about the documents around it. Under the rule ADR-0023 sets out — a content
 * check is a gate only when failing it is always a defect — this one qualifies,
 * which is why it is not behind a flag.
 *
 * ## Why the prompt archive does not count
 *
 * The harness writes the archive itself. Counting it would mean the harness's
 * own bookkeeping vouches for the agent, which is the same circularity as a
 * gate that grades the file it told the agent to write.
 */

/** Where the harness archives the prompt it handed the agent. */
export const PROMPT_ARCHIVE_DIR = ".specops/harness-prompts";

/**
 * Everything the agent actually wrote, with the harness's own bookkeeping
 * removed. Paths are worktree-relative, as `git status --porcelain` reports
 * them.
 */
export function agentAuthoredPaths(touched: readonly string[]): string[] {
  return (touched || []).filter(
    (p) => p !== PROMPT_ARCHIVE_DIR && !p.startsWith(`${PROMPT_ARCHIVE_DIR}/`)
  );
}

/**
 * True when the attempt left nothing behind — there is nothing to gate, and a
 * green gate over it would mean nothing.
 */
export function isEmptyAttempt(touched: readonly string[]): boolean {
  return agentAuthoredPaths(touched).length === 0;
}
