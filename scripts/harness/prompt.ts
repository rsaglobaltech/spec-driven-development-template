"use strict";

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

const fs = require("node:fs");
const path = require("node:path");

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
 * @param {object} req      One entry from `plan --format json` requirements[].
 * @param {string} projectDir  Worktree root the agent will edit.
 * @param {object} [opts]
 * @param {string} [opts.hint]            One-line guidance from `plan`.
 * @param {string} [opts.previousFailure] Gate output from the prior attempt.
 * @param {number} [opts.attempt]         1-based attempt counter.
 * @param {number} [opts.maxAttempts]
 */
function buildPrompt(req, projectDir, opts: any = {}) {
  const parts = [];

  parts.push(
    `# Implement ${req.requirement}\n\n` +
      `You are a coding agent working inside a spec-driven project. Implement ` +
      `exactly one requirement — **${req.requirement}** — following the project's ` +
      `existing conventions. Do not touch unrelated files.`
  );

  const facts = [
    `- Requirement: ${req.requirement}`,
    `- Scenario ID: ${req.scenario_id || "(none)"}`,
    `- plan category: ${req.category}`,
    `- Feature file: ${req.feature_file || "(none declared)"}`,
    `- Test artifact (write this first — TDD): ${req.test_artifact || "(none declared)"}`,
    `- Production artifact: ${req.technical_artifact || "(none declared)"}`,
    `- Current status: ${req.status || "(none)"}`,
  ].join("\n");
  parts.push(section("Requirement facts", facts));

  if (opts.hint) {
    parts.push(section("Suggested approach", opts.hint));
  }

  const featureRel = (req.feature_file || "").replace(/^`|`$/g, "").trim();
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

  parts.push(
    section(
      "Definition of done",
      "1. Write the test artifact first; it must fail for the right reason.\n" +
        "2. Write the production artifact until the test passes.\n" +
        "3. Do not edit `docs/specs/traceability.md` — the harness closes the loop.\n" +
        "4. The harness will run `validate --strict-tdd` and the project test command. " +
        "Both must pass."
    )
  );

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

module.exports = { buildPrompt };
