/**
 * Builds the structured prompt handed to a coding agent for one requirement.
 *
 * The prompt is deliberately self-contained: an agent invoked by the harness
 * gets no conversation history, so everything it needs to implement the REQ
 * must be in this text — the Gherkin scenario, the stack rules, the exact
 * paths it must produce, and (on a retry) why the last attempt failed.
 *
 * Pure module: string in, string out. No filesystem, no logging.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { STAGES } from "../change/instructions";

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

/**
 * Read a requirement field under its contract name, falling back to the
 * matrix's own snake_case column name.
 *
 * `run.ts` feeds this builder by shelling out to `plan --format json` and
 * parsing the result, so the wire format is the contract — and the contract is
 * camelCase (ADR-0017 §4). It was snake_case until the rename, and reading
 * only the new names would silently blank every fact for anyone piping an
 * older `plan` output in. Accepting both costs one function and removes a
 * whole class of "(none declared)" prompts.
 */
function field(req, camel, snake) {
  const value = req[camel] !== undefined ? req[camel] : req[snake];
  return value === null ? "" : value;
}

/** What the harness knows about an attempt when it builds the prompt. */
export interface PromptOptions {
  /** Project-wide directives prepended verbatim, from harness.config.yaml. */
  promptPrefix?: string;
  /** One-line guidance from `plan`. */
  hint?: string;
  /** Gate output from the prior attempt, so a retry is not a repeat. */
  previousFailure?: string;
  attempt?: number;
  maxAttempts?: number;
}

/**
 * @param {object} req      One entry from `plan --format json` requirements[].
 * @param {string} projectDir  Worktree root the agent will edit.
 * @param {object} [opts]
 * @param {string} [opts.promptPrefix]    Project-wide directives prepended verbatim
 *                                        (Role, Active Project Boundary, Execution
 *                                        Policy). Lives in harness.config.yaml.
 * @param {string} [opts.hint]            One-line guidance from `plan`.
 * @param {string} [opts.previousFailure] Gate output from the prior attempt.
 * @param {number} [opts.attempt]         1-based attempt counter.
 * @param {number} [opts.maxAttempts]
 */
export function buildPrompt(
  req: Record<string, unknown>,
  projectDir: string,
  opts: PromptOptions = {}
) {
  const parts = [];

  if (opts.promptPrefix && String(opts.promptPrefix).trim()) {
    parts.push(String(opts.promptPrefix).trimEnd());
    parts.push("---");
  }

  parts.push(
    `# Implement ${req.requirement}\n\n` +
      `You are a coding agent working inside a spec-driven project. Implement ` +
      `exactly one requirement — **${req.requirement}** — following the project's ` +
      `existing conventions. Do not touch unrelated files.`
  );

  const facts = [
    `- Requirement: ${req.requirement}`,
    `- Scenario ID: ${field(req, "scenarioId", "scenario_id") || "(none)"}`,
    `- plan category: ${req.category}`,
    `- Feature file: ${field(req, "featureFile", "feature_file") || "(none declared)"}`,
    `- Test artifact (write this first — TDD): ${field(req, "testArtifact", "test_artifact") || "(none declared)"}`,
    `- Production artifact: ${field(req, "technicalArtifact", "technical_artifact") || "(none declared)"}`,
    `- Current status: ${req.status || "(none)"}`,
  ].join("\n");
  parts.push(section("Requirement facts", facts));

  if (opts.hint) {
    parts.push(section("Suggested approach", opts.hint));
  }

  const featureRel = String(field(req, "featureFile", "feature_file") || "")
    .replace(/^`|`$/g, "")
    .trim();
  if (featureRel) {
    const featureContent = readIfExists(path.join(projectDir, featureRel.split("#")[0]));
    if (featureContent) {
      parts.push(
        section(
          `Gherkin scenario (${featureRel})`,
          "```gherkin\n" + featureContent.trimEnd() + "\n```"
        )
      );
    } else {
      parts.push(
        section(
          "Gherkin scenario",
          `The feature file \`${featureRel}\` does not exist yet. Create it from the ` +
            `requirement before writing code.`
        )
      );
    }
  }

  const aiRules = readIfExists(path.join(projectDir, "AI_RULES.md"));
  if (aiRules) {
    parts.push(section("Project rules (AI_RULES.md — non-negotiable)", aiRules.trimEnd()));
  }

  // The implementation rules come from the same place the slash commands and
  // the MCP server read them — `change instructions apply`. Restating them here
  // is how the two copies drift apart when the delta grammar moves.
  const doneRules = [
    ...STAGES.apply.rules,
    "**Do not modify** `spec.md`, `AI_RULES.md`, or any `features/**/*.feature` — they are the project's source of truth.",
    "The harness will run `validate --strict-tdd` and the project test command. Both must pass.",
  ];
  parts.push(section("Definition of done", doneRules.map((r, i) => `${i + 1}. ${r}`).join("\n")));

  if (opts.previousFailure) {
    parts.push(
      section(
        `Previous attempt failed (attempt ${(opts.attempt || 2) - 1}` +
          `${opts.maxAttempts ? ` of ${opts.maxAttempts}` : ""})`,
        "The gate rejected the last attempt. Fix the specific failure below — do not " +
          "start over.\n\n```\n" +
          String(opts.previousFailure).trim().slice(-4000) +
          "\n```"
      )
    );
  }

  return parts.join("\n");
}
