import * as fs from "node:fs";
import * as path from "node:path";
import { IManifestRepository, WriteOptions } from "../application/ports/IManifestRepository";
import { SpecopsManifest, BaselineEntry } from "../domain/SpecopsManifest";

export class DiskManifestRepository implements IManifestRepository {
  constructor(private projectDir: string) {}

  private get manifestPath(): string {
    return path.join(this.projectDir, SpecopsManifest.DIRNAME, SpecopsManifest.FILENAME);
  }

  private baselineDir(packId: string): string {
    return path.join(
      this.projectDir,
      SpecopsManifest.DIRNAME,
      SpecopsManifest.BASELINE_DIRNAME,
      packId
    );
  }

  public readManifest(): SpecopsManifest | null {
    if (!fs.existsSync(this.manifestPath)) return null;
    const raw = fs.readFileSync(this.manifestPath, "utf8");
    return SpecopsManifest.parse(raw);
  }

  public readBaseline(packId: string, rel: string): string | null {
    const p = path.join(this.baselineDir(packId), rel);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  }

  public writeManifest(
    manifest: SpecopsManifest,
    options: WriteOptions = {}
  ): { path: string; written: boolean } {
    if (options.dryRun) return { path: this.manifestPath, written: false };
    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    fs.writeFileSync(this.manifestPath, `${JSON.stringify(manifest.toJSON(), null, 2)}\n`, "utf8");
    return { path: this.manifestPath, written: true };
  }

  public writeBaselineFiles(
    packId: string,
    entries: readonly BaselineEntry[],
    options: WriteOptions = {}
  ): { written: boolean; count: number } {
    if (options.dryRun) return { written: false, count: 0 };

    const baseDir = this.baselineDir(packId);
    fs.rmSync(baseDir, { recursive: true, force: true });

    let count = 0;
    for (const entry of entries) {
      if (!entry || !entry.rel) continue;
      const dest = path.join(baseDir, entry.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.content, "utf8");
      count++;
    }

    return { written: true, count };
  }
}
