"use strict";

// csda:allow-placeholders — these tests feed the scanner {{VAR}} tokens on purpose.

/**
 * The unresolved-placeholder scan, which `validate` and `doctor` share.
 *
 * They used to have a copy each, and the copies drifted: fixing `validate` to
 * skip dependency trees, template files and documentation that quotes the
 * syntax left `doctor` reporting 64 errors on this repository, every one a
 * false positive.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  findUnresolvedPlaceholders,
  missingVariables,
  isExempt,
} = require("../../scripts/lib/placeholders");

function withTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "placeholders-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

test("reports a genuinely unresolved placeholder", () => {
  const dir = withTree({ "spec.md": "# {{PROJECT_NAME}}\n" });
  assert.deepEqual(findUnresolvedPlaceholders(dir), ["spec.md"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("does not scan dependency trees or build output", () => {
  const dir = withTree({
    "node_modules/mustache/README.md": "use {{NAME}} in your template\n",
    "dist/bundle.js": "var t = '{{TOKEN}}';\n",
    "coverage/report.html": "<pre>{{VAR}}</pre>\n",
    "spec.md": "# Clean\n",
  });
  // Any project with dependencies installed would otherwise fail on its own
  // template libraries.
  assert.deepEqual(findUnresolvedPlaceholders(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a .tpl file is unrendered by definition, not defective", () => {
  const dir = withTree({ "templates/base/spec.md.tpl": "# {{PROJECT_NAME}}\n" });
  assert.deepEqual(findUnresolvedPlaceholders(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an explicit marker exempts documentation that quotes the syntax", () => {
  const dir = withTree({
    "docs/how-to.md": "<!-- csda:allow-placeholders -->\nUse {{PROJECT_NAME}} in templates.\n",
    "docs/other.md": "Someone left a real {{PROJECT_NAME}} here.\n",
  });
  // Exemption is declared, never inferred.
  assert.deepEqual(findUnresolvedPlaceholders(dir), ["docs/other.md"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the marker works in any comment syntax", () => {
  assert.equal(isExempt("a.md", "<!-- csda:allow-placeholders -->\n{{X}}"), true);
  assert.equal(isExempt("a.ts", "// csda:allow-placeholders\n{{X}}"), true);
  assert.equal(isExempt("a.yaml", "# csda:allow-placeholders\n{{X}}"), true);
  assert.equal(isExempt("a.md", "{{X}}"), false);
});

test("missingVariables names what still has to be supplied", () => {
  const dir = withTree({
    "spec.md": "{{PROJECT_NAME}} and {{DOMAIN}}\n",
    "README.md": "{{PROJECT_NAME}}\n",
  });
  const offenders = findUnresolvedPlaceholders(dir);
  assert.deepEqual(missingVariables(dir, offenders), ["DOMAIN", "PROJECT_NAME"]);
  fs.rmSync(dir, { recursive: true, force: true });
});
