import { IHarnessConfigRepository } from "./ports/IHarnessConfigRepository";
import { AgentPrompt, PromptRequirement, PromptOptions } from "../domain/AgentPrompt";
import { featureFilePath } from "../domain/HarnessRun";
import { choosePrecedent, excerpt, PrecedentRow } from "../domain/Precedents";
import { extractRequirementSection } from "../domain/SpecSections";
import {
  detectTraceabilityMode,
  parseMatrixContexts,
  parseMatrixRows,
  readRowFields,
} from "../domain/TraceabilityFormat";

const MATRIX = "docs/specs/traceability.md";

export class GenerateAgentPromptUseCase {
  constructor(private configRepo: IHarnessConfigRepository) {}

  public execute(req: PromptRequirement, projectDir: string, opts: PromptOptions = {}): string {
    const featurePath = featureFilePath(req) || null;
    const featureContent = featurePath
      ? this.configRepo.readProjectFile(projectDir, featurePath)
      : null;
    const aiRulesContent = this.configRepo.readProjectFile(projectDir, "AI_RULES.md");

    // The requirement's own prose. Not reading it is how the prompt came to say
    // "Implement REQ-002" with every fact `-` and nothing to implement.
    const specSource = this.configRepo.readProjectFile(projectDir, "spec.md");
    const requirementText = specSource
      ? extractRequirementSection(specSource, String(req.requirement || ""))
      : null;

    return AgentPrompt.build(req, {
      ...opts,
      featureContent,
      aiRulesContent,
      requirementText: requirementText || undefined,
      // Opt-in: the caller decides, because a precedent costs prompt budget and
      // is only worth it once a project has accepted work to point at.
      precedent: opts.withPrecedents ? this.findPrecedent(req, projectDir) : null,
    });
  }

  /**
   * The most recent accepted requirement in the same bounded context, with the
   * top of its test and its implementation.
   *
   * Returns null rather than throwing on anything missing. A prompt that fails
   * to build because an artifact was moved would stop a run over a section that
   * is, by design, optional.
   */
  private findPrecedent(req: PromptRequirement, projectDir: string) {
    const matrix = this.configRepo.readProjectFile(projectDir, MATRIX);
    if (!matrix) return null;

    const mode = detectTraceabilityMode(matrix);
    if (!mode) return null;

    const rows: PrecedentRow[] = parseMatrixRows(matrix).map((cells) => {
      const fields = readRowFields(cells, mode);
      return {
        requirementId: fields.requirementId,
        status: fields.status,
        testArtifact: fields.testArtifact,
        // The production artifact is the column before the test one in a rich
        // matrix, and absent from a legacy one.
        technicalArtifact: mode === "rich" ? cells[8] || "" : "",
      };
    });

    const choice = choosePrecedent(rows, parseMatrixContexts(matrix), req.requirement);
    if (!choice) return null;

    const read = (rel: string) => (rel ? this.configRepo.readProjectFile(projectDir, rel) : null);
    const testSource = read(choice.testArtifact);
    const codeSource = read(choice.technicalArtifact);
    if (!testSource && !codeSource) return null;

    return {
      requirementId: choice.requirementId,
      testArtifact: choice.testArtifact,
      testExcerpt: testSource ? excerpt(testSource) : "",
      technicalArtifact: choice.technicalArtifact,
      technicalExcerpt: codeSource ? excerpt(codeSource) : "",
    };
  }
}
