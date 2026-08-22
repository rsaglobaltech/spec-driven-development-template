/**
 * What a `spec-author` agent is allowed to touch.
 *
 * The role writes the proposal and the delta of a change. It is the one role in
 * the harness that produces *specification* rather than code, and that is
 * exactly why it needs a boundary: an agent asked to describe a change, and
 * able to edit the capability spec it is describing, can quietly make the
 * change unnecessary instead of proposing it.
 *
 * So the rule is narrow and stated once, here: everything under the change's
 * own directory, and nothing else. Not `spec.md`, not the capability specs, not
 * `traceability.md`, not code. `change archive` is what moves a delta into the
 * capability spec, after a human has read it.
 *
 * Pure: paths in, verdict out. Enforcing it — reverting what strayed outside —
 * belongs to the command, which is where a filesystem lives.
 */

/** Repository-relative, POSIX-separated. `docs/specs/changes/<id>/…` */
export function changeScope(changeId: string): string {
  return `docs/specs/changes/${changeId}/`;
}

/** Is this path inside the change the author was asked to write? */
export function isInScope(relativePath: string, changeId: string): boolean {
  const normalised = relativePath.split("\\").join("/").replace(/^\.\//, "");
  // A path that climbs out cannot be judged by prefix alone: `docs/specs/
  // changes/x/../../../etc` starts with the scope and is not inside it.
  if (normalised.split("/").includes("..")) return false;
  return normalised.startsWith(changeScope(changeId));
}

export interface ScopeVerdict {
  /** Paths the author was entitled to write. */
  allowed: string[];
  /** Paths it wrote that it had no business writing. */
  strayed: string[];
}

/**
 * Split what changed into what was permitted and what was not.
 *
 * @param changed repository-relative paths the agent touched
 */
export function judgeScope(changed: readonly string[], changeId: string): ScopeVerdict {
  const allowed: string[] = [];
  const strayed: string[] = [];
  for (const p of changed) (isInScope(p, changeId) ? allowed : strayed).push(p);
  return { allowed, strayed };
}
