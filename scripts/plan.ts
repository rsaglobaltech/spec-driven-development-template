#!/usr/bin/env node
import {
  PlanCommand,
  parseArgs,
  PlanOptions,
  parseTraceability,
  classify,
  hintFor,
  buildPlan,
  detectOrphans,
  applyDependencies,
} from "./cli/commands/spec/PlanCommand";

export {
  PlanCommand,
  parseArgs,
  PlanOptions,
  parseTraceability,
  classify,
  hintFor,
  buildPlan,
  detectOrphans,
  applyDependencies,
};

if (require.main === module) {
  new PlanCommand(process.argv.slice(2)).execute();
}
