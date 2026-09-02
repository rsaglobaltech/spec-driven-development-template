/**
 * The gate must mean the same thing after the attempt as before it (#167).
 *
 * `WriteScope` protects the contract: spec.md, AI_RULES.md, features/**,
 * docs/specs/**. It does not protect the file that defines the command the gate
 * *runs*, and that turns out to be the same hole one level up. Measured, with a
 * stub agent that writes no implementation at all:
 *
 *     "scripts": { "test": "node --test tests/*.test.js" }   →   "echo 'all good'"
 *
 * over a suite that was red before it ran. The harness reported
 * `✅ REQ-001 pass (1 attempt)`. An agent that cannot pass the test can weaken
 * the test.
 *
 * ## Why this is not "protect package.json"
 *
 * Adding a dependency during implementation is legitimate and common, and a
 * guard that blocks it would be turned off within a day — at which point it
 * protects nothing. So this does not watch the file. It resolves which *script*
 * the gate command actually invokes and watches only that one value.
 *
 * ## Why it declares what it cannot see
 *
 * `npm test` and `make check` name a script this can find. `mvn -B test` and
 * `pytest` do not — their behaviour lives in a plugin graph or a config file
 * this would have to interpret, and a guard that guesses is worse than one that
 * says it did not look. `resolveGateScript` returns `null` there, and the
 * caller reports the check as not applicable rather than as passed.
 */

export interface GateScriptRef {
  /** The manifest that defines it, relative to the project root. */
  manifest: string;
  /** The key inside that manifest — an npm script name, or a Make target. */
  script: string;
}

const NPM_RUNNERS = ["npm", "yarn", "pnpm", "bun"];

/**
 * Which script definition, if any, a gate command depends on.
 *
 * Returns `null` when the command's meaning does not live in a file this can
 * read — which is a real answer, not a failure.
 */
export function resolveGateScript(testCmd: string): GateScriptRef | null {
  const tokens = String(testCmd || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const [runner, ...rest] = tokens;

  if (NPM_RUNNERS.includes(runner)) {
    // `npm test`, `npm run verify`, `yarn test`, `pnpm run check`.
    const args = rest.filter((a) => !a.startsWith("-"));
    if (args.length === 0) return null;
    if (args[0] === "run" || args[0] === "run-script") {
      return args[1] ? { manifest: "package.json", script: args[1] } : null;
    }
    if (args[0] === "test" || args[0] === "t") return { manifest: "package.json", script: "test" };
    // `npm start`, `npm ci` and friends are not gates; anything else is a
    // script name only if package.json says so, which the caller resolves.
    return { manifest: "package.json", script: args[0] };
  }

  if (runner === "make") {
    const target = rest.find((a) => !a.startsWith("-"));
    return { manifest: "Makefile", script: target || "all" };
  }

  return null;
}

/** The value of an npm script, or `null` when the manifest has no such script. */
export function npmScriptValue(manifestSource: string, script: string): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(manifestSource);
  } catch {
    return null;
  }
  const scripts = parsed && parsed.scripts;
  if (!scripts || typeof scripts !== "object") return null;
  const value = scripts[script];
  return typeof value === "string" ? value : null;
}

/**
 * The recipe lines of one Make target.
 *
 * Deliberately literal: a target's body is every indented line under it, up to
 * the next rule. Reproducing Make's own parser would be a bigger promise than
 * this needs to keep.
 */
export function makeTargetRecipe(manifestSource: string, target: string): string | null {
  const lines = String(manifestSource).replace(/\r\n/g, "\n").split("\n");
  const head = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
  const body: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (head.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) break;
    body.push(line.trim());
  }
  return inside ? body.join("\n") : null;
}

export interface GateIntegrityResult {
  /** `false` when the gate's meaning does not live in a file this can read. */
  checked: boolean;
  changed: boolean;
  script?: GateScriptRef;
  before?: string | null;
  after?: string | null;
}

/**
 * Did the definition the gate command depends on change during the attempt?
 *
 * A script that did not exist before and does not exist after is unchanged. A
 * script that *appears* is a change: inventing the target the gate names is the
 * same move as rewriting it.
 */
export function gateCommandIntegrity(
  testCmd: string,
  manifestBefore: string | null,
  manifestAfter: string | null
): GateIntegrityResult {
  const script = resolveGateScript(testCmd);
  if (!script) return { checked: false, changed: false };

  const read = (source: string | null) => {
    if (source === null) return null;
    return script.manifest === "Makefile"
      ? makeTargetRecipe(source, script.script)
      : npmScriptValue(source, script.script);
  };

  const before = read(manifestBefore);
  const after = read(manifestAfter);

  // The manifest carries no such script either side: nothing here defines the
  // gate, so there is nothing to protect and saying "passed" would overstate it.
  if (before === null && after === null) return { checked: false, changed: false, script };

  return { checked: true, changed: before !== after, script, before, after };
}
