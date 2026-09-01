/**
 * The adversarial verification step (D3).
 *
 * ## What it is, and what the advisory reviewer is not
 *
 * The harness already has a reviewer: an advisory agent that reads the work and
 * returns prose, which feeds the next prompt. It is useful and it is *opinion*.
 *
 * An adversary does something a reviewer cannot: it writes a **test**, and the
 * test either fails or it does not. Where a reviewer says "this looks like it
 * mishandles an empty list", an adversary writes the empty-list case and runs
 * it. One is an argument, the other is evidence.
 *
 * ## The line this must not cross
 *
 * **The gate stays the only judge.** A green run stays green even when the
 * probe fails, and that is deliberate rather than timid: an adversary can
 * always write a test the requirement never promised to satisfy — asserting a
 * behaviour nobody specified — and a failing probe would then block work that
 * is correct. Letting it decide would turn the loop into a committee, which is
 * the same reason the reviewer is advisory.
 *
 * What a failing probe *is*: a recorded finding, on the run and in the report,
 * with the test it wrote. A human decides whether it found a defect or invented
 * a requirement.
 *
 * ## Why the probe is discarded
 *
 * The branch must contain the implementer's work and nothing else, or a reviewer
 * cannot tell who wrote what. The probe is preserved in the finding, so nothing
 * is lost — it just does not arrive as a commit somebody has to untangle.
 */

export interface ProbeOutcome {
  /** Did the adversary run at all? False when unconfigured or it failed to start. */
  readonly ran: boolean;
  /** Did the project's tests fail once the probe was in place? */
  readonly broke: boolean;
  /** What the adversary said, and what the test command printed. */
  readonly detail: string;
  /** Paths the adversary wrote, so the finding can name them. */
  readonly wrote: readonly string[];
}

export const NO_PROBE: ProbeOutcome = Object.freeze({
  ran: false,
  broke: false,
  detail: "",
  wrote: Object.freeze([]) as readonly string[],
});

/**
 * Should the adversary run for this attempt?
 *
 * Only on a green gate, and only once per requirement: probing an
 * implementation that already failed tells you nothing you did not know, and
 * probing every retry multiplies the cost of the one thing in the loop that is
 * pure insurance.
 */
export function shouldProbe(opts: {
  readonly profile?: string | null;
  readonly gatePassed: boolean;
  readonly alreadyProbed: boolean;
}): boolean {
  return Boolean(opts.profile) && opts.gatePassed && !opts.alreadyProbed;
}

/**
 * The finding a failing probe produces, as a diagnostic.
 *
 * Severity is a warning and never an error. The wording matters: it has to say
 * what happened without implying the requirement is wrong, because the probe
 * may have asserted something nobody promised.
 */
export function probeFinding(requirement: string, outcome: ProbeOutcome) {
  return {
    severity: "warning" as const,
    code: "adversarial_probe_failed",
    message:
      `The gate passed for ${requirement}, and an adversarial probe then made ` +
      `the project's tests fail. That is either a defect the scenario does not ` +
      `cover, or a test asserting something ${requirement} never promised.`,
    target: outcome.wrote.join(", ") || requirement,
    fix:
      `Read the probe in the run record. If it found a real gap, add a ` +
      `scenario for it; if it invented a requirement, ignore it — the gate is ` +
      `still the judge.`,
  };
}
