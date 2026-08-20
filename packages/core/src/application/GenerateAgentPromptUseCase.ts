import { IHarnessConfigRepository } from "./ports/IHarnessConfigRepository";
import { AgentPrompt, PromptRequirement, PromptOptions } from "../domain/AgentPrompt";

export class GenerateAgentPromptUseCase {
  constructor(private configRepo: IHarnessConfigRepository) {}

  public execute(req: PromptRequirement, projectDir: string, opts: PromptOptions = {}): string {
    const featureRel = String(req.featureFile || req.feature_file || "")
      .replace(/^`|`$/g, "")
      .trim();

    const featurePath = featureRel ? featureRel.split("#")[0] : null;
    const featureContent = featurePath
      ? this.configRepo.readProjectFile(projectDir, featurePath)
      : null;
    const aiRulesContent = this.configRepo.readProjectFile(projectDir, "AI_RULES.md");

    return AgentPrompt.build(req, {
      ...opts,
      featureContent,
      aiRulesContent,
    });
  }
}
