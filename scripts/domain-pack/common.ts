#!/usr/bin/env node

/**
 * The pack tooling's CLI-facing surface.
 *
 * What a pack must satisfy is domain (`core/domain/PackSpec`) and reading or
 * writing one is infrastructure (`core/infrastructure/DiskPackRepository`).
 * What stays here is the delivery layer — argument parsing and the two log
 * helpers — plus the re-exports that keep this module the one import site the
 * pack commands already use.
 */

import * as fs from "node:fs";

import { validatePackModel as validatePackSpec } from "../../packages/core/src/domain/PackSpec";

export { logInfo, logError } from "../../packages/core/src/infrastructure/ConsoleReporter";

/** Pack rule violations are thrown, and the command layer turns them into output. */
function fail(message): never {
  throw new Error(message);
}

export { parseYamlLite, YamlDocument, PackModel } from "../../packages/core/src/domain/YamlLite";
export {
  parseTraceabilityRows,
  buildTraceabilityMarkdown,
} from "../../packages/core/src/domain/TraceabilityFormat";
export {
  PACK_SCHEMA_VERSION,
  PACK_PROJECT_TYPES,
  ALLOWED_STATUSES,
  isNewerThan,
  asArray,
  formatList,
  entityLabel,
  hasStructuredDomainModel,
  renderTemplate,
  normalizeVars,
  isSafeRelativePath,
} from "../../packages/core/src/domain/PackSpec";
export {
  loadPack,
  ensureProjectDir,
  readTemplate,
  writeFile,
  getWrittenFiles,
  resetWrittenFiles,
  safeResolve,
} from "../../packages/core/src/infrastructure/DiskPackRepository";

/**
 * The pack rules, with the one filesystem question they ask wired to the real
 * disk. Callers keep the two-argument form they have always used.
 */
export function validatePackModel(pack, packRoot) {
  return validatePackSpec(pack, packRoot, (absolute) => fs.existsSync(absolute));
}

export function parseArgs(argv) {
  const args = {
    packRoot: "",
    pack: "",
    projectDir: "",
    dryRun: false,
    noExamples: false,
    vars: {},
    packRepo: "",
    packVersion: "",
    cacheDir: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--pack-root") {
      args.packRoot = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack") {
      args.pack = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--project-dir") {
      args.projectDir = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack-repo") {
      args.packRepo = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack-version") {
      args.packVersion = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--cache-dir") {
      args.cacheDir = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--no-examples") {
      args.noExamples = true;
      continue;
    }

    if (token === "--var") {
      const pair = argv[i + 1] || "";
      i += 1;
      const eq = pair.indexOf("=");
      if (eq < 1) {
        fail(`Invalid --var value '${pair}'. Use KEY=VALUE.`);
      }

      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      args.vars[key] = value;
      continue;
    }

    fail(`Unknown argument: ${token}`);
  }

  return args;
}
