"use strict";

/**
 * Delta-spec rules: what makes a delta well-formed, and what it means to apply
 * one to a capability spec.
 *
 * Split from `parser.ts` on purpose — the parser is a pure reader with no
 * opinions, this file holds every opinion. `archive` and `validate` share it,
 * so a delta that validates is by construction a delta that can be applied.
 */

const { parseSpec, parseDelta, requirementKey, renderSpec, REQ_ID } = require("./parser");
const { error, warning } = require("../lib/diagnostics");

const VALID_SECTIONS = [
  "## Purpose",
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
];

const RFC2119 = /\b(SHALL|MUST|SHOULD|MAY|DEBE|DEBERÁ|DEBERA)\b/;
const GHERKIN_STEP = /^\s*(GIVEN|WHEN|THEN|AND|BUT|DADO|CUANDO|ENTONCES|Y)\b/i;

/**
 * Validate one delta against the capability spec it targets.
 *
 * @param deltaSource raw markdown of the delta
 * @param opts.specSource raw markdown of the current capability spec, when it
 *        exists. Omitted for a brand-new capability — cross-reference checks
 *        are then skipped rather than reported as failures.
 * @param opts.file relative path used in diagnostics
 * @param opts.strict enable the advisory quality checks as errors
 */
function validateDelta(deltaSource, opts?) {
  const o = opts || {};
  const file = o.file || "spec.md";
  const diags = [];
  const delta = parseDelta(deltaSource);

  for (const unknown of delta.unknownSections) {
    diags.push(
      error("delta_unknown_section", `Unknown delta section: "## ${unknown.heading}".`, {
        file,
        line: unknown.line,
        target: unknown.heading,
        fix: `Use one of: ${VALID_SECTIONS.join(", ")}.`,
      })
    );
  }

  const all = [...delta.added, ...delta.modified, ...delta.removed];

  if (all.length === 0 && !delta.purpose) {
    diags.push(
      error("delta_empty", "Delta declares no requirement changes and no Purpose.", {
        file,
        fix: "Add a `## ADDED Requirements` section, or delete the delta file.",
      })
    );
  }

  // Identity: unique within the delta, well-formed when an id is present.
  const seen = new Map();
  for (const req of all) {
    const key = requirementKey(req);
    if (seen.has(key)) {
      diags.push(
        error(
          "duplicate_requirement",
          `Requirement "${req.heading}" appears more than once in this delta.`,
          {
            file,
            line: req.line,
            target: key,
            fix: `Merge the two blocks; the first one is at line ${seen.get(key)}.`,
          }
        )
      );
    } else {
      seen.set(key, req.line);
    }

    if (req.id && !REQ_ID.test(req.id)) {
      diags.push(
        error("invalid_requirement_id", `"${req.id}" is not a valid requirement id.`, {
          file,
          line: req.line,
          target: req.id,
          fix: "Use the form REQ-NNN, e.g. REQ-014 — or drop the id entirely.",
        })
      );
    }
  }

  // Scenarios: ADDED and MODIFIED must be verifiable. REMOVED needs no body.
  for (const req of [...delta.added, ...delta.modified]) {
    if (!req.scenarios || req.scenarios.length === 0) {
      diags.push(
        error(
          "requirement_without_scenario",
          `Requirement "${req.name}" has no scenario, so "done" is undefined.`,
          {
            file,
            line: req.line,
            target: requirementKey(req),
            fix: "Add a `#### Scenario:` block with GIVEN / WHEN / THEN steps.",
          }
        )
      );
    }
    for (const sc of req.scenarios || []) {
      if (!sc.steps || sc.steps.length === 0) {
        diags.push(
          error("scenario_without_steps", `Scenario "${sc.name}" has no steps.`, {
            file,
            line: sc.line,
            target: sc.name,
            fix: "Add `- GIVEN …`, `- WHEN …`, `- THEN …` bullets under the scenario.",
          })
        );
      } else if (!sc.steps.some((s) => GHERKIN_STEP.test(s))) {
        diags.push(
          warning(
            "scenario_not_gherkin",
            `Scenario "${sc.name}" has no GIVEN/WHEN/THEN step, so it cannot generate a .feature.`,
            {
              file,
              line: sc.line,
              target: sc.name,
              fix: "Start each step with GIVEN, WHEN, THEN or AND.",
            }
          )
        );
      }
    }
    if (req.text && !RFC2119.test(req.text)) {
      diags.push(
        warning(
          "no_rfc2119_keyword",
          `Requirement "${req.name}" states no obligation (SHALL / MUST / SHOULD / MAY).`,
          {
            file,
            line: req.line,
            target: requirementKey(req),
            fix: 'Rewrite the body as "The system SHALL …".',
          }
        )
      );
    }
  }

  // Cross-reference against the current spec, when there is one.
  if (o.specSource !== undefined && o.specSource !== null) {
    const spec = parseSpec(o.specSource);
    const existing = new Set(spec.requirements.map((r) => requirementKey(r)));

    for (const req of delta.added) {
      if (existing.has(requirementKey(req))) {
        diags.push(
          error(
            "requirement_already_exists",
            `ADDED requirement "${req.heading}" already exists in the capability spec.`,
            {
              file,
              line: req.line,
              target: requirementKey(req),
              fix: "Move the block to `## MODIFIED Requirements`.",
            }
          )
        );
      }
    }
    for (const req of [...delta.modified, ...delta.removed]) {
      if (!existing.has(requirementKey(req))) {
        diags.push(
          error(
            "unknown_requirement",
            `${req.op.toUpperCase()} requirement "${req.heading}" does not exist in the capability spec.`,
            {
              file,
              line: req.line,
              target: requirementKey(req),
              fix:
                req.op === "modified"
                  ? "Move the block to `## ADDED Requirements`, or fix the heading to match the spec."
                  : "Remove the block — there is nothing to delete.",
            }
          )
        );
      }
    }
  }

  return { delta, diagnostics: diags };
}

/**
 * Apply a delta to a capability spec.
 *
 * Pure: takes and returns strings, touches no filesystem. That is what lets
 * `archive` run the whole merge in memory, show a diff, and only then write.
 *
 * @returns { markdown, spec, applied, retired }
 *   `retired` is true when the last requirement was removed, which is the
 *   signal for the caller to delete the spec file (only ever when the change
 *   declares `retire_capabilities: true`).
 */
function applyDelta(specSource, deltaSource, opts?) {
  const o = opts || {};
  const delta = parseDelta(deltaSource);
  const spec = specSource
    ? parseSpec(specSource)
    : { title: o.title || "Specification", purpose: "", requirements: [], sections: [] };

  // A brand-new capability takes its Purpose from the delta; an existing one
  // keeps its own, because a delta is about requirements, not prose.
  if (!specSource && delta.purpose) spec.purpose = delta.purpose;
  if (!spec.title) spec.title = delta.title || o.title || "Specification";

  const applied = { added: [], modified: [], removed: [] };
  const byKey = new Map(spec.requirements.map((r) => [requirementKey(r), r]));

  for (const req of delta.removed) {
    const key = requirementKey(req);
    if (byKey.has(key)) {
      byKey.delete(key);
      applied.removed.push(key);
    }
  }
  for (const req of delta.modified) {
    const key = requirementKey(req);
    if (byKey.has(key)) {
      // A modified requirement replaces the old block wholesale — merging two
      // scenario lists would silently keep scenarios the author deleted.
      byKey.set(key, stripOp(req));
      applied.modified.push(key);
    }
  }
  for (const req of delta.added) {
    const key = requirementKey(req);
    if (!byKey.has(key)) {
      byKey.set(key, stripOp(req));
      applied.added.push(key);
    }
  }

  // Preserve original order for surviving requirements, append new ones.
  const order = spec.requirements.map((r) => requirementKey(r)).filter((k) => byKey.has(k));
  for (const key of byKey.keys()) {
    if (!order.includes(key)) order.push(key);
  }
  spec.requirements = order.map((k) => byKey.get(k));

  return {
    markdown: renderSpec(spec),
    spec,
    applied,
    retired: spec.requirements.length === 0 && applied.removed.length > 0,
  };
}

function stripOp(req) {
  const { op: _op, ...rest } = req;
  return rest;
}

module.exports = { validateDelta, applyDelta, VALID_SECTIONS, RFC2119, GHERKIN_STEP };
