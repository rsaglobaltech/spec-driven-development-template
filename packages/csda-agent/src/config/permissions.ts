/**
 * The permission engine.
 *
 * A rule is `Tool` or `Tool(pattern)`. Three buckets — `deny`, `ask`, `allow` —
 * evaluated in that order, and **deny always wins**, including under
 * `bypassPermissions`. A mode that can switch off the deny list is a mode that
 * makes the deny list decorative.
 *
 * Pattern semantics depend on the tool, because "does this match?" means
 * different things for a shell command and a file path:
 *
 *   Bash(npm run test:*)   prefix match on the command, `:*` = "and anything after"
 *   Bash(git status)       exact command
 *   Read(./src/**)         glob on the resolved path
 *   Write                  bare tool name: every invocation
 *
 * **This engine decides; it does not sandbox.** Tool execution belongs to the
 * Agent SDK, which runs the command. What we control is whether the call is
 * allowed to happen at all — so the checks here are about intent (is this
 * command in scope, is this path inside the project), and they are the last
 * line before the SDK acts, not a substitute for the SDK's own isolation.
 */

import * as path from "node:path";
import type { PermissionMode } from "../engine/types.js";

export type Behavior = "allow" | "ask" | "deny";

export interface Ruleset {
  allow: string[];
  ask: string[];
  deny: string[];
}

export const emptyRuleset = (): Ruleset => ({ allow: [], ask: [], deny: [] });

export interface Decision {
  behavior: Behavior;
  /** Why, in one sentence — shown in the prompt and in the denial message. */
  reason: string;
  /** The rule that decided it, when a rule did. */
  rule?: string;
}

/**
 * Denied for everyone, always, before any configuration is read.
 *
 * Reading a `.env` or an SSH key is not a judgement call that belongs to a
 * permission prompt: the content ends up in the model's context and in the
 * session transcript, and no answer is worth that. These are matched against
 * the resolved path so `../../.env` cannot walk around them.
 */
export const ALWAYS_DENY: Ruleset = {
  allow: [],
  ask: [],
  deny: [
    "Read(**/.env)",
    "Read(**/.env.*)",
    "Read(**/.ssh/**)",
    "Read(**/id_rsa*)",
    "Read(**/id_ed25519*)",
    "Read(**/*.pem)",
    "Read(**/credentials)",
    "Read(**/.aws/**)",
    "Read(**/.npmrc)",
    "Bash(rm -rf /:*)",
    "Bash(:(){ :|:& };::*)",
  ],
};

/** File-ish tools whose pattern is a path glob. */
const PATH_TOOLS = new Set(["Read", "Write", "Edit", "NotebookEdit", "Glob", "Grep"]);
/** Tools that change the working tree. */
const MUTATING_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

export function parseRule(rule: string): { tool: string; pattern: string | null } {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/s.exec(rule.trim());
  if (!match) return { tool: rule.trim(), pattern: null };
  return { tool: match[1], pattern: match[2] === undefined ? null : match[2].trim() };
}

/**
 * Translate a glob to a regex.
 *
 * Supports `**` (any depth), `*` (within a segment) and `?`. Everything else is
 * escaped — a pattern is a pattern, not a regex the user can inject into.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` should also match zero directories, so `**/x` matches `x`.
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** The path a tool call is about to touch, resolved against the project root. */
export function targetPath(input: unknown, cwd: string): string | null {
  const record = (input ?? {}) as Record<string, unknown>;
  for (const key of ["file_path", "path", "notebook_path"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return path.resolve(cwd, value);
    }
  }
  return null;
}

function commandOf(input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>;
  return typeof record.command === "string" ? record.command.trim() : "";
}

/** Does one rule cover this call? */
export function ruleMatches(rule: string, toolName: string, input: unknown, cwd: string): boolean {
  const { tool, pattern } = parseRule(rule);
  if (tool !== toolName) return false;
  if (pattern === null || pattern === "") return true;

  if (toolName === "Bash") {
    const command = commandOf(input);
    if (pattern.endsWith(":*")) {
      return command.startsWith(pattern.slice(0, -2));
    }
    return command === pattern;
  }

  if (PATH_TOOLS.has(toolName)) {
    const target = targetPath(input, cwd);
    if (target === null) return false;
    // Patterns may be written relative (./src/**) or absolute; compare both
    // against the resolved path so either spelling works.
    const absolute = pattern.startsWith("/") ? pattern : path.resolve(cwd, pattern);
    return globToRegExp(absolute).test(target) || globToRegExp(pattern).test(target);
  }

  // Anything else: substring on the serialised input is too loose to be a
  // security control, so an unrecognised tool only matches by bare name.
  return false;
}

function firstMatch(rules: string[], toolName: string, input: unknown, cwd: string): string | null {
  for (const rule of rules) {
    if (ruleMatches(rule, toolName, input, cwd)) return rule;
  }
  return null;
}

export interface EvaluateOptions {
  cwd: string;
  mode: PermissionMode;
  /** Extra directories the user opened with --add-dir. */
  additionalDirs?: string[];
}

/**
 * Decide what should happen to one tool call.
 *
 * Order: always-deny → deny → ask → allow → mode default. The first three are
 * config; the last is the mode the user is in.
 */
export function evaluate(
  toolName: string,
  input: unknown,
  ruleset: Ruleset,
  options: EvaluateOptions
): Decision {
  const { cwd, mode } = options;

  const hardDeny = firstMatch(ALWAYS_DENY.deny, toolName, input, cwd);
  if (hardDeny) {
    return {
      behavior: "deny",
      rule: hardDeny,
      reason: "Reading secrets into the model's context is never allowed.",
    };
  }

  // A path outside the project (or an explicitly opened directory) is a prompt,
  // never a silent allow — the agent wandering out of the checkout is exactly
  // what a reviewer would want to be asked about.
  const escaped = escapesProject(toolName, input, cwd, options.additionalDirs ?? []);

  const denied = firstMatch(ruleset.deny, toolName, input, cwd);
  if (denied) {
    return { behavior: "deny", rule: denied, reason: `Denied by rule ${denied}.` };
  }

  const asked = firstMatch(ruleset.ask, toolName, input, cwd);
  if (asked) {
    return { behavior: "ask", rule: asked, reason: `Rule ${asked} asks for confirmation.` };
  }

  const allowed = firstMatch(ruleset.allow, toolName, input, cwd);
  if (allowed && !escaped) {
    return { behavior: "allow", rule: allowed, reason: `Allowed by rule ${allowed}.` };
  }

  if (escaped) {
    return {
      behavior: "ask",
      reason: `${toolName} targets a path outside the project.`,
    };
  }

  switch (mode) {
    case "bypassPermissions":
      // Deny rules were already applied above and still stand.
      return { behavior: "allow", reason: "bypassPermissions is on." };
    case "plan":
      if (MUTATING_TOOLS.has(toolName) || toolName === "Bash") {
        return { behavior: "deny", reason: "Plan mode does not change anything." };
      }
      return { behavior: "allow", reason: "Read-only tool in plan mode." };
    case "acceptEdits":
      if (MUTATING_TOOLS.has(toolName)) {
        return { behavior: "allow", reason: "acceptEdits auto-approves file edits." };
      }
      return { behavior: "ask", reason: `${toolName} needs confirmation.` };
    case "default":
    default:
      if (MUTATING_TOOLS.has(toolName) || toolName === "Bash") {
        return { behavior: "ask", reason: `${toolName} needs confirmation.` };
      }
      return { behavior: "allow", reason: "Read-only tool." };
  }
}

function escapesProject(
  toolName: string,
  input: unknown,
  cwd: string,
  additionalDirs: string[]
): boolean {
  if (!PATH_TOOLS.has(toolName)) return false;
  const target = targetPath(input, cwd);
  if (target === null) return false;
  const roots = [cwd, ...additionalDirs].map((dir) => path.resolve(dir));
  return !roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`));
}

/**
 * The rule to persist when the user answers "always allow".
 *
 * Scoped as narrowly as the call allows: a specific file, or a bash command
 * prefix up to its first argument. A blanket `Bash` from one "yes" is how a
 * permission system quietly stops being one.
 */
export function suggestRule(toolName: string, input: unknown, cwd: string): string {
  if (toolName === "Bash") {
    const command = commandOf(input);
    const words = command.split(/\s+/).filter(Boolean);
    const prefix = words.slice(0, Math.min(2, words.length)).join(" ");
    return prefix ? `Bash(${prefix}:*)` : "Bash";
  }
  if (PATH_TOOLS.has(toolName)) {
    const target = targetPath(input, cwd);
    if (target) {
      const relative = path.relative(cwd, target);
      const dir = path.dirname(relative);
      return dir === "." || dir === "" ? `${toolName}(${relative})` : `${toolName}(${dir}/**)`;
    }
  }
  return toolName;
}

/** Later sources win, except in `deny`, which only ever accumulates. */
export function mergeRulesets(...sets: Array<Partial<Ruleset> | null | undefined>): Ruleset {
  const merged = emptyRuleset();
  for (const set of sets) {
    if (!set) continue;
    if (Array.isArray(set.allow)) merged.allow.push(...set.allow);
    if (Array.isArray(set.ask)) merged.ask.push(...set.ask);
    if (Array.isArray(set.deny)) merged.deny.push(...set.deny);
  }
  return {
    allow: dedupe(merged.allow),
    ask: dedupe(merged.ask),
    deny: dedupe(merged.deny),
  };
}

const dedupe = (values: string[]) => Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
