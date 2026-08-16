"use strict";

/**
 * The artefact dependency graph, and where a change currently stands in it.
 *
 * Its own module because both `change status` and `change instructions` need
 * it, and having the second require the first created an import cycle that
 * only showed up at runtime.
 *
 * Dependencies are enablers, not gates (ADR-0018): `blocked` means "you have
 * not written what this builds on yet", never "you are forbidden from writing
 * this".
 */

const fs = require("node:fs");
const path = require("node:path");

const { paths, listDeltas } = require("./common");

const ARTIFACTS = [
  { id: "proposal", generates: "proposal.md", requires: [] },
  { id: "specs", generates: "specs/**/spec.md", requires: ["proposal"] },
  { id: "design", generates: "design.md", requires: ["proposal"] },
  { id: "tasks", generates: "tasks.md", requires: ["specs", "design"] },
];

function artifactState(projectDir, changeId, config) {
  const p = paths(projectDir);
  const dir = p.change(changeId);
  const exists = {
    proposal: fs.existsSync(path.join(dir, "proposal.md")),
    specs: listDeltas(projectDir, changeId).length > 0,
    design: fs.existsSync(path.join(dir, "design.md")),
    tasks: fs.existsSync(path.join(dir, "tasks.md")),
  };

  // A change that declares skip_specs satisfies the `specs` dependency without
  // creating anything — the artefact counts as done, not as missing.
  const skipped: any = { specs: config.skip_specs === true };
  // Lite rigor makes design optional in the same way.
  if (config.rigor === "lite" && !exists.design) skipped.design = true;

  const satisfied = (id) => exists[id] || skipped[id];

  return ARTIFACTS.map((a) => {
    const missingDeps = a.requires.filter((dep) => !satisfied(dep));
    let status;
    if (skipped[a.id]) status = "skipped";
    else if (exists[a.id]) status = "done";
    else if (missingDeps.length > 0) status = "blocked";
    else status = "ready";
    const entry: any = {
      id: a.id,
      outputPath: a.generates,
      status,
      requires: a.requires,
    };
    if (status === "blocked") entry.missingDeps = missingDeps;
    return entry;
  });
}

module.exports = { ARTIFACTS, artifactState };
