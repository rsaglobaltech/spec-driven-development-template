import { Lockfile } from "../../domain/Lockfile";

export interface WriteOptions {
  dryRun?: boolean;
}

export interface ILockfileRepository {
  /**
   * Reads the Lockfile from persistence.
   * Returns null if the lockfile does not exist.
   */
  readLock(): Lockfile | null;

  /**
   * Writes the Lockfile to persistence.
   * Returns information about the path written.
   */
  writeLock(lock: Lockfile, options?: WriteOptions): { path: string; written: boolean };
}
