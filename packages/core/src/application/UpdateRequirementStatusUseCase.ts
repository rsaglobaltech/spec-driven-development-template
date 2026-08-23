import { ITraceabilityRepository } from "./ports/ITraceabilityRepository";
import { TraceabilityMatrix } from "../domain/TraceabilityMatrix";

export interface UpdateStatusResult {
  ok: boolean;
  updated: number;
  error?: string;
  code?: string;
}

export class UpdateRequirementStatusUseCase {
  constructor(private traceRepo: ITraceabilityRepository) {}

  public execute(projectDir: string, reqId: string, newStatus: string): UpdateStatusResult {
    const original = this.traceRepo.readTraceability(projectDir);
    if (!original) {
      return {
        ok: false,
        updated: 0,
        code: "traceability_not_found",
        error: `docs/specs/traceability.md not found in ${projectDir}`,
      };
    }

    const { content, updated } = TraceabilityMatrix.updateStatus(original, reqId, newStatus);
    if (updated === 0) {
      return {
        ok: false,
        updated: 0,
        code: "requirement_not_in_matrix",
        error: `${reqId} not found in traceability.md.`,
      };
    }

    this.traceRepo.writeTraceability(projectDir, content);
    return {
      ok: true,
      updated,
    };
  }
}
