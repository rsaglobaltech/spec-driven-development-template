/**
 * Reader for `harness.config.yaml` — optional per-project defaults for
 * `csda harness run`, so the test command and agent invocation do not have
 * to be retyped on every run.
 *
 * Format:
 *   harness_version: 1
 *   agent: "opencode run \"$(cat {prompt_file})\""
 *   test_cmd: "mvn -B test"
 *   max_attempts: 3
 *   concurrency: 1
 *   prompt_prefix: "Role: Lead Architect. Hexagonal arch is non-negotiable."
 *   # or, for a multi-line prefix (parseYamlLite has no block scalar support):
 *   prompt_prefix_file: ./.harness/prompt-prefix.md
 *
 * `prompt_prefix` is prepended to every per-requirement prompt the harness
 * hands the agent. It is the natural home for your universal Role / Active
 * Project Boundary / Execution Policy directives — the bits a hand-crafted
 * "base prompt" used to carry — so they ride along on every REQ without
 * being duplicated.
 *
 * Every key is optional. CLI flags always override the file.
 *
 * Pure-ish module: reads `prompt_prefix_file` when present. No logging, no
 * process.exit. Throws on malformed YAML or a missing prefix file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseYamlLite } from "../domain/YamlLite";
import { HarnessSettings } from "../domain/HarnessConfig";

export const HARNESS_CONFIG_FILE = "harness.config.yaml";

/** Everything `harness run` needs, after the file and the flags are merged. */
// The settings shape is domain, not a property of this file format; re-exported
// so the reader's existing importers keep one import site.
export { HarnessSettings } from "../domain/HarnessConfig";

/** Every key this reader understands. Anything else is rejected, not ignored. */
const KNOWN_KEYS = new Set([
  "harness_version",
  "agent",
  "agent_profile",
  "test_cmd",
  "max_attempts",
  "concurrency",
  "push",
  "remote",
  "pr_cmd",
  "prompt_prefix",
  "prompt_prefix_file",
  "attempt_profiles",
  "review_profile",
  "protected_paths",
  "allow_paths",
  "message_report",
]);

export function readHarnessConfig(projectDir) {
  const filePath = path.join(projectDir, HARNESS_CONFIG_FILE);
  if (!fs.existsSync(filePath)) return null;

  const parsed = parseYamlLite(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${HARNESS_CONFIG_FILE}: root must be a mapping`);
  }

  const config: Partial<HarnessSettings> = {};
  if (parsed.agent !== undefined) config.agent = String(parsed.agent);
  if (parsed.test_cmd !== undefined) config.testCmd = String(parsed.test_cmd);
  if (parsed.max_attempts !== undefined) {
    const n = Number(parsed.max_attempts);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid ${HARNESS_CONFIG_FILE}: max_attempts must be a positive integer`);
    }
    config.maxAttempts = n;
  }

  // How many requirements may be in flight at once. 1 keeps the loop exactly
  // as it has always been — see the comment on `runLevels` in run.ts for why
  // that default is deliberate rather than timid.
  if (parsed.concurrency !== undefined) {
    const n = Number(parsed.concurrency);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid ${HARNESS_CONFIG_FILE}: concurrency must be a positive integer`);
    }
    config.concurrency = n;
  }

  if (parsed.push !== undefined) config.push = parsed.push === true || parsed.push === "true";
  if (parsed.remote !== undefined) config.remote = String(parsed.remote);
  if (parsed.pr_cmd !== undefined) config.prCmd = String(parsed.pr_cmd);

  // prompt_prefix_file wins over inline prompt_prefix when both are set —
  // file is the realistic source for the multi-line bootstrap directives.
  if (parsed.prompt_prefix_file !== undefined) {
    const rel = String(parsed.prompt_prefix_file);
    const abs = path.resolve(projectDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `${HARNESS_CONFIG_FILE}: prompt_prefix_file not found at ${rel} (resolved to ${abs})`
      );
    }
    config.promptPrefix = fs.readFileSync(abs, "utf8");
  } else if (parsed.prompt_prefix !== undefined) {
    config.promptPrefix = String(parsed.prompt_prefix);
  }

  // `agent_profile` names an entry in .harness/profiles.yaml. It exists so a
  // team can commit the agent commands it uses — local, CI, a different vendor
  // — and pick one by name, instead of committing a single default that
  // somebody eventually pays for by accident.
  //
  // An explicit `agent:` wins: the narrower statement beats the indirection.
  // A1: which paths the agent may not modify, and the explicit exceptions.
  // Both are lists of globs; a malformed value is rejected rather than ignored,
  // because a guard that silently protects nothing is worse than no guard.
  if (parsed.protected_paths !== undefined) {
    config.protectedPaths = asStringList(parsed.protected_paths, "protected_paths");
  }
  if (parsed.allow_paths !== undefined) {
    config.allowPaths = asStringList(parsed.allow_paths, "allow_paths");
  }

  // F5: where the runner writes its `--format message` stream, for projects
  // whose test command the harness cannot safely rewrite (`npm test` may well
  // run Cucumber, and there is no way to know from here).
  if (parsed.message_report !== undefined) {
    config.messageReport = String(parsed.message_report);
  }

  if (config.agent === undefined && parsed.agent_profile !== undefined) {
    config.agent = resolveProfileAgent(projectDir, String(parsed.agent_profile));
  }

  // The roles ladder: a profile per attempt, and an advisory reviewer that runs
  // before each retry. Resolved to commands here, once, so a worker process
  // cannot resolve a profile differently from the parent that dispatched it.
  if (parsed.attempt_profiles !== undefined) {
    const names = asStringList(parsed.attempt_profiles, "attempt_profiles");
    config.attemptProfiles = names;
    config.profileAgents = { ...(config.profileAgents || {}) };
    for (const name of names) {
      config.profileAgents[name] = resolveProfileAgent(projectDir, name);
    }
  }

  if (parsed.review_profile !== undefined) {
    const name = String(parsed.review_profile);
    const agent = resolveProfileAgent(projectDir, name);
    if (!isAdvisoryProfile(projectDir, name)) {
      throw new Error(
        `.harness/profiles.yaml: profile '${name}' is used as review_profile but does not ` +
          "declare `advisory: true`.\n" +
          "Fix: add `advisory: true` to it. A reviewer that is not marked advisory would have " +
          "its work gated and committed, which is not what a reviewer is for."
      );
    }
    config.reviewProfile = name;
    config.profileAgents = { ...(config.profileAgents || {}), [name]: agent };
  }

  // Anything left is a key nobody reads. Silently ignoring it is how the HIE
  // pilot ended up configured against a feature that did not exist: the file
  // named a profile, the CLI never looked, and `harness run` reported no agent
  // configured while the config plainly declared one.
  const unknown = Object.keys(parsed).filter((k) => !KNOWN_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `${HARNESS_CONFIG_FILE}: unknown key(s): ${unknown.join(", ")}.\n` +
        `Known keys: ${[...KNOWN_KEYS].sort().join(", ")}.\n` +
        "Fix: remove the key, or correct the spelling. A key nobody reads is worse " +
        "than a missing one, because the file looks configured."
    );
  }

  return config;
}

/**
 * Resolve a named profile from `.harness/profiles.yaml` to its agent command.
 */
function resolveProfileAgent(projectDir, profileName) {
  const profilesPath = path.join(projectDir, ".harness", "profiles.yaml");
  if (!fs.existsSync(profilesPath)) {
    throw new Error(
      `${HARNESS_CONFIG_FILE}: agent_profile '${profileName}' needs .harness/profiles.yaml, ` +
        `which does not exist.\n` +
        "Fix: create it, or set `agent:` directly in harness.config.yaml."
    );
  }
  const doc = parseYamlLite(fs.readFileSync(profilesPath, "utf8")) || {};
  const profiles = doc.profiles || {};
  const profile = profiles[profileName];
  if (!profile || !profile.agent) {
    const available = Object.keys(profiles);
    throw new Error(
      `.harness/profiles.yaml: no profile '${profileName}' with an \`agent\`.\n` +
        (available.length
          ? `Available: ${available.join(", ")}.`
          : "The file declares no profiles.") +
        "\nFix: add the profile, or point agent_profile at one that exists."
    );
  }
  return String(profile.agent);
}

/**
 * Merge file config with CLI args. CLI wins on every key; the file fills gaps.
 */
export function resolveHarnessSettings(
  fileConfig: Partial<HarnessSettings> | null,
  cliArgs: Partial<HarnessSettings>
): HarnessSettings {
  const file = fileConfig || {};
  return {
    agent: cliArgs.agent || file.agent || "",
    testCmd: cliArgs.testCmd || file.testCmd || "",
    maxAttempts: cliArgs.maxAttempts || file.maxAttempts || 3,
    concurrency: cliArgs.concurrency || file.concurrency || 1,
    promptPrefix: cliArgs.promptPrefix || file.promptPrefix || "",
    push: cliArgs.push || file.push || false,
    remote: cliArgs.remote || file.remote || "origin",
    prCmd: cliArgs.prCmd || file.prCmd || "",
    // Roles come from the file only: a ladder is a team decision that belongs
    // in the repository, not a flag somebody types differently each run.
    attemptProfiles: file.attemptProfiles || [],
    reviewProfile: file.reviewProfile || "",
    profileAgents: file.profileAgents || {},
    // From the file only, for the same reason as the role ladder: a flag that
    // widens what the agent may edit is a flag somebody types to go green.
    protectedPaths: file.protectedPaths || [],
    allowPaths: file.allowPaths || [],
    messageReport: file.messageReport || "",
  };
}

/** A YAML value that must be a list of names. */
function asStringList(value, key: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${HARNESS_CONFIG_FILE}: ${key} must be a list of profile names.\n` +
        "Fix: write it as a YAML sequence, one profile per line."
    );
  }
  return value.map((v) => String(v));
}

/** Does this profile declare itself advisory? */
function isAdvisoryProfile(projectDir, profileName): boolean {
  const profilesPath = path.join(projectDir, ".harness", "profiles.yaml");
  const doc = parseYamlLite(fs.readFileSync(profilesPath, "utf8")) || {};
  const profile = ((doc.profiles || {}) as Record<string, any>)[profileName];
  return Boolean(profile && profile.advisory === true);
}
