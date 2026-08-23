#!/usr/bin/env node
import {
  StudioCommand,
  parseArgs,
  buildModel,
  mermaid,
  renderHtml,
  StudioOptions,
} from "./cli/commands/spec/StudioCommand";

export { StudioCommand, parseArgs, buildModel, mermaid, renderHtml, StudioOptions };

if (require.main === module) {
  new StudioCommand(process.argv.slice(2)).execute();
}
