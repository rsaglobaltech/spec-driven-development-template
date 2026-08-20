import * as fs from "node:fs";
import * as path from "node:path";
import { ILockfileRepository, WriteOptions } from "../application/ports/ILockfileRepository";
import { Lockfile } from "../domain/Lockfile";

export class DiskLockfileRepository implements ILockfileRepository {
  constructor(private projectDir: string) {}

  public readLock(): Lockfile | null {
    const lockPath = path.join(this.projectDir, Lockfile.FILENAME);
    if (!fs.existsSync(lockPath)) return null;
    const raw = fs.readFileSync(lockPath, "utf8");
    return Lockfile.parse(raw);
  }

  public writeLock(lock: Lockfile, options: WriteOptions = {}): { path: string; written: boolean } {
    const lockPath = path.join(this.projectDir, Lockfile.FILENAME);
    const json = `${JSON.stringify(lock.toJSON(), null, 2)}\n`;

    if (options.dryRun) {
      return { path: lockPath, written: false };
    }

    fs.mkdirSync(this.projectDir, { recursive: true });
    fs.writeFileSync(lockPath, json, "utf8");
    return { path: lockPath, written: true };
  }
}
