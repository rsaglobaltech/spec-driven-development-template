import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  ALWAYS_DENY,
  emptyRuleset,
  evaluate,
  globToRegExp,
  mergeRulesets,
  parseRule,
  ruleMatches,
  suggestRule,
} from "../config/permissions.js";
import { mergeSettings, persistAllowRule, readSettingsFile } from "../config/settings.js";

const CWD = "/repo";
const base = (over = {}) => ({ cwd: CWD, mode: "default" as const, ...over });

// ── rule parsing and matching ─────────────────────────────────────────────────

test("a rule is a tool name with an optional pattern", () => {
  assert.deepEqual(parseRule("Bash"), { tool: "Bash", pattern: null });
  assert.deepEqual(parseRule("Bash(npm run test:*)"), { tool: "Bash", pattern: "npm run test:*" });
  assert.deepEqual(parseRule("Read( ./src/** )"), { tool: "Read", pattern: "./src/**" });
});

test("a bare tool rule matches every invocation", () => {
  assert.equal(ruleMatches("Bash", "Bash", { command: "anything" }, CWD), true);
  assert.equal(ruleMatches("Bash", "Read", { file_path: "/repo/a" }, CWD), false);
});

test("a bash pattern ending in :* is a command prefix", () => {
  assert.equal(ruleMatches("Bash(npm run test:*)", "Bash", { command: "npm run test -- -w" }, CWD), true);
  assert.equal(ruleMatches("Bash(npm run test:*)", "Bash", { command: "npm run build" }, CWD), false);
});

test("a bash pattern without :* is an exact command", () => {
  assert.equal(ruleMatches("Bash(git status)", "Bash", { command: "git status" }, CWD), true);
  assert.equal(
    ruleMatches("Bash(git status)", "Bash", { command: "git status && rm -rf /" }, CWD),
    false,
    "an exact rule must not be widened by appending to the command"
  );
});

test("path patterns glob against the resolved path", () => {
  assert.equal(ruleMatches("Read(./src/**)", "Read", { file_path: "src/a/b.ts" }, CWD), true);
  assert.equal(ruleMatches("Read(./src/**)", "Read", { file_path: "docs/a.md" }, CWD), false);
  assert.equal(ruleMatches("Read(/repo/src/**)", "Read", { file_path: "/repo/src/x.ts" }, CWD), true);
});

test("globToRegExp handles **, * and ? without letting regex through", () => {
  assert.equal(globToRegExp("**/*.ts").test("a/b/c.ts"), true);
  assert.equal(globToRegExp("**/*.ts").test("c.ts"), true, "**/ should match zero directories");
  assert.equal(globToRegExp("src/*.ts").test("src/a/b.ts"), false, "* must not cross a separator");
  assert.equal(globToRegExp("a?c").test("abc"), true);
  // A dot is a literal, not "any character".
  assert.equal(globToRegExp("a.ts").test("axts"), false);
});

// ── the always-deny list ──────────────────────────────────────────────────────

test("secrets are denied before any configuration is consulted", () => {
  for (const file of [
    "/repo/.env",
    "/repo/.env.production",
    "/repo/deep/nested/.env",
    "/repo/.ssh/id_rsa",
    "/repo/certs/server.pem",
    "/repo/.aws/credentials",
  ]) {
    const decision = evaluate("Read", { file_path: file }, emptyRuleset(), base());
    assert.equal(decision.behavior, "deny", `${file} must be denied`);
  }
});

test("an allow rule cannot override the always-deny list", () => {
  const ruleset = { ...emptyRuleset(), allow: ["Read(**)"] };
  const decision = evaluate("Read", { file_path: "/repo/.env" }, ruleset, base());
  assert.equal(decision.behavior, "deny");
});

test("bypassPermissions cannot override the always-deny list either", () => {
  // A mode that switches off the deny list makes the deny list decorative.
  const decision = evaluate(
    "Read",
    { file_path: "/repo/.env" },
    emptyRuleset(),
    base({ mode: "bypassPermissions" })
  );
  assert.equal(decision.behavior, "deny");
});

test("a traversal cannot walk around the always-deny list", () => {
  const decision = evaluate(
    "Read",
    { file_path: "../../../repo/.env" },
    emptyRuleset(),
    base({ cwd: "/repo/a/b" })
  );
  assert.equal(decision.behavior, "deny");
});

test("the always-deny list is deny-only — it grants nothing", () => {
  assert.deepEqual(ALWAYS_DENY.allow, []);
  assert.deepEqual(ALWAYS_DENY.ask, []);
});

// ── precedence ────────────────────────────────────────────────────────────────

test("deny beats ask beats allow", () => {
  const ruleset = {
    allow: ["Bash(npm test:*)"],
    ask: ["Bash(npm test:*)"],
    deny: ["Bash(npm test:*)"],
  };
  assert.equal(evaluate("Bash", { command: "npm test" }, ruleset, base()).behavior, "deny");

  const noDeny = { ...ruleset, deny: [] };
  assert.equal(evaluate("Bash", { command: "npm test" }, noDeny, base()).behavior, "ask");

  const allowOnly = { ...ruleset, deny: [], ask: [] };
  assert.equal(evaluate("Bash", { command: "npm test" }, allowOnly, base()).behavior, "allow");
});

test("a denial explains itself and names the rule", () => {
  const ruleset = { ...emptyRuleset(), deny: ["Bash(curl:*)"] };
  const decision = evaluate("Bash", { command: "curl example.com" }, ruleset, base());
  assert.equal(decision.behavior, "deny");
  assert.equal(decision.rule, "Bash(curl:*)");
  assert.match(decision.reason, /Bash\(curl:\*\)/);
});

// ── modes ─────────────────────────────────────────────────────────────────────

test("default mode asks before mutating and allows reading", () => {
  assert.equal(evaluate("Write", { file_path: "/repo/a.ts" }, emptyRuleset(), base()).behavior, "ask");
  assert.equal(evaluate("Bash", { command: "ls" }, emptyRuleset(), base()).behavior, "ask");
  assert.equal(evaluate("Read", { file_path: "/repo/a.ts" }, emptyRuleset(), base()).behavior, "allow");
});

test("acceptEdits auto-approves edits but still asks for bash", () => {
  const opts = base({ mode: "acceptEdits" });
  assert.equal(evaluate("Edit", { file_path: "/repo/a.ts" }, emptyRuleset(), opts).behavior, "allow");
  assert.equal(evaluate("Bash", { command: "rm x" }, emptyRuleset(), opts).behavior, "ask");
});

test("plan mode denies everything that would change the tree", () => {
  const opts = base({ mode: "plan" });
  assert.equal(evaluate("Write", { file_path: "/repo/a.ts" }, emptyRuleset(), opts).behavior, "deny");
  assert.equal(evaluate("Bash", { command: "ls" }, emptyRuleset(), opts).behavior, "deny");
  assert.equal(evaluate("Read", { file_path: "/repo/a.ts" }, emptyRuleset(), opts).behavior, "allow");
});

test("bypassPermissions allows what is not denied", () => {
  const opts = base({ mode: "bypassPermissions" });
  assert.equal(evaluate("Bash", { command: "anything" }, emptyRuleset(), opts).behavior, "allow");
});

// ── leaving the project ───────────────────────────────────────────────────────

test("a path outside the project is asked about, never silently allowed", () => {
  const decision = evaluate("Read", { file_path: "/etc/hosts" }, emptyRuleset(), base());
  assert.equal(decision.behavior, "ask");
  assert.match(decision.reason, /outside the project/);
});

test("an allow rule does not silently grant a path outside the project", () => {
  const ruleset = { ...emptyRuleset(), allow: ["Read(/etc/**)"] };
  const decision = evaluate("Read", { file_path: "/etc/hosts" }, ruleset, base());
  assert.equal(decision.behavior, "ask");
});

test("--add-dir makes another directory part of the project", () => {
  const decision = evaluate(
    "Read",
    { file_path: "/other/a.ts" },
    emptyRuleset(),
    base({ additionalDirs: ["/other"] })
  );
  assert.equal(decision.behavior, "allow");
});

// ── "always allow" suggestions ────────────────────────────────────────────────

test("always-allow suggests the narrowest rule the call justifies", () => {
  // A blanket `Bash` from one "yes" is how a permission system stops being one.
  assert.equal(suggestRule("Bash", { command: "npm run test -- -w" }, CWD), "Bash(npm run:*)");
  assert.equal(suggestRule("Read", { file_path: "/repo/src/a/b.ts" }, CWD), "Read(src/a/**)");
  assert.equal(suggestRule("Read", { file_path: "/repo/README.md" }, CWD), "Read(README.md)");
});

test("the suggested rule actually matches the call it came from", () => {
  const input = { command: "npm run test -- -w" };
  const rule = suggestRule("Bash", input, CWD);
  assert.equal(ruleMatches(rule, "Bash", input, CWD), true);
});

// ── settings ──────────────────────────────────────────────────────────────────

test("later layers win for scalars", () => {
  const merged = mergeSettings([
    { name: "user", data: { model: "claude-sonnet-5" } },
    { name: "project", data: { model: "claude-opus-5" } },
  ]);
  assert.equal(merged.model, "claude-opus-5");
  assert.deepEqual(merged.sources, ["user", "project"]);
});

test("permission rules accumulate across layers instead of overriding", () => {
  const merged = mergeSettings([
    { name: "user", data: { permissions: { deny: ["Bash(curl:*)"] } } },
    { name: "project", data: { permissions: { allow: ["Bash(npm test:*)"] } } },
  ]);
  assert.deepEqual(merged.permissions.deny, ["Bash(curl:*)"]);
  assert.deepEqual(merged.permissions.allow, ["Bash(npm test:*)"]);
});

test("a project cannot un-deny what a higher layer denied", () => {
  const merged = mergeSettings([
    { name: "user", data: { permissions: { deny: ["Bash(curl:*)"] } } },
    { name: "project", data: { permissions: { allow: ["Bash(curl:*)"] } } },
  ]);
  const decision = evaluate("Bash", { command: "curl x" }, merged.permissions, base());
  assert.equal(decision.behavior, "deny");
});

test("mergeRulesets de-duplicates and drops blanks", () => {
  const merged = mergeRulesets({ allow: ["Bash", " Bash ", ""] }, { allow: ["Read"] });
  assert.deepEqual(merged.allow, ["Bash", "Read"]);
});

test("a malformed settings file is reported, not swallowed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-settings-"));
  try {
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, "{ not json", "utf8");
    const { data, error } = readSettingsFile(file);
    assert.deepEqual(data, {});
    assert.ok(error, "a parse failure must surface");
    assert.match(error, /settings\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing settings file is not an error", () => {
  const { data, error } = readSettingsFile("/definitely/not/here/settings.json");
  assert.deepEqual(data, {});
  assert.equal(error, null);
});

test("an always-allow rule lands in the gitignored local file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-proj-"));
  try {
    const { file, added } = persistAllowRule(dir, "Bash(npm test:*)");
    assert.equal(added, true);
    assert.match(file, /\.csda\/settings\.local\.json$/);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(written.permissions.allow, ["Bash(npm test:*)"]);

    // Idempotent: answering "always" twice must not stack duplicates.
    const again = persistAllowRule(dir, "Bash(npm test:*)");
    assert.equal(again.added, false);
    const reread = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(reread.permissions.allow.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
