import { ILockfileRepository } from "./ports/ILockfileRepository";

export interface RemovePackResult {
  ok: boolean;
  message: string;
  removedCount: number;
}

export class RemovePackUseCase {
  constructor(private lockRepo: ILockfileRepository) {}

  public execute(packId: string, options: { dryRun?: boolean } = {}): RemovePackResult {
    const lock = this.lockRepo.readLock();

    if (!lock) {
      return { ok: false, message: "No lockfile found. Nothing to remove.", removedCount: 0 };
    }

    const before = lock.packs.length;
    const remaining = lock.packs.filter((p) => p.pack_id !== packId);
    const removedCount = before - remaining.length;

    if (removedCount === 0) {
      return { ok: false, message: `Pack "${packId}" not found in lockfile.`, removedCount: 0 };
    }

    lock.packs = remaining;

    if (!options.dryRun) {
      this.lockRepo.writeLock(lock);
    }

    return { ok: true, message: `Removed ${removedCount} entry for "${packId}".`, removedCount };
  }
}
