/**
 * The disk half of deriving a change from a pack bump.
 *
 * Loading `pack.yaml`, lifting a scenario's steps out of its Gherkin template,
 * and writing the change folder. What counts as a change at all is domain —
 * see `domain/PackDelta`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseYamlLite } from "../domain/YamlLite";
import { LoadedPack, changeIdFor, renderProposal, renderTasks } from "../domain/PackDelta";
import { Phrases } from "../domain/Language";

export function loadPackModel(packRoot: string, packId: string): LoadedPack {
  const packFile = path.join(path.resolve(packRoot), packId, "pack.yaml");
  if (!fs.existsSync(packFile)) {
    throw new Error(`Pack file not found: ${packFile}`);
  }
  return {
    model: parseYamlLite(fs.readFileSync(packFile, "utf8")),
    packDir: path.dirname(packFile),
  };
}

const GHERKIN_KEYWORD = /^\s*(Given|When|Then|And|But)\s+(.*)$/i;

/**
 * Pull the real steps for a scenario out of the pack's own `.feature` template.
 *
 * Falls back to a single TODO step rather than inventing behaviour: a delta
 * that says "TODO" is reviewable; one that says something plausible but made
 * up is not.
 */
export function stepsForScenario(packDir, scenario) {
  const templateRel = scenario && scenario.template;
  if (!templateRel) return null;
  const templateFile = path.resolve(packDir, templateRel);
  if (!templateFile.startsWith(path.resolve(packDir))) return null;
  if (!fs.existsSync(templateFile)) return null;

  const wanted = String(scenario.scenario || "").trim();
  const lines = fs.readFileSync(templateFile, "utf8").split(/\r?\n/);
  const steps = [];
  let inside = false;

  for (const line of lines) {
    const scenarioHeading = /^\s*(?:Scenario|Scenario Outline|Escenario):\s*(.*)$/.exec(line);
    if (scenarioHeading) {
      if (inside) break;
      const name = scenarioHeading[1].trim();
      inside = wanted === "" || name === wanted;
      continue;
    }
    if (!inside) continue;
    const step = GHERKIN_KEYWORD.exec(line);
    if (step) steps.push(`${step[1].toUpperCase()} ${step[2].trim()}`);
  }

  return steps.length > 0 ? steps : null;
}

// ── Rendering the delta ───────────────────────────────────────────────────────

/**
 * Materialise the derived delta as a change folder. Returns the list of files
 * written (or that would be written, when `dryRun`).
 */
export function materialiseChange(projectDir, entry, targetVersion, derived, t: Phrases, opts?) {
  const o = opts || {};
  const changeId = o.changeId || changeIdFor(entry.pack_id, entry.version, targetVersion);
  const changeDir = path.join(projectDir, "docs", "specs", "changes", changeId);

  const files = [
    {
      file: path.join(changeDir, "proposal.md"),
      contents: renderProposal(entry, targetVersion, derived.summary, t),
    },
    { file: path.join(changeDir, "tasks.md"), contents: renderTasks(entry, targetVersion) },
    {
      file: path.join(changeDir, "change.yaml"),
      contents:
        `csda_change_version: 1\n` +
        `schema: spec-driven\n` +
        `created: ${new Date().toISOString().slice(0, 10)}\n` +
        `rigor: lite\n` +
        `skip_specs: false\n` +
        `retire_capabilities: false\n` +
        `origin: pack:${entry.repo}#${entry.pack_id}@${targetVersion}\n`,
    },
    {
      file: path.join(changeDir, "specs", derived.capability, "spec.md"),
      contents: derived.markdown,
    },
  ];

  if (!o.dryRun) {
    for (const f of files) {
      fs.mkdirSync(path.dirname(f.file), { recursive: true });
      fs.writeFileSync(f.file, f.contents, "utf8");
    }
  }

  return {
    changeId,
    changeDir,
    files: files.map((f) => path.relative(projectDir, f.file).split(path.sep).join("/")),
  };
}
