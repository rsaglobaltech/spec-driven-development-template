import * as fs from "node:fs";
import * as path from "node:path";
import { ITraceabilityRepository } from "../application/ports/ITraceabilityRepository";

export class DiskTraceabilityRepository implements ITraceabilityRepository {
  public readTraceability(projectDir: string): string | null {
    const tracePath = path.join(projectDir, "docs/specs/traceability.md");
    if (!fs.existsSync(tracePath)) return null;
    return fs.readFileSync(tracePath, "utf8");
  }

  public writeTraceability(projectDir: string, content: string): void {
    const tracePath = path.join(projectDir, "docs/specs/traceability.md");
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.writeFileSync(tracePath, content, "utf8");
  }
}
