import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { probeProject } from "../tools/project.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "csda-probe-"));
const clean = (d: string) => fs.rmSync(d, { recursive: true, force: true });

const MATRIX = `# Traceability Matrix

| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |
|---|---|---|---|---|---|---|---|---|---|
| REQ-001 | SCN-001 | \`a.feature\` | - | - | - | - | - | TBD | Draft |
| REQ-002 | SCN-002 | \`b.feature\` | - | - | - | - | \`Svc\` | \`SvcTest\` | Implemented |
| REQ-003 | SCN-003 | \`c.feature\` | - | - | - | - | - | TBD | In Dev |
`;

test("a directory that is not a project says so instead of pretending", () => {
  const root = tmp();
  try {
    const info = probeProject(root);
    assert.equal(info.isSpecDriven, false);
    assert.equal(info.pending, null);
    assert.equal(info.name, path.basename(root));
  } finally {
    clean(root);
  }
});

test("a spec-driven project reports how much is left", () => {
  const root = tmp();
  try {
    fs.writeFileSync(path.join(root, "spec.md"), "# Spec\n", "utf8");
    fs.mkdirSync(path.join(root, "docs", "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/specs/traceability.md"), MATRIX, "utf8");
    const info = probeProject(root);
    assert.equal(info.isSpecDriven, true);
    assert.equal(info.total, 3);
    // Implemented is done; Draft and In Dev are not.
    assert.equal(info.pending, 2);
  } finally {
    clean(root);
  }
});

test("a malformed matrix never blocks the prompt from appearing", () => {
  const root = tmp();
  try {
    fs.writeFileSync(path.join(root, "spec.md"), "# Spec\n", "utf8");
    fs.mkdirSync(path.join(root, "docs", "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/specs/traceability.md"), "| garbage |\n", "utf8");
    const info = probeProject(root);
    assert.equal(info.isSpecDriven, true);
    assert.equal(info.pending, null, "unreadable is reported as unknown, not as zero");
  } finally {
    clean(root);
  }
});

test(".specops.lock alone is enough to recognise a project", () => {
  const root = tmp();
  try {
    fs.writeFileSync(path.join(root, ".specops.lock"), "{}", "utf8");
    assert.equal(probeProject(root).isSpecDriven, true);
  } finally {
    clean(root);
  }
});
