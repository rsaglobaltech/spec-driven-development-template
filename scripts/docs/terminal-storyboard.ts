/**
 * What the landing page's terminal shows, declared as data.
 *
 * Read by two things that must not disagree: `record-terminal.ts`, which runs
 * these commands for real and writes the recording, and `docs-terminal.test.ts`,
 * which checks the recording is still of this storyboard and of this CLI.
 *
 * ## Why these nine
 *
 * `scripts/demo/demo.tape` tells the same story in ten beats for a video. A
 * landing page is not a video: it is read beside prose, by someone deciding
 * whether to spend an afternoon on this. So the beats that survive are the ones
 * that answer a question an evaluator actually has —
 *
 *   - how much do I have to write?          `cat smart-parking.yaml`
 *   - what do I get?                        `init`, `specops add`
 *   - what does it think is left to do?     `plan`
 *   - does it lock me to one AI vendor?     `cat harness.config.yaml`
 *   - what happens when I let it run?       `harness run`
 *   - did it touch my specs?                `git diff --stat`
 *   - is the code real?                     `node --test`
 *   - and is the chain still intact?        `validate`
 *
 * — and the beats that only look good in motion are gone.
 *
 * Every one of these was run against the real CLI before being written down.
 * The last beat is `validate` because the page's "The loop" section promises
 * exactly that, and ending there closes the loop the reader just read about.
 */

/** One command in the recording. */
export interface Beat {
  /** Stable id. The recording and this list are compared by it. */
  readonly id: string;
  /** The sentence shown beside the step. Human, not a restatement of the command. */
  readonly caption: string;
  /** Relative to the scratch home: `""` is `~`, `smart-parking` is `~/smart-parking`. */
  readonly cwd: string;
  /** argv, run without a shell. Mutually exclusive with `shell`. */
  readonly argv?: readonly string[];
  /** A command that genuinely needs a shell — a pipe, a `&&`. Run via `bash -c`. */
  readonly shell?: string;
  /**
   * The `csda` surface this beat exercises, spelled as `scripts/lib/surface.ts`
   * spells it, or `null` for a command that is not ours. This is what lets the
   * test check the recording against the CLI without running anything.
   */
  readonly surface: string | null;
  /** Lines kept. Beyond this the player shows "… N more lines". */
  readonly maxLines: number;
}

export const BEATS: readonly Beat[] = [
  {
    id: "config",
    caption: "Everything you have to write by hand. Seven lines.",
    cwd: "",
    argv: ["cat", "smart-parking.yaml"],
    surface: null,
    maxLines: 10,
  },
  {
    id: "init",
    caption: "Requirements, Gherkin, a traceability matrix and the rules for agents.",
    cwd: "",
    argv: ["csda", "init", "--config", "./smart-parking.yaml", "--out", ".", "--no-git"],
    surface: "init",
    maxLines: 14,
  },
  {
    id: "specops-add",
    caption: "A domain pack, installed and pinned. Not copy-pasted.",
    cwd: "smart-parking",
    argv: [
      "csda",
      "specops",
      "add",
      "--pack-root",
      "{HOME}/packs",
      "--pack",
      "multi-tenant/backend",
      "--var",
      "PROJECT_NAME=Smart Parking",
      "--var",
      "PROJECT_SLUG=smart-parking",
      "--var",
      "DOMAIN=parking operations",
    ],
    surface: "specops add",
    maxLines: 8,
  },
  {
    id: "plan",
    caption: "The queue, derived from the matrix. Nobody maintains this by hand.",
    cwd: "smart-parking",
    argv: ["csda", "plan"],
    surface: "plan",
    maxLines: 15,
  },
  {
    id: "harness-config",
    caption: "Any CLI that takes a prompt. The tool never talks to a model itself.",
    cwd: "smart-parking",
    argv: ["cat", "harness.config.yaml"],
    surface: null,
    maxLines: 6,
  },
  {
    id: "harness-run",
    caption: "One requirement, one worktree, one agent — and a gate that can say no.",
    cwd: "smart-parking",
    argv: ["csda", "harness", "run", "--req", "REQ-000"],
    surface: "harness run",
    maxLines: 14,
  },
  {
    id: "diff",
    caption: "What the agent touched. The feature files are not on this list.",
    cwd: "smart-parking",
    argv: ["git", "diff", "--stat", "main", "harness/REQ-000"],
    surface: null,
    maxLines: 8,
  },
  {
    id: "tests",
    caption: "Its own test, on its own branch. Nothing was merged for you.",
    cwd: "smart-parking",
    shell: "git switch -q harness/REQ-000 && node --test test/*.test.js",
    surface: null,
    maxLines: 12,
  },
  {
    id: "validate",
    caption: "And the chain still holds. This is the command CI runs.",
    cwd: "smart-parking",
    argv: ["csda", "validate", "."],
    surface: "validate",
    maxLines: 8,
  },
];
