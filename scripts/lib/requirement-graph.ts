"use strict";

/**
 * The dependency graph between requirements.
 *
 * `harness run` processes requirements in matrix order and cuts every worktree
 * from the same base, which is wrong whenever one requirement builds on
 * another: REQ-002 needed REQ-001's code to exist and there was no way to say
 * so, so somebody had to know it and pass `--base-branch` by hand. That is
 * defect H12 of the closure plan, and the false failure recorded as H9 was the
 * same gap seen from the other side.
 *
 * A requirement declares what it builds on inside the `csda:trace` comment it
 * already carries:
 *
 *   <!-- csda:trace uc=UC-002 feature=features/auth/scopes.feature
 *        depends=REQ-001 -->
 *
 * That comment is the repository's existing way of attaching machine-readable
 * facts to a requirement, and `change archive` already reads it to write the
 * traceability row. So the model is the one this repository uses everywhere
 * else: **the requirement declares, the matrix reflects.** Nothing about the
 * ten-column format changes, which matters — `done` and `alm sync` both read
 * Status as the penultimate cell, so an extra column would have silently sent
 * status writes to the wrong place.
 *
 * A missing declaration means no dependencies, so every project that never
 * writes one behaves exactly as it does today.
 */

const fs = require("node:fs");
const path = require("node:path");

const { parseSpec } = require("../change/parser");

const CAPABILITIES_DIR = path.join("docs", "specs", "capabilities");
const REQ_ID = /^REQ-[A-Za-z0-9.]+$/;

/**
 * Read every capability spec and return `{ REQ-id: [REQ-id, …] }`.
 *
 * Only requirements that declare `depends` appear as keys; the graph is
 * sparse on purpose, so "no entry" and "no dependencies" are the same thing.
 */
function readDeclaredDependencies(projectDir) {
  const root = path.join(projectDir, CAPABILITIES_DIR);
  const declared = {};
  if (!fs.existsSync(root)) return declared;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const specPath = path.join(root, entry.name, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    let parsed;
    try {
      parsed = parseSpec(fs.readFileSync(specPath, "utf8"));
    } catch {
      // A capability whose spec does not parse is `validate`'s problem to
      // report, not this module's to crash on.
      continue;
    }
    for (const req of parsed.requirements || []) {
      const id = req.id ? String(req.id).toUpperCase() : "";
      if (!REQ_ID.test(id)) continue;
      const raw = (req.trace || {}).depends;
      if (!raw) continue;
      const deps = splitDependencies(raw);
      if (deps.length > 0) declared[id] = deps;
    }
  }
  return declared;
}

/** `"REQ-001, REQ-003"` → `["REQ-001", "REQ-003"]`, de-duplicated, upper-cased. */
function splitDependencies(raw) {
  const seen = new Set();
  for (const token of String(raw).split(/[,;\s]+/)) {
    const id = token.trim().toUpperCase();
    if (id) seen.add(id);
  }
  return [...seen];
}

/**
 * Build the graph over a known set of requirement ids.
 *
 * @param {string[]} requirementIds  every REQ the project has, matrix order
 * @param {object} declared         `{ REQ: [REQ, …] }` from the specs
 * @returns {{
 *   dependsOn: Record<string, string[]>,
 *   dependents: Record<string, string[]>,
 *   unknown: Array<{ requirement: string, dependency: string }>,
 *   selfReferential: string[]
 * }}
 */
function buildGraph(requirementIds, declared) {
  const known = new Set(requirementIds.map((id) => String(id).toUpperCase()));
  const dependsOn = {};
  const dependents = {};
  const unknown = [];
  const selfReferential = [];

  for (const id of known) {
    dependsOn[id as string] = [];
    dependents[id as string] = [];
  }

  for (const [requirement, deps] of Object.entries(declared)) {
    if (!known.has(requirement)) continue; // declared for a REQ not in this project
    for (const dependency of deps as string[]) {
      if (dependency === requirement) {
        selfReferential.push(requirement);
        continue;
      }
      if (!known.has(dependency)) {
        unknown.push({ requirement, dependency });
        continue;
      }
      dependsOn[requirement].push(dependency);
      dependents[dependency].push(requirement);
    }
  }

  return { dependsOn, dependents, unknown, selfReferential };
}

/**
 * Order requirements so every dependency comes before what needs it, and
 * report any cycle rather than looping forever.
 *
 * Kahn's algorithm, with the queue kept in the caller's original order so the
 * result is stable: two requirements that do not constrain each other stay in
 * matrix order, and a project with no declarations gets its input back
 * untouched.
 *
 * @returns {{ order: string[], levels: string[][], cycles: string[][] }}
 *   `levels[i]` is the set of requirements whose dependencies are all in
 *   earlier levels — that is, the ones that could run at the same time.
 */
function topologicalOrder(requirementIds, dependsOn) {
  const ids = requirementIds.map((id) => String(id).toUpperCase());
  const remaining: Map<string, Set<string>> = new Map(
    ids.map((id) => [id, new Set<string>(dependsOn[id] || [])])
  );

  const order = [];
  const levels = [];

  while (remaining.size > 0) {
    const ready = ids.filter((id) => remaining.has(id) && remaining.get(id).size === 0);
    if (ready.length === 0) break; // everything left is in, or behind, a cycle

    levels.push(ready);
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
    }
    for (const deps of remaining.values()) {
      for (const id of ready) deps.delete(id);
    }
  }

  return { order, levels, cycles: findCycles([...remaining.keys()], dependsOn) };
}

/**
 * Name the actual cycles among the requirements that could not be ordered.
 *
 * Reporting "there is a cycle" is not actionable; reporting
 * `REQ-002 → REQ-003 → REQ-002` is. Depth-first, returning each cycle once,
 * as the path that closes it.
 */
function findCycles(stuck, dependsOn) {
  const inStuck = new Set(stuck);
  const cycles = [];
  const seenSignature = new Set();
  const state = new Map(); // id → "visiting" | "done"
  const path = [];

  const visit = (id) => {
    if (state.get(id) === "done") return;
    const at = path.indexOf(id);
    if (at !== -1) {
      const cycle = path.slice(at);
      // Rotate to the smallest id so the same loop reported from two entry
      // points is recognised as one.
      const pivot = cycle.indexOf([...cycle].sort()[0]);
      const normalised = [...cycle.slice(pivot), ...cycle.slice(0, pivot)];
      const signature = normalised.join(">");
      if (!seenSignature.has(signature)) {
        seenSignature.add(signature);
        cycles.push(normalised);
      }
      return;
    }
    path.push(id);
    state.set(id, "visiting");
    for (const dep of dependsOn[id] || []) {
      if (inStuck.has(dep)) visit(dep);
    }
    path.pop();
    state.set(id, "done");
  };

  for (const id of stuck) visit(id);
  return cycles;
}

/**
 * Everything a caller needs, from a project directory and its requirement ids.
 */
function requirementGraph(projectDir, requirementIds) {
  const declared = readDeclaredDependencies(projectDir);
  const graph = buildGraph(requirementIds, declared);
  const ordered = topologicalOrder(requirementIds, graph.dependsOn);
  return { ...graph, ...ordered, declared };
}

module.exports = {
  CAPABILITIES_DIR,
  readDeclaredDependencies,
  splitDependencies,
  buildGraph,
  topologicalOrder,
  findCycles,
  requirementGraph,
};
