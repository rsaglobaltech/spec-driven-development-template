#!/usr/bin/env node
import {
  LintPackCommand,
  parseArgs,
  parseFeature,
  isGenericTitle,
  lintScenarioQuality,
  runLint,
  buildPackGraph,
  renderMermaid,
  renderDot,
  LintPackOptions,
  LintRunOptions,
} from "./cli/commands/pack/LintPackCommand";

export {
  LintPackCommand,
  parseArgs,
  parseFeature,
  isGenericTitle,
  lintScenarioQuality,
  runLint,
  buildPackGraph,
  renderMermaid,
  renderDot,
  LintPackOptions,
  LintRunOptions,
};

if (require.main === module) {
  new LintPackCommand(process.argv.slice(2)).execute();
}
