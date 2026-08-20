#!/usr/bin/env node
import {
  InitPackCommand,
  parseArgs,
  slugify,
  buildPackYaml,
  buildBackendOrFrontendPackYaml,
  buildContractsPackYaml,
  templatesFor,
} from "./cli/commands/pack/InitPackCommand";

export {
  InitPackCommand,
  parseArgs,
  slugify,
  buildPackYaml,
  buildBackendOrFrontendPackYaml,
  buildContractsPackYaml,
  templatesFor,
};

if (require.main === module) {
  new InitPackCommand(process.argv.slice(2)).execute();
}
