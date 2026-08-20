import { DomainPack } from "../../domain/DomainPack";

export interface ResolvePackParams {
  repo: string;
  version: string;
  cacheDir?: string;
}

export interface IDomainPackRepository {
  /**
   * Loads a pack model from local filesystem or pack root.
   */
  loadPackModel(packRoot: string, packId: string): DomainPack;

  /**
   * Resolves a remote pack to a local directory.
   */
  resolveRemotePack(params: ResolvePackParams): { packRoot: string; commit: string };
}
