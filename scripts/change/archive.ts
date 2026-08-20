import * as path from "node:path";
import { DiskProjectRepository } from "../../packages/core/src/infrastructure/DiskProjectRepository";
import { ArchiveChangeUseCase } from "../../packages/core/src/application/ArchiveChangeUseCase";
import { TraceabilityMatrix } from "../../packages/core/src/domain/TraceabilityMatrix";

export function planArchive(projectDir: string, changeId: string, opts?: any) {
  const repo = new DiskProjectRepository(projectDir);
  const useCase = new ArchiveChangeUseCase(repo);
  const plan = useCase.execute(changeId, opts);
  plan.projectDir = projectDir;
  return plan;
}

export function executeArchive(plan: any) {
  const repo = new DiskProjectRepository(plan.projectDir || ".");
  repo.executePlan(plan);
  const archivedAs = plan.move ? path.basename(plan.move.to) : undefined;
  return {
    archivedAs,
    specsUpdated: plan.totals.specsWritten > 0 || plan.totals.specsRetired > 0,
    totals: plan.totals,
    warnings: plan.warnings,
  };
}

export function syncTraceability(
  existing: string | null,
  applied: { upserts: any[]; removals: string[] }
) {
  return TraceabilityMatrix.syncTraceability(existing, applied);
}

export function traceRow(req: any) {
  return TraceabilityMatrix.traceRow(req);
}
