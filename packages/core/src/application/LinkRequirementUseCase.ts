import { ITraceabilityRepository } from "./ports/ITraceabilityRepository";
import { TraceabilityMatrix } from "../domain/TraceabilityMatrix";

export interface LinkFields {
  featureFile?: string;
  useCase?: string;
  command?: string;
  aggregate?: string;
  event?: string;
  technicalArtifact?: string;
  testArtifact?: string;
  scenarioId?: string;
  [key: string]: any;
}

export interface LinkResult {
  ok: boolean;
  updated: number;
  error?: string;
}

export class LinkRequirementUseCase {
  constructor(
    private traceRepo: ITraceabilityRepository,
    private columnMap: Record<string, number>
  ) {}

  public execute(projectDir: string, reqId: string, fields: LinkFields): LinkResult {
    const rawContent = this.traceRepo.readTraceability(projectDir);
    if (!rawContent) {
      return { ok: false, updated: 0, error: "Traceability matrix not found." };
    }

    const { content, updated } = TraceabilityMatrix.updateRequirementFields(
      rawContent,
      reqId,
      fields,
      this.columnMap
    );

    if (updated > 0) {
      this.traceRepo.writeTraceability(projectDir, content);
    }

    return { ok: updated > 0, updated };
  }
}
