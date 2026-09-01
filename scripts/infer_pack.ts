#!/usr/bin/env node
import {
  InferPackCommand,
  parseArgs,
  parseFeatureFile,
  toPascalCase,
  collectRequirementIds,
  extractEventNames,
  isQueryStep,
  extractPayloadHints,
  inferModel,
  mergeModels,
  renderYamlFragment,
  InferPackOptions,
} from "./cli/commands/pack/InferPackCommand";

export {
  InferPackCommand,
  parseArgs,
  parseFeatureFile,
  toPascalCase,
  collectRequirementIds,
  extractEventNames,
  isQueryStep,
  extractPayloadHints,
  inferModel,
  mergeModels,
  renderYamlFragment,
  InferPackOptions,
};

if (require.main === module) {
  new InferPackCommand(process.argv.slice(2)).execute();
}
