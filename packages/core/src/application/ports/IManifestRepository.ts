import { SpecopsManifest, BaselineEntry } from "../../domain/SpecopsManifest";

export interface WriteOptions {
  dryRun?: boolean;
}

export interface IManifestRepository {
  /**
   * Reads the Manifest from persistence.
   * Returns null if the manifest does not exist.
   */
  readManifest(): SpecopsManifest | null;

  /**
   * Reads a single baseline file's content.
   * Returns content string or null when no baseline is recorded for it.
   */
  readBaseline(packId: string, rel: string): string | null;

  /**
   * Writes the Manifest to persistence.
   */
  writeManifest(
    manifest: SpecopsManifest,
    options?: WriteOptions
  ): { path: string; written: boolean };

  /**
   * Writes the physical baseline files for a specific pack to the filesystem,
   * overwriting the pack's previous baseline tree.
   */
  writeBaselineFiles(
    packId: string,
    entries: readonly BaselineEntry[],
    options?: WriteOptions
  ): { written: boolean; count: number };
}
