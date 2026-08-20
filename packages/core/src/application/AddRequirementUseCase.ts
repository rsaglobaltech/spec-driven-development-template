import { ITraceabilityRepository } from "./ports/ITraceabilityRepository";
import { TraceabilityMatrix } from "../domain/TraceabilityMatrix";
import { parseTraceabilityRows } from "../domain/TraceabilityFormat";

export interface AddRequirementFields {
  requirement?: string;
  scenarioId?: string;
  featureFile?: string;
  useCase?: string;
  command?: string;
  aggregate?: string;
  event?: string;
  technicalArtifact?: string;
  testArtifact?: string;
  status?: string;
  [key: string]: any;
}

export interface AddRequirementResult {
  ok: boolean;
  reqId?: string;
  scenarioId?: string;
  error?: string;
}

export class AddRequirementUseCase {
  constructor(private traceRepo: ITraceabilityRepository) {}

  public execute(projectDir: string, fields: AddRequirementFields): AddRequirementResult {
    const rawContent = this.traceRepo.readTraceability(projectDir) || "";
    const parsed = rawContent ? parseTraceabilityRows(rawContent) : { rows: [] };

    const result = TraceabilityMatrix.appendRequirement(rawContent, fields, parsed.rows || []);
    this.traceRepo.writeTraceability(projectDir, result.content);

    return {
      ok: true,
      reqId: result.reqId,
      scenarioId: result.scenarioId,
    };
  }
}
