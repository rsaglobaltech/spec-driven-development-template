/**
 * Reading packs and writing expanded files.
 *
 * The rules a pack must satisfy live in `domain/PackSpec`; this is the half
 * that touches a disk — loading `pack.yaml`, reading a template, writing an
 * expanded file, and refusing to write outside the project root.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseYamlLite } from "../domain/YamlLite";
import { isSafeRelativePath } from "../domain/PackSpec";
import { logInfo } from "./ConsoleReporter";

function fail(message): never {
  throw new Error(message);
}

export function loadPack(packRoot, packId) {
  if (!packRoot) fail("Missing --pack-root <path>.");
  if (!packId) fail("Missing --pack <domain/type>.");

  const normalizedRoot = path.resolve(packRoot);
  const normalizedPackPath = path.resolve(normalizedRoot, packId);
  const packFile = path.join(normalizedPackPath, "pack.yaml");

  if (!normalizedPackPath.startsWith(normalizedRoot)) {
    fail(`Invalid pack path '${packId}'.`);
  }

  if (!fs.existsSync(packFile)) {
    fail(`Pack file not found: ${packFile}`);
  }

  const pack = parseYamlLite(fs.readFileSync(packFile, "utf8"));

  return {
    pack,
    packFile,
    packRoot: normalizedPackPath,
  };
}
export function ensureProjectDir(projectDir, dryRun) {
  if (!projectDir) {
    fail("Missing --project-dir <path>.");
  }

  if (dryRun) return;

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    fail(`Project directory does not exist: ${projectDir}`);
  }
}

export function readTemplate(packRoot, templatePath) {
  return fs.readFileSync(path.resolve(packRoot, templatePath), "utf8");
}

// Records every file written in the current process so `expand` can snapshot
// a baseline after rendering. Reset per expansion via resetWrittenFiles().
const _writtenFiles = [];

export function writeFile(targetFile, content, dryRun) {
  if (dryRun) {
    logInfo(`[dry-run] write ${targetFile}`);
    return;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content, "utf8");
  _writtenFiles.push({ file: targetFile, content });
}

export function getWrittenFiles() {
  return _writtenFiles.slice();
}

export function resetWrittenFiles() {
  _writtenFiles.length = 0;
}

export function safeResolve(projectDir, relativePath) {
  if (!isSafeRelativePath(relativePath)) {
    fail(`Invalid target path '${relativePath}'.`);
  }

  const absolute = path.resolve(projectDir, relativePath);
  const projectRoot = path.resolve(projectDir);
  if (!absolute.startsWith(projectRoot)) {
    fail(`Target path escapes project directory: '${relativePath}'.`);
  }

  return absolute;
}
