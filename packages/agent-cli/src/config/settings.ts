/**
 * The settings hierarchy.
 *
 * Precedence, highest first:
 *
 *   1. managed policy      /etc/csda-agent/managed-settings.json
 *   2. CLI flags           applied by the caller, not here
 *   3. project local       .csda/settings.local.json     (gitignored)
 *   4. project             .csda/settings.json           (committed)
 *   5. user                ~/.csda/settings.json
 *
 * Scalars take the highest-precedence value. Permission rules **accumulate**
 * across every layer, and `deny` from any layer survives all of them — a
 * project cannot un-deny what policy or the user denied. Without that rule the
 * hierarchy is only a suggestion.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { PermissionMode } from "../engine/types.js";
import { emptyRuleset, mergeRulesets, type Ruleset } from "./permissions.js";

export interface Settings {
  model: string | null;
  permissionMode: PermissionMode | null;
  permissions: Ruleset;
  env: Record<string, string>;
  /** Where each layer came from, for `--verbose` and for debugging. */
  sources: string[];
}

export const MANAGED_PATH = "/etc/csda-agent/managed-settings.json";
export const PROJECT_DIR = ".csda";
export const SETTINGS_FILE = "settings.json";
export const LOCAL_SETTINGS_FILE = "settings.local.json";

export const emptySettings = (): Settings => ({
  model: null,
  permissionMode: null,
  permissions: emptyRuleset(),
  env: {},
  sources: [],
});

export interface RawSettings {
  model?: string;
  permissionMode?: PermissionMode;
  permissions?: Partial<Ruleset>;
  env?: Record<string, string>;
}

export function readSettingsFile(file: string): { data: RawSettings; error: string | null } {
  try {
    if (!fs.existsSync(file)) return { data: {}, error: null };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { data: {}, error: `${file}: expected a JSON object.` };
    }
    return { data: parsed as RawSettings, error: null };
  } catch (err: any) {
    // A malformed settings file must not take the CLI down, but it must be
    // loud: silently running with different permissions than the file says is
    // the worst outcome available here.
    return { data: {}, error: `${file}: ${err?.message ?? String(err)}` };
  }
}

/**
 * Merge layers, lowest precedence first.
 *
 * Exposed separately from the filesystem walk so precedence can be tested
 * without writing files.
 */
export function mergeSettings(layers: Array<{ name: string; data: RawSettings }>): Settings {
  const result = emptySettings();

  for (const layer of layers) {
    const { data } = layer;
    if (Object.keys(data).length > 0) result.sources.push(layer.name);
    if (typeof data.model === "string") result.model = data.model;
    if (typeof data.permissionMode === "string") result.permissionMode = data.permissionMode;
    if (data.env && typeof data.env === "object") Object.assign(result.env, data.env);
  }

  // Rules accumulate rather than override: a project adding an allow must not
  // erase a deny the user or policy set.
  result.permissions = mergeRulesets(...layers.map((l) => l.data.permissions));
  return result;
}

export interface LoadOptions {
  cwd: string;
  home?: string;
  managedPath?: string;
}

export function loadSettings(options: LoadOptions): { settings: Settings; errors: string[] } {
  const home = options.home ?? os.homedir();
  const managed = options.managedPath ?? MANAGED_PATH;
  const errors: string[] = [];

  const layer = (name: string, file: string) => {
    const { data, error } = readSettingsFile(file);
    if (error) errors.push(error);
    return { name, data };
  };

  // Lowest precedence first; `mergeSettings` lets later layers win.
  const layers = [
    layer("user", path.join(home, PROJECT_DIR, SETTINGS_FILE)),
    layer("project", path.join(options.cwd, PROJECT_DIR, SETTINGS_FILE)),
    layer("local", path.join(options.cwd, PROJECT_DIR, LOCAL_SETTINGS_FILE)),
    layer("managed", managed),
  ];

  return { settings: mergeSettings(layers), errors };
}

/**
 * Persist a rule the user accepted with "always allow".
 *
 * Goes to `settings.local.json` — a decision one developer made on one machine
 * is not a decision for the whole team, and the local file is gitignored.
 */
export function persistAllowRule(cwd: string, rule: string): { file: string; added: boolean } {
  const dir = path.join(cwd, PROJECT_DIR);
  const file = path.join(dir, LOCAL_SETTINGS_FILE);
  const { data } = readSettingsFile(file);

  const permissions = data.permissions ?? {};
  const allow = Array.isArray(permissions.allow) ? permissions.allow.slice() : [];
  if (allow.includes(rule)) return { file, added: false };
  allow.push(rule);

  const next = { ...data, permissions: { ...permissions, allow } };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { file, added: true };
}
