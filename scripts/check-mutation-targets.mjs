/**
 * Fail when a mutation target resolves to no file.
 *
 * Stryker only *warns* on a glob that matches nothing and still exits 0, so the
 * weekly pilot can report a mutation score over a target that no longer exists.
 * That is exactly what happened between `6ada847` and 2026-08-26: one of the two
 * modules had been deleted and the other reduced to a re-export shim, and every
 * run since was green.
 *
 * The same defect as H15 (`cucumber-js --tags "@NO-EXISTE"` reporting 0 scenarios
 * and exit 0) and the same remedy: a check that counts nothing must say so.
 *
 * Deliberately not a glob library — the targets are literal paths, and adding a
 * dependency to guard a dev script would cost more than it protects. If a real
 * wildcard is ever needed here, this is the place to grow one.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const CONFIG = "stryker.config.mjs";
const { default: config } = await import(`./../${CONFIG}`);
const targets = config.mutate ?? [];

if (targets.length === 0) {
  console.error(`✖ ${CONFIG} declares no mutation targets.`);
  process.exit(1);
}

const missing = targets.filter((t) => !t.includes("*") && !existsSync(t));

if (missing.length > 0) {
  console.error(`✖ ${CONFIG} names ${missing.length} target(s) that do not exist:\n`);
  for (const m of missing) console.error(`    ${m}`);
  console.error(
    `\n  Stryker would only warn and still exit 0, reporting a score over whatever\n` +
      `  is left. Build first if you have not, then correct the paths.\n`
  );
  process.exit(1);
}

// A target that exists but is a re-export shim is the subtler half of the same
// defect: it mutates cleanly and measures nothing. Size is a crude proxy, but it
// is the one signal available without parsing the module.
const SHIM_LINES = 40;
for (const t of targets) {
  if (t.includes("*")) continue;
  const lines = (await readFile(t, "utf8")).split("\n").length;
  if (lines < SHIM_LINES) {
    console.error(
      `✖ ${t} is ${lines} lines — too small to be the module this pilot means to\n` +
        `  measure, and almost certainly a re-export shim. Point at the implementation.\n`
    );
    process.exit(1);
  }
}

console.log(`✔ ${targets.length} mutation target(s) present.`);
