"use strict";

/**
 * `specops diff --as-change` — a pack version bump, expressed as intent.
 *
 * The plain `specops diff` answers "which files would change?". That is the
 * wrong question at review time: `~ docs/specs/traceability.md` tells a
 * reviewer nothing about what the domain now requires. This module answers
 * "which requirements would change?" and writes the answer as a proposed
 * change folder, so a pack upgrade is reviewed the same way any other change
 * is — proposal plus delta specs.
 *
 * **Derivation is from the requirements AST, never from a textual file diff.**
 * A pack that only reformats a template, bumps its own version string or
 * rewords a comment produces zero deltas. That is the whole point: if the
 * output were derived from rendered files, every cosmetic change upstream
 * would manufacture noise and the feature would be worse than the file diff
 * it replaces.
 */

const fs = require("node:fs");
const path = require("node:path");

const { parseYamlLite, asArray } = require("../domain-pack/common");

// ── Reading the pack model ────────────────────────────────────────────────────

function loadPackModel(packRoot, packId) {
  const packFile = path.join(path.resolve(packRoot), packId, "pack.yaml");
  if (!fs.existsSync(packFile)) {
    throw new Error(`Pack file not found: ${packFile}`);
  }
  return {
    model: parseYamlLite(fs.readFileSync(packFile, "utf8")),
    packDir: path.dirname(packFile),
  };
}

function requirementsById(model) {
  const out = new Map();
  for (const req of asArray(model && model.requirements)) {
    if (req && req.id) out.set(String(req.id), req);
  }
  return out;
}

function scenariosByRequirement(model) {
  const out = new Map();
  for (const sc of asArray(model && model.scenarios)) {
    if (!sc || !sc.requirement_id) continue;
    const key = String(sc.requirement_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(sc);
  }
  return out;
}

/**
 * The fields that make a requirement what it is. Anything outside this set —
 * ordering, comments, template paths, the pack's own version — is not a
 * behavioural change and must not produce a delta.
 */
function requirementFingerprint(req, scenarios) {
  const norm = (v) => String(v === undefined || v === null ? "" : v).trim();
  const scenarioPart = (scenarios || [])
    .map((sc) =>
      [
        norm(sc.id),
        norm(sc.scenario),
        norm(sc.use_case),
        norm(sc.command),
        norm(sc.aggregate),
        asArray(sc.events).map(norm).sort().join(","),
      ].join("|")
    )
    .sort()
    .join("\n");
  return [
    norm(req.title),
    norm(req.description),
    norm(req.priority),
    norm(req.status),
    scenarioPart,
  ].join("\n");
}

// ── Gherkin extraction ────────────────────────────────────────────────────────

const GHERKIN_KEYWORD = /^\s*(Given|When|Then|And|But)\s+(.*)$/i;

/**
 * Pull the real steps for a scenario out of the pack's own `.feature` template.
 *
 * Falls back to a single TODO step rather than inventing behaviour: a delta
 * that says "TODO" is reviewable; one that says something plausible but made
 * up is not.
 */
function stepsForScenario(packDir, scenario) {
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
 * `origin` records where a requirement came from.
 *
 * Provenance goes in the trace comment rather than in a new matrix column on
 * purpose: `parseTraceabilityRows` keys off a 10-cell row, and an eleventh
 * column would break every existing consumer of the matrix for a field only
 * tooling reads. The trace comment is already the extension point, and it
 * survives `archive` because the renderer writes the whole trace back out.
 */
function traceComment(scenario, origin?) {
  const parts = [];
  if (scenario) {
    if (scenario.use_case) parts.push(`uc=${scenario.use_case}`);
    if (scenario.command) parts.push(`cmd=${scenario.command}`);
    if (scenario.aggregate) parts.push(`agg=${scenario.aggregate}`);
    const events = asArray(scenario.events);
    if (events.length > 0) parts.push(`evt=${events[0]}`);
    if (scenario.target) parts.push(`feature=${scenario.target}`);
  }
  if (origin) parts.push(`origin=${origin}`);
  return parts.length > 0 ? `<!-- csda:trace ${parts.join(" ")} -->` : null;
}

function renderRequirementBlock(req, scenarios, packDir, opts?) {
  const o = opts || {};
  const out = [];
  out.push(`### Requirement: ${req.id} — ${req.title || req.id}`);
  out.push("");

  if (o.bodyless) {
    out.push(o.reason || "(retirado por el pack.)");
    out.push("");
    while (out[out.length - 1] === "") out.pop();
    return out.join("\n");
  }

  const description = String(req.description || "").trim();
  out.push(description || `El sistema SHALL cumplir "${req.title || req.id}".`);
  if (req.priority) out.push("", `_Prioridad: ${req.priority}._`);
  out.push("");

  for (const sc of scenarios || []) {
    const name = sc.scenario || sc.id || "Escenario";
    out.push(`#### Scenario: ${sc.id ? `${sc.id} — ${name}` : name}`);
    out.push("");
    const steps = stepsForScenario(packDir, sc);
    if (steps) {
      for (const step of steps) out.push(`- ${step}`);
    } else {
      out.push(`- TODO: escribir los pasos GIVEN / WHEN / THEN de "${name}"`);
    }
    out.push("");
  }

  if ((scenarios || []).length === 0) {
    out.push(`#### Scenario: TODO — escenario de "${req.title || req.id}"`);
    out.push("");
    out.push("- TODO: escribir los pasos GIVEN / WHEN / THEN");
    out.push("");
  }

  const trace = traceComment((scenarios || [])[0], o.origin);
  if (trace) {
    out.push(trace);
    out.push("");
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/**
 * Compare two versions of a pack and produce the delta markdown plus a summary.
 *
 * @returns { capability, markdown, summary: {added[], modified[], removed[]} }
 *          `markdown` is null when nothing behavioural changed.
 */
function deriveDelta(oldPackRoot, newPackRoot, packId, opts?) {
  const options = opts || {};
  const oldPack = oldPackRoot ? loadPackModel(oldPackRoot, packId) : null;
  const newPack = loadPackModel(newPackRoot, packId);

  const oldReqs = oldPack ? requirementsById(oldPack.model) : new Map();
  const newReqs = requirementsById(newPack.model);
  const oldScenarios = oldPack ? scenariosByRequirement(oldPack.model) : new Map();
  const newScenarios = scenariosByRequirement(newPack.model);

  const added = [];
  const modified = [];
  const removed = [];

  for (const [id, req] of newReqs) {
    if (!oldReqs.has(id)) {
      added.push({ req, scenarios: newScenarios.get(id) || [] });
      continue;
    }
    const before = requirementFingerprint(oldReqs.get(id), oldScenarios.get(id) || []);
    const after = requirementFingerprint(req, newScenarios.get(id) || []);
    if (before !== after) modified.push({ req, scenarios: newScenarios.get(id) || [] });
  }
  for (const [id, req] of oldReqs) {
    if (!newReqs.has(id)) removed.push({ req, scenarios: oldScenarios.get(id) || [] });
  }

  if (added.length === 0 && modified.length === 0 && removed.length === 0) {
    return {
      capability: packId,
      markdown: null,
      summary: { added: [], modified: [], removed: [] },
    };
  }

  const lines = [`# Delta — ${packId}`, ""];
  const purpose = newPack.model && newPack.model.metadata && newPack.model.metadata.name;
  if (!oldPack && purpose) {
    lines.push("## Purpose", "", String(purpose), "");
  }

  const section = (heading, entries, blockOpts?) => {
    if (entries.length === 0) return;
    lines.push(`## ${heading}`, "");
    for (const entry of entries) {
      lines.push(
        renderRequirementBlock(entry.req, entry.scenarios, newPack.packDir, {
          ...(blockOpts || {}),
          origin: options.origin,
        })
      );
      lines.push("");
    }
  };

  section("ADDED Requirements", added);
  section("MODIFIED Requirements", modified);
  section("REMOVED Requirements", removed, {
    bodyless: true,
    reason: "(retirado en esta versión del pack.)",
  });

  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  return {
    capability: packId,
    markdown: `${lines.join("\n")}\n`,
    summary: {
      added: added.map((e) => e.req.id),
      modified: modified.map((e) => e.req.id),
      removed: removed.map((e) => e.req.id),
    },
  };
}

// ── The proposal ──────────────────────────────────────────────────────────────

function changeIdFor(packId, fromVersion, toVersion) {
  const slug = (v) =>
    String(v)
      .replace(/[^a-zA-Z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  return `upgrade-${slug(packId.split("/").pop())}-${slug(toVersion)}`;
}

function renderProposal(entry, targetVersion, summary) {
  const count = summary.added.length + summary.modified.length + summary.removed.length;
  const list = (label, ids) =>
    ids.length === 0 ? "" : `\n### ${label}\n\n${ids.map((id) => `- ${id}`).join("\n")}\n`;

  return `# Proposal: upgrade ${entry.pack_id} to ${targetVersion}

## Intent

El pack \`${entry.pack_id}\` pasa de \`${entry.version}\` a \`${targetVersion}\`.
Este cambio recoge **qué requisitos cambian**, derivados del modelo del pack, no
del diff de ficheros — lo que se revisa aquí es la intención del dominio.

## Scope

${count} requisito(s) afectado(s).
${list("Añadidos", summary.added)}${list("Modificados", summary.modified)}${list("Retirados", summary.removed)}
Fuera de alcance: la reconciliación de los ficheros generados, que sigue siendo
trabajo de \`specops sync\`.

## Approach

1. Revisar el delta de \`specs/${entry.pack_id}/spec.md\`.
2. Ejecutar \`csda specops sync --pack ${entry.pack_id} --pack-version ${targetVersion}\`.
3. Resolver los conflictos que el merge de tres vías marque.
4. Archivar este cambio para consolidar los requisitos en las specs y la matriz.

> Los pasos marcados \`TODO:\` en el delta son escenarios que el pack declara sin
> plantilla Gherkin legible. Complétalos antes de archivar.
`;
}

function renderTasks(entry, targetVersion) {
  return `# Tasks

## 1. Review

- [ ] 1.1 Revisar el delta requisito a requisito
- [ ] 1.2 Completar los pasos marcados \`TODO:\`

## 2. Apply

- [ ] 2.1 \`csda specops sync --pack ${entry.pack_id} --pack-version ${targetVersion}\`
- [ ] 2.2 Resolver conflictos del merge de tres vías
- [ ] 2.3 \`csda change validate\`
`;
}

/**
 * Materialise the derived delta as a change folder. Returns the list of files
 * written (or that would be written, when `dryRun`).
 */
function materialiseChange(projectDir, entry, targetVersion, derived, opts?) {
  const o = opts || {};
  const changeId = o.changeId || changeIdFor(entry.pack_id, entry.version, targetVersion);
  const changeDir = path.join(projectDir, "docs", "specs", "changes", changeId);

  const files = [
    {
      file: path.join(changeDir, "proposal.md"),
      contents: renderProposal(entry, targetVersion, derived.summary),
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

module.exports = {
  loadPackModel,
  requirementsById,
  scenariosByRequirement,
  requirementFingerprint,
  stepsForScenario,
  deriveDelta,
  changeIdFor,
  materialiseChange,
  renderRequirementBlock,
};
