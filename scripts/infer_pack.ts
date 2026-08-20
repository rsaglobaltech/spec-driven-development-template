#!/usr/bin/env node
import {
  InferPackCommand,
  parseArgs,
  parseFeatureFile,
  toPascalCase,
  collectRequirementIds,
  extractEventNames,
  inferModel,
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
  inferModel,
  renderYamlFragment,
  InferPackOptions,
};

if (require.main === module) {
  new InferPackCommand(process.argv.slice(2)).execute();
}
