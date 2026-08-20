/**
 * Builds the structured prompt handed to a coding agent for one requirement.
 */

import { STAGES } from "../change/instructions";
import { DiskHarnessConfigRepository } from "../../packages/core/src/infrastructure/DiskHarnessConfigRepository";
import { GenerateAgentPromptUseCase } from "../../packages/core/src/application/GenerateAgentPromptUseCase";
import {
  PromptOptions as CorePromptOptions,
  PromptRequirement,
} from "../../packages/core/src/domain/AgentPrompt";

export type PromptOptions = CorePromptOptions;

export function buildPrompt(
  req: Record<string, unknown>,
  projectDir: string,
  opts: PromptOptions = {}
): string {
  const repo = new DiskHarnessConfigRepository();
  const useCase = new GenerateAgentPromptUseCase(repo);

  return useCase.execute(req as PromptRequirement, projectDir, {
    ...opts,
    stageRules: STAGES?.apply?.rules,
  });
}
