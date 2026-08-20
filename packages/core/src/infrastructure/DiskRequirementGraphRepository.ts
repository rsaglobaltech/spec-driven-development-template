import * as fs from "node:fs";
import * as path from "node:path";

import { IRequirementGraphRepository } from "../application/ports/IRequirementGraphRepository";
import { splitDependencies } from "../domain/RequirementGraph";
import { parseSpec } from "../domain/SpecParser";
import { CAPABILITIES_DIR } from "./ChangeWorkspace";

// Where capability specs live is the change workspace's fact, stated once there.
export { CAPABILITIES_DIR } from "./ChangeWorkspace";

const REQ_ID = /^REQ-[A-Za-z0-9.]+$/;

/**
 * Read every capability spec and return what each requirement declares.
 *
 * A capability whose spec does not parse is `validate`'s problem to report,
 * not this function's to crash on.
 */
export function readDeclaredDependencies(projectDir: string): Record<string, string[]> {
  const root = path.join(projectDir, CAPABILITIES_DIR);
  const declared: Record<string, string[]> = {};
  if (!fs.existsSync(root)) return declared;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const specPath = path.join(root, entry.name, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    for (const [id, deps] of readSpecDependencies(specPath)) declared[id] = deps;
  }
  return declared;
}

function readSpecDependencies(specPath: string): Array<[string, string[]]> {
  let parsed: { requirements?: Array<{ id?: string; trace?: Record<string, string> }> };
  try {
    parsed = parseSpec(fs.readFileSync(specPath, "utf8"));
  } catch {
    return [];
  }

  const found: Array<[string, string[]]> = [];
  for (const req of parsed.requirements ?? []) {
    const id = req.id ? String(req.id).toUpperCase() : "";
    if (!REQ_ID.test(id)) continue;
    const raw = req.trace?.depends;
    if (!raw) continue;
    const deps = splitDependencies(raw);
    if (deps.length > 0) found.push([id, deps]);
  }
  return found;
}
/** Reads the declarations straight off the project's capability specs. */
export class DiskRequirementGraphRepository implements IRequirementGraphRepository {
  public readDeclaredDependencies(projectDir: string): Record<string, string[]> {
    return readDeclaredDependencies(projectDir);
  }
}
