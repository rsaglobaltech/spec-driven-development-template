import * as crypto from "node:crypto";

export interface BaselineEntry {
  rel: string;
  content: string;
}

export interface PackManifestInfo {
  version: string;
  files: Record<string, string>;
}

export class SpecopsManifest {
  public static readonly CURRENT_MANIFEST_VERSION = 1;
  public static readonly DIRNAME = ".specops";
  public static readonly BASELINE_DIRNAME = "baseline";
  public static readonly FILENAME = "manifest.json";

  public constructor(
    public specops_manifest_version: number,
    public packs: Record<string, PackManifestInfo>
  ) {}

  public static createEmpty(): SpecopsManifest {
    return new SpecopsManifest(SpecopsManifest.CURRENT_MANIFEST_VERSION, {});
  }

  public static parse(raw: string): SpecopsManifest {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(
        `Invalid ${SpecopsManifest.DIRNAME}/${SpecopsManifest.FILENAME}: ${err.message}`
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        `Invalid ${SpecopsManifest.DIRNAME}/${SpecopsManifest.FILENAME}: root must be an object`
      );
    }

    const packs =
      parsed.packs && typeof parsed.packs === "object" && !Array.isArray(parsed.packs)
        ? parsed.packs
        : {};

    return new SpecopsManifest(
      parsed.specops_manifest_version || SpecopsManifest.CURRENT_MANIFEST_VERSION,
      packs
    );
  }

  public static sha256(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  public updatePackBaseline(
    packId: string,
    version: string,
    entries: readonly BaselineEntry[]
  ): void {
    if (!packId) throw new Error("updatePackBaseline: packId is required");

    const hashes: Record<string, string> = {};
    for (const entry of entries) {
      if (!entry || !entry.rel) continue;
      hashes[entry.rel] = SpecopsManifest.sha256(entry.content);
    }

    this.packs[packId] = { version: version || "", files: hashes };
  }

  public toJSON(): any {
    return {
      specops_manifest_version: this.specops_manifest_version,
      packs: this.packs,
    };
  }
}
