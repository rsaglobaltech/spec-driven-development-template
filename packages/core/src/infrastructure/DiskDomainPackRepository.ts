import * as path from "node:path";
import * as fs from "node:fs";
import {
  IDomainPackRepository,
  ResolvePackParams,
} from "../application/ports/IDomainPackRepository";
import { DomainPack, PackRawModel } from "../domain/DomainPack";
import { resolveRemotePack } from "./RemotePackResolver";
import { parseYamlLite } from "../domain/YamlLite";

export class DiskDomainPackRepository implements IDomainPackRepository {
  public loadPackModel(packRoot: string, packId: string): DomainPack {
    const packFile = path.join(path.resolve(packRoot), packId, "pack.yaml");
    if (!fs.existsSync(packFile)) {
      throw new Error(`Pack file not found: ${packFile}`);
    }
    const raw = fs.readFileSync(packFile, "utf8");
    const model = parseYamlLite(raw) as PackRawModel;
    return new DomainPack(packId, model, model.version || "");
  }

  public resolveRemotePack(params: ResolvePackParams): { packRoot: string; commit: string } {
    return resolveRemotePack(params);
  }
}
