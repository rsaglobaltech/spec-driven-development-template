#!/usr/bin/env node
import {
  ExpandDomainPackCommand,
  renderStaticFiles,
  renderScenarios,
  renderDomainDocs,
  renderTraceability,
  resolvePackSource,
  enforcePackSecurity,
  updateLockfile,
  updateBaseline,
} from "./cli/commands/pack/ExpandDomainPackCommand";

export {
  ExpandDomainPackCommand,
  renderStaticFiles,
  renderScenarios,
  renderDomainDocs,
  renderTraceability,
  resolvePackSource,
  enforcePackSecurity,
  updateLockfile,
  updateBaseline,
};

if (require.main === module) {
  new ExpandDomainPackCommand(process.argv.slice(2)).execute();
}
