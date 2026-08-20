import { parseSpec, parseDelta, requirementKey, renderSpec, REQ_ID, blockText } from "./SpecParser";
import { error, warning } from "./Diagnostic";

export const VALID_SECTIONS = [
  "## Purpose",
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
];

export const RFC2119 = /\b(SHALL|MUST|SHOULD|MAY|DEBE|DEBERÁ|DEBERA)\b/;
export const GHERKIN_STEP = /^\s*(GIVEN|WHEN|THEN|AND|BUT|DADO|CUANDO|ENTONCES|Y)\b/i;

export class DeltaSpec {
  public static validate(deltaSource: string, opts?: any) {
    const o = opts || {};
    const file = o.file || "spec.md";
    const diags: any[] = [];
    const delta: any = parseDelta(deltaSource);

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
        } else if (!sc.steps.some((s: string) => GHERKIN_STEP.test(s))) {
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
      const requirementText = blockText(req.text);
      if (requirementText && !RFC2119.test(requirementText)) {
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

    if (o.specSource !== undefined && o.specSource !== null) {
      const spec: any = parseSpec(o.specSource);
      const existing = new Set(spec.requirements.map((r: any) => requirementKey(r)));

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

  public static apply(specSource: string | null, deltaSource: string, opts?: any) {
    const o = opts || {};
    const delta: any = parseDelta(deltaSource);
    const spec: any = specSource
      ? parseSpec(specSource)
      : { title: o.title || "Specification", purpose: "", requirements: [], sections: [] };

    if (!specSource && delta.purpose) spec.purpose = delta.purpose;
    if (!spec.title) spec.title = delta.title || o.title || "Specification";

    const applied = { added: [] as string[], modified: [] as string[], removed: [] as string[] };
    const byKey = new Map(spec.requirements.map((r: any) => [requirementKey(r), r]));

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
        byKey.set(key, this.stripOp(req));
        applied.modified.push(key);
      }
    }
    for (const req of delta.added) {
      const key = requirementKey(req);
      if (!byKey.has(key)) {
        byKey.set(key, this.stripOp(req));
        applied.added.push(key);
      }
    }

    const order = spec.requirements
      .map((r: any) => requirementKey(r))
      .filter((k: string) => byKey.has(k));
    for (const key of byKey.keys()) {
      if (!order.includes(key)) order.push(key);
    }
    spec.requirements = order.map((k: string) => byKey.get(k));

    return {
      markdown: renderSpec(spec),
      spec,
      applied,
      retired: spec.requirements.length === 0 && applied.removed.length > 0,
    };
  }

  private static stripOp(req: any) {
    const { op: _op, ...rest } = req;
    return rest;
  }
}
