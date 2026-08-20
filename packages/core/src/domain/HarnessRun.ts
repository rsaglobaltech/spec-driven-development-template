/**
 * The decisions `csda harness run` makes before it spawns anything.
 *
 * Substituting a command template, reading a hint out of a gate's output, and
 * working out which requirements can run at the same time are all judgements
 * over data. Spawning the agent, running the gate, cutting branches and
 * writing the ledger are not, and stay in the command.
 *
 * Keeping them apart is what makes the scheduler testable: a dependency cycle
 * or a mis-substituted `{feature_file}` is a bug you want to find without a
 * git repository and an agent.
 */

import { RequirementGraph } from "./RequirementGraph";

/**
 * Substitute the {prompt_file} placeholder in an agent command template.
 * Throws when the template is missing the placeholder — without it the agent
 * would never receive the prompt.
 */
export function substituteAgentCommand(template, promptFile) {
  if (!template.includes("{prompt_file}")) {
    throw new Error(
      "The agent command must contain the {prompt_file} placeholder, e.g. " +
        '--agent "claude -p < {prompt_file}"'
    );
  }
  return template.split("{prompt_file}").join(promptFile);
}

/** Run the gate (validate --strict-tdd, then the optional test command). */
/**
 * Fill the placeholders a gate command may use.
 *
 * Without this, `test_cmd` was a fixed string, so a project could not run the
 * scenario belonging to the requirement under test — and the gate runs *before*
 * `done`, so the requirement is still Draft and `validate --strict-tdd` does not
 * demand its test either. The loop could therefore mark a requirement
 * Implemented without ever executing its scenario, which is the one thing this
 * whole tool exists to prevent.
 *
 * `{feature_file}` is the useful one in practice: most runners accept a path and
 * will run exactly that feature's scenarios.
 */
export function substituteGateCommand(template, req) {
  const featureFile = String(req.featureFile || req.feature_file || "")
    .replace(/^`|`$/g, "")
    .split("#")[0]
    .trim();
  return template
    .split("{req}")
    .join(req.requirement || "")
    .split("{scenario}")
    .join(req.scenarioId || req.scenario_id || "")
    .split("{feature_file}")
    .join(featureFile);
}

/** What one attempt cost, and the step it stopped at. */
export interface AttemptRecord {
  attempt: number;
  endedAt: "pass" | "agent-timeout" | "agent-error" | "gate" | "done" | "commit";
  /** Wall-clock inside the agent command alone. */
  agentMs: number;
  /** Wall-clock for the whole attempt: prompt, agent, gate, done, commit. */
  totalMs: number;
}

/**
 * Warn when a gate that asked to be filtered plainly was not.
 *
 * REQ-002 cost two agent runs to explain: the requirement's scenario passed, the
 * gate ran the whole suite anyway — a `paths` key in the base branch's cucumber
 * config silently overrode the CLI argument — and the failure was
 * indistinguishable from the agent having written broken code.
 *
 * The harness cannot know how many tests *should* run. What it can notice is a
 * command that substituted one feature file against output that talks about
 * many, which is the shape of that mistake. A hint, not a verdict: a legitimate
 * failure must not be second-guessed into passing.
 */
export function filterHint(template, req, output) {
  if (!String(template).includes("{feature_file}")) return "";
  const featureFile = substituteGateCommand("{feature_file}", req);
  if (!featureFile) return "";

  // "16 scenarios", "42 tests", "7 examples" — the common shapes.
  const counted = /(\d+)\s+(scenarios|tests|examples|specs)\b/i.exec(output);
  if (!counted || Number(counted[1]) <= 1) return "";

  return (
    `The gate asked for one feature (${featureFile}) and the run reported ` +
    `${counted[1]} ${counted[2].toLowerCase()}. The filter may not be applying — ` +
    "a runner config that pins its own paths can override the argument. Check " +
    "that config on the base branch, not only on main."
  );
}

/**
 * Split the pending queue into levels, and say what each requirement waits for.
 *
 * `plan` already ordered the queue and told us what every requirement builds
 * on (E1-01). What the harness needs on top of that is the *grouping*: a level
 * is a set of requirements that do not depend on one another, so they are the
 * ones that could run at the same time.
 *
 * Dependencies on requirements that are already DONE do not appear here —
 * `plan` reports them under `dependsOn` but not `blockedBy`, because a
 * finished dependency constrains nothing.
 */
export function scheduleLevels(pending) {
  const pendingIds = pending.map((r) => r.requirement);
  const inQueue = new Set(pendingIds);

  const dependsOn = {};
  for (const req of pending) {
    // Only dependencies that are themselves in this run constrain the order.
    // A dependency outside the queue is either done or was filtered out by
    // `--req`, and in both cases waiting for it here would deadlock the level.
    dependsOn[req.requirement] = (req.dependsOn || req.depends_on || []).filter((d) =>
      inQueue.has(d)
    );
  }

  const graph = RequirementGraph.fromDependencies(pendingIds, dependsOn);
  return { levels: graph.levels, cycles: graph.cycles, dependsOn, graph };
}
