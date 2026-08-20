/**
 * `validate --against-lock` — the drift gate.
 *
 * Checks the project's traceability matrix against locked domain packs.
 */

import * as fs from "node:fs";
import { parseTraceabilityRows } from "../domain-pack/common";
import { paths } from "../change/common";
import { error, warning, info } from "../lib/diagnostics";
import { DiskLockfileRepository } from "../../packages/core/src/infrastructure/DiskLockfileRepository";
import { DiskDomainPackRepository } from "../../packages/core/src/infrastructure/DiskDomainPackRepository";
import { CheckAgainstLockUseCase } from "../../packages/core/src/application/CheckAgainstLockUseCase";

/** Strip the backticks the generated matrix wraps paths in. */
export function bare(value: any): string {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .replace(/^`|`$/g, "");
}

/**
 * Run the gate for every pack in the lockfile using the Clean Architecture Use Case.
 */
export function checkAgainstLock(
  projectDir: string,
  opts?: any
): { checked: number; diagnostics: any[] } {
  const traceabilityFile = paths(projectDir).traceability;
  const matrix = fs.existsSync(traceabilityFile)
    ? parseTraceabilityRows(fs.readFileSync(traceabilityFile, "utf8"))
    : { mode: "rich", rows: [] };

  const isLegacy = matrix.mode !== "rich";
  const rows = isLegacy ? null : matrix.rows;

  const lockRepo = new DiskLockfileRepository(projectDir);
  const packRepo = new DiskDomainPackRepository();
  const useCase = new CheckAgainstLockUseCase(lockRepo, packRepo);

  const result = useCase.execute(rows, isLegacy, opts);

  // Convert to full diagnostics
  const diagnostics = result.diagnostics.map((d) => {
    if (d.severity === "error") {
      return error(d.code, d.message, { target: d.target, fix: d.fix });
    }
    if (d.severity === "warning") {
      return warning(d.code, d.message, { target: d.target, fix: d.fix });
    }
    return info(d.code, d.message, { target: d.target, fix: d.fix });
  });

  return { checked: result.checked, diagnostics };
}

import { DomainPack } from "../../packages/core/src/domain/DomainPack";

export function checkPackAgainstProject(pack: any, entry: any, matrixRows: any[]): any[] {
  const domainPack = new DomainPack(entry.pack_id || "", pack, entry.version || "");
  const lockRepo: any = { readLock: () => null };
  const packRepo: any = { resolveRemotePack: () => ({ packRoot: "", commit: "" }) };
  const useCase = new CheckAgainstLockUseCase(lockRepo, packRepo);
  const rawDiags = (useCase as any).checkPackAgainstMatrix(domainPack, entry, matrixRows);
  return rawDiags.map((d: any) => {
    if (d.severity === "error") {
      return error(d.code, d.message, { target: d.target, fix: d.fix });
    }
    if (d.severity === "warning") {
      return warning(d.code, d.message, { target: d.target, fix: d.fix });
    }
    return info(d.code, d.message, { target: d.target, fix: d.fix });
  });
}
