"use strict";

/**
 * Pure module — no vscode dependency.
 *
 * Understands the cross-reference graph inside a single `pack.yaml`:
 *   - which entity IDs/names are declared (for autocomplete candidates),
 *   - which `use_case` references are dangling (for live diagnostics),
 *   - how many use cases / scenarios point at each requirement (for CodeLens).
 *
 * It is the editor-side mirror of `pack lint --graph` — same spine
 * (REQ → UC → CMD/QUERY/AGG/EVT), but reporting line/col positions so the
 * extension can underline the exact offending value.
 */

const yaml = require("js-yaml");

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

/**
 * The set of IDs/names that may legitimately be referenced, grouped by the
 * reference kind that would target them.
 *
 * @typedef {{
 *   requirement: Set<string>,
 *   command: Set<string>,
 *   query: Set<string>,
 *   aggregate: Set<string>,
 *   event: Set<string>,
 *   use_case: Set<string>,
 * }} Declared
 */

/** @returns {Declared} */
function collectDeclared(pack) {
  const declared = {
    requirement: new Set(),
    command: new Set(),
    query: new Set(),
    aggregate: new Set(),
    event: new Set(),
    use_case: new Set(),
  };
  if (!pack || typeof pack !== "object") return declared;

  for (const r of asArray(pack.requirements)) {
    if (r && r.id) declared.requirement.add(String(r.id));
  }
  for (const u of asArray(pack.use_cases)) {
    if (u && u.id) declared.use_case.add(String(u.id));
  }
  // Commands/queries/aggregates/events are referenced by id OR by name.
  for (const c of asArray(pack.commands)) {
    if (c && c.id) declared.command.add(String(c.id));
    if (c && c.name) declared.command.add(String(c.name));
  }
  for (const q of asArray(pack.queries)) {
    if (q && q.id) declared.query.add(String(q.id));
    if (q && q.name) declared.query.add(String(q.name));
  }
  for (const a of asArray(pack.aggregates)) {
    if (a && a.id) declared.aggregate.add(String(a.id));
    if (a && a.name) declared.aggregate.add(String(a.name));
  }
  for (const e of asArray(pack.events)) {
    if (e && e.id) declared.event.add(String(e.id));
    if (e && e.name) declared.event.add(String(e.name));
  }
  return declared;
}

/**
 * Best-effort line/col of a referenced value. Scans for the value as a whole
 * token (after `: ` or `- `, or inside a flow list) so a substring of a longer
 * identifier is not matched. Returns { line: 0, col: 0 } when not found.
 */
function findReferencePosition(lines, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[\\s:\\[,-])(${escaped})($|[\\s,\\]])`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      const col = m.index + m[1].length;
      return { line: i, col };
    }
  }
  return { line: 0, col: 0 };
}

/**
 * Find every dangling `use_case` reference. Returns diagnostic descriptors in
 * the same shape `pack-validator` produces, so `extension.ts` can render them
 * with its existing `makeDiag` helper.
 *
 * @returns {{ line: number, col: number, message: string, severity: "error" }[]}
 */
function findDanglingReferences(pack, declared, lines) {
  const diags = [];
  const flag = (kind, ref, ucLabel) => {
    const { line, col } = findReferencePosition(lines, ref);
    diags.push({
      line,
      col,
      message: `${ucLabel} references unknown ${kind}: ${ref}`,
      severity: "error",
    });
  };

  for (const u of asArray(pack && pack.use_cases)) {
    if (!u || typeof u !== "object") continue;
    const ucLabel = u.id || u.name || "use case";

    const reqRefs = asArray(u.requirements || (u.requirement ? [u.requirement] : []));
    for (const ref of reqRefs) {
      if (ref && !declared.requirement.has(String(ref))) flag("requirement", String(ref), ucLabel);
    }
    if (u.command && !declared.command.has(String(u.command))) {
      flag("command", String(u.command), ucLabel);
    }
    if (u.query && !declared.query.has(String(u.query))) {
      flag("query", String(u.query), ucLabel);
    }
    if (u.aggregate && !declared.aggregate.has(String(u.aggregate))) {
      flag("aggregate", String(u.aggregate), ucLabel);
    }
    for (const ref of asArray(u.emits)) {
      if (ref && !declared.event.has(String(ref))) flag("event", String(ref), ucLabel);
    }
  }
  return diags;
}

/**
 * Count, per requirement ID, how many use cases and scenarios reference it.
 * @returns {Map<string, { useCases: number, scenarios: number }>}
 */
function countRequirementReferences(pack) {
  const counts = new Map();
  const bump = (id, key) => {
    if (!id) return;
    const k = String(id);
    if (!counts.has(k)) counts.set(k, { useCases: 0, scenarios: 0 });
    counts.get(k)[key] += 1;
  };

  for (const u of asArray(pack && pack.use_cases)) {
    if (!u) continue;
    const reqRefs = asArray(u.requirements || (u.requirement ? [u.requirement] : []));
    for (const ref of reqRefs) bump(ref, "useCases");
  }
  for (const s of asArray(pack && pack.scenarios)) {
    if (!s) continue;
    bump(s.requirement || s.requirement_id, "scenarios");
  }
  return counts;
}

/**
 * One-shot analysis of a pack.yaml document.
 *
 * @param {string} content  Raw pack.yaml text.
 * @returns {{
 *   declared: Declared,
 *   dangling: { line:number, col:number, message:string, severity:"error" }[],
 *   refCounts: Map<string, { useCases:number, scenarios:number }>,
 * }}
 */
function analyzePackGraph(content) {
  let pack;
  try {
    pack = yaml.load(content, { json: true });
  } catch {
    // A parse error is pack-validator's job to report — stay silent here.
    pack = null;
  }
  const declared = collectDeclared(pack);
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    return { declared, dangling: [], refCounts: new Map() };
  }
  const lines = content.split("\n");
  return {
    declared,
    dangling: findDanglingReferences(pack, declared, lines),
    refCounts: countRequirementReferences(pack),
  };
}

// A reference field on its own line, e.g. `    command: Foo`.
const INLINE_REF_RE = /^\s*(requirement|command|query|aggregate):\s*/;
// A YAML block key, e.g. `    emits:` — used to resolve list-item context.
const BLOCK_KEY_RE = /^(\s*)(?:-\s+)?([a-z_]+):\s*$/;
// Plural block keys that hold a list of references, mapped to their kind.
const LIST_KEY_KIND = { emits: "event", requirements: "requirement" };

/**
 * Which reference kind, if any, the value position on `lines[lineIdx]` expects.
 * Handles both `key: <value>` lines and `- <value>` items nested under a
 * reference-list key (`emits:`, `requirements:`). Returns null otherwise.
 *
 * @returns {"requirement"|"command"|"query"|"aggregate"|"event"|null}
 */
function referenceKindForLine(lines, lineIdx) {
  const line = lines[lineIdx];
  if (line === undefined) return null;

  const inline = line.match(INLINE_REF_RE);
  if (inline) return inline[1];

  // List item: `- value` — walk up to the nearest lower-indent block key.
  const item = line.match(/^(\s*)-\s+/);
  if (item) {
    const itemIndent = item[1].length;
    for (let i = lineIdx - 1; i >= 0; i--) {
      const key = lines[i].match(BLOCK_KEY_RE);
      if (!key) continue;
      const keyIndent = key[1].length;
      if (keyIndent < itemIndent) {
        return LIST_KEY_KIND[key[2]] || null;
      }
    }
  }
  return null;
}

/**
 * Locate where an entity ID or name is *declared* (its `id:` or `name:` line),
 * for go-to-definition. Returns { line, col } of the value, or null.
 */
function findDeclarationPosition(content, idOrName) {
  const lines = content.split("\n");
  const escaped = idOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*(?:-\\s+)?(?:id|name):\\s*["']?(${escaped})["']?\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      const col = lines[i].indexOf(idOrName);
      return { line: i, col: Math.max(0, col) };
    }
  }
  return null;
}

module.exports = {
  collectDeclared,
  findReferencePosition,
  findDanglingReferences,
  countRequirementReferences,
  analyzePackGraph,
  referenceKindForLine,
  findDeclarationPosition,
};
