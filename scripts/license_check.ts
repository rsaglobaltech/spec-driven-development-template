#!/usr/bin/env node
"use strict";

/**
 * License policy gate over the CycloneDX SBOM that `npm sbom` emits.
 *
 * Not a csda command — this governs *this* repository's dependency tree, not
 * a user's project, so it stays out of the CLI surface and runs from npm
 * scripts and CI.
 *
 * Reads the SBOM on stdin (or --sbom <file>) and fails when a component
 * carries a licence outside the allow-list. The published package has zero
 * runtime dependencies, so every finding here is about the toolchain — which
 * still ships nothing to users but does run on CI with a publish token in
 * scope, and does get redistributed the moment someone vendors the repo.
 *
 * Usage:
 *   npm sbom --sbom-format cyclonedx | node dist/scripts/license_check.js
 *   node dist/scripts/license_check.js --sbom sbom.json [--json] [--markdown]
 */

const fs = require("node:fs");

/**
 * Permissive licences that impose no obligation beyond attribution. A copyleft
 * licence is not "banned" so much as a decision nobody has made yet: it would
 * need a deliberate review of what it obliges, which is exactly what silently
 * allowing it would skip.
 */
const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
]);

/**
 * A component's declared licence, as CycloneDX models it: either an array of
 * `{ license: { id | name } }`, or an SPDX `{ expression }` for dual licences.
 * @returns {string} SPDX-ish string, or "UNKNOWN" when nothing is declared.
 */
function licenseOf(component) {
  const entries = component.licenses || [];
  const parts = entries
    .map((e) => (e.license && (e.license.id || e.license.name)) || e.expression)
    .filter(Boolean);
  return parts.length ? parts.join(" OR ") : "UNKNOWN";
}

/**
 * Split an SPDX expression into the licences it offers. A dual licence such as
 * "(MIT OR CC0-1.0)" is satisfied by either side, so the component passes when
 * *any* alternative is allowed — treating it as one opaque string would reject
 * a package that is plainly MIT-available.
 */
function alternatives(expression) {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+OR\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowed(expression) {
  if (expression === "UNKNOWN") return false;
  // AND means every term binds, so every term must be allowed.
  if (/\sAND\s/i.test(expression)) {
    return expression
      .replace(/[()]/g, " ")
      .split(/\s+AND\s+/i)
      .map((s) => s.trim())
      .every((term) => alternatives(term).some((lic) => ALLOWED.has(lic)));
  }
  return alternatives(expression).some((lic) => ALLOWED.has(lic));
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function summarise(components) {
  const byLicense = new Map();
  const violations = [];
  for (const c of components) {
    const lic = licenseOf(c);
    if (!byLicense.has(lic)) byLicense.set(lic, []);
    byLicense.get(lic).push(`${c.name}@${c.version}`);
    if (!isAllowed(lic)) violations.push({ component: `${c.name}@${c.version}`, license: lic });
  }
  const table = [...byLicense.entries()]
    .map(([license, packages]) => ({ license, count: packages.length, packages }))
    .sort((a, b) => b.count - a.count || a.license.localeCompare(b.license));
  return { total: components.length, table, violations };
}

function renderMarkdown(result) {
  const lines = [
    `Components: **${result.total}**`,
    "",
    "| Licence | Packages |",
    "| --- | --: |",
    ...result.table.map((r) => `| \`${r.license}\` | ${r.count} |`),
  ];
  if (result.violations.length) {
    lines.push(
      "",
      "**Outside the allow-list:**",
      "",
      ...result.violations.map((v) => `- \`${v.component}\` — \`${v.license}\``)
    );
  }
  return lines.join("\n") + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  let sbomPath = null;
  let asJson = false;
  let asMarkdown = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sbom" && argv[i + 1]) sbomPath = argv[++i];
    else if (argv[i] === "--json") asJson = true;
    else if (argv[i] === "--markdown") asMarkdown = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(
        "Usage:\n" +
          "  npm sbom --sbom-format cyclonedx | node dist/scripts/license_check.js\n" +
          "  node dist/scripts/license_check.js --sbom <file> [--json] [--markdown]\n"
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${argv[i]}\n`);
      process.exit(2);
    }
  }

  const raw = sbomPath ? fs.readFileSync(sbomPath, "utf8") : readStdin();
  if (!raw.trim()) {
    process.stderr.write(
      "No SBOM on stdin and no --sbom given.\n" +
        "Fix: npm sbom --sbom-format cyclonedx | node dist/scripts/license_check.js\n"
    );
    process.exit(2);
  }

  let bom;
  try {
    bom = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`SBOM is not valid JSON: ${err.message}\n`);
    process.exit(2);
  }

  const result = summarise(bom.components || []);

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ ...result, allowed: [...ALLOWED].sort() }, null, 2) + "\n"
    );
  } else if (asMarkdown) {
    process.stdout.write(renderMarkdown(result));
  } else {
    process.stdout.write(`Components: ${result.total}\n`);
    for (const row of result.table) {
      process.stdout.write(`${String(row.count).padStart(5)}  ${row.license}\n`);
    }
  }

  if (result.violations.length) {
    process.stderr.write(
      `\n❌ ${result.violations.length} component(s) outside the licence policy:\n`
    );
    for (const v of result.violations) {
      process.stderr.write(`   ${v.component} — ${v.license}\n`);
    }
    process.stderr.write(
      "\n💡 Fix: drop the dependency, or add the licence to ALLOWED in\n" +
        "   scripts/license_check.ts after reviewing what it obliges, and say\n" +
        "   why in docs/supply-chain.md.\n"
    );
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { licenseOf, isAllowed, alternatives, summarise, ALLOWED };

if (require.main === module) main();
