#!/usr/bin/env node
import {
  InitProjectCommand,
  PROJECT_TYPES,
  KNOWN_KEYS,
  parseArgs,
  parseConfig,
  parseConfigKeyValue,
  parseConfigYaml,
  validateConfig,
} from "./cli/commands/project/InitProjectCommand";

export {
  InitProjectCommand,
  PROJECT_TYPES,
  KNOWN_KEYS,
  parseArgs,
  parseConfig,
  parseConfigKeyValue,
  parseConfigYaml,
  validateConfig,
};

if (require.main === module) {
  new InitProjectCommand(process.argv.slice(2)).execute();
}
