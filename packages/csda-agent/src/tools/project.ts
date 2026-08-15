/**
 * A cheap read of where the user is standing.
 *
 * Runs at startup to fill the welcome screen, so it has to be fast and it has
 * to never throw: a malformed matrix is a thing the agent can help fix, not a
 * reason to fail before the prompt appears.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { ProjectInfo } from "../tui/Welcome.js";

/** Statuses that mean the requirement is finished. */
const DONE = new Set(["implemented", "verified", "released"]);

export function probeProject(cwd: string): ProjectInfo {
  const root = path.resolve(cwd);
  const name = path.basename(root) || root;
  const isSpecDriven =
    fs.existsSync(path.join(root, "spec.md")) ||
    fs.existsSync(path.join(root, ".specops.lock")) ||
    fs.existsSync(path.join(root, "docs", "specs"));

  if (!isSpecDriven) {
    return { name, isSpecDriven: false, pending: null, total: null };
  }

  try {
    const matrix = path.join(root, "docs", "specs", "traceability.md");
    if (!fs.existsSync(matrix)) return { name, isSpecDriven: true, pending: null, total: null };

    let total = 0;
    let pending = 0;
    for (const line of fs.readFileSync(matrix, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || trimmed.includes("---")) continue;
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length < 10) continue;
      if (!/^REQ-/i.test(cells[0])) continue;
      total += 1;
      if (!DONE.has(cells[9].toLowerCase())) pending += 1;
    }
    return { name, isSpecDriven: true, pending: total > 0 ? pending : null, total: total || null };
  } catch {
    // Never block the prompt on a bad read.
    return { name, isSpecDriven: true, pending: null, total: null };
  }
}
