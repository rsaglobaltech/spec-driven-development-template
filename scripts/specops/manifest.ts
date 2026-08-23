import { DiskManifestRepository } from "../../packages/core/src/infrastructure/DiskManifestRepository";
import { SpecopsManifest, BaselineEntry } from "../../packages/core/src/domain/SpecopsManifest";
import * as path from "node:path";

export const SPECOPS_DIR = SpecopsManifest.DIRNAME;
export const BASELINE_DIRNAME = SpecopsManifest.BASELINE_DIRNAME;
export const MANIFEST_FILENAME = SpecopsManifest.FILENAME;
export const MANIFEST_VERSION = SpecopsManifest.CURRENT_MANIFEST_VERSION;

export function manifestPath(projectDir: string): string {
  return path.join(projectDir, SPECOPS_DIR, MANIFEST_FILENAME);
}

export function baselineDir(projectDir: string, packId: string): string {
  return path.join(projectDir, SPECOPS_DIR, BASELINE_DIRNAME, packId);
}

export function sha256(content: string): string {
  return SpecopsManifest.sha256(content);
}

export function newManifest(): any {
  return SpecopsManifest.createEmpty().toJSON();
}

export interface WriteOptions {
  dryRun?: boolean;
}

export function readManifest(projectDir: string): any {
  const repo = new DiskManifestRepository(projectDir);
  const manifest = repo.readManifest();
  return manifest ? manifest.toJSON() : null;
}

export function writeManifest(
  projectDir: string,
  manifestJson: any,
  options: WriteOptions = {}
): { path: string; written: boolean } {
  const repo = new DiskManifestRepository(projectDir);
  const manifest = manifestJson
    ? new SpecopsManifest(manifestJson.specops_manifest_version, manifestJson.packs || {})
    : SpecopsManifest.createEmpty();

  return repo.writeManifest(manifest, options);
}

export function readBaseline(projectDir: string, packId: string, rel: string): string | null {
  const repo = new DiskManifestRepository(projectDir);
  return repo.readBaseline(packId, rel);
}

export function snapshotBaseline(
  projectDir: string,
  packId: string,
  entries: readonly BaselineEntry[] | null | undefined,
  meta: Record<string, unknown> = {},
  options: WriteOptions = {}
): { written: boolean; count: number } {
  const repo = new DiskManifestRepository(projectDir);
  const result = repo.writeBaselineFiles(packId, entries || [], options);

  if (!options.dryRun) {
    const manifest = repo.readManifest() || SpecopsManifest.createEmpty();
    manifest.updatePackBaseline(packId, (meta.version as string) || "", entries || []);
    repo.writeManifest(manifest);
  }

  return result;
}
