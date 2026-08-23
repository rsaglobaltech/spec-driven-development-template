import { IHarnessConfigRepository } from "./ports/IHarnessConfigRepository";
import { AgentPrompt, PromptRequirement, PromptOptions } from "../domain/AgentPrompt";
import { featureFilePath } from "../domain/HarnessRun";

export class GenerateAgentPromptUseCase {
  constructor(private configRepo: IHarnessConfigRepository) {}

  public execute(req: PromptRequirement, projectDir: string, opts: PromptOptions = {}): string {
    const featurePath = featureFilePath(req) || null;
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
