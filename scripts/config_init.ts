#!/usr/bin/env node
import {
  ConfigInitCommand,
  parseArgs,
  TEMPLATE,
  ConfigInitOptions,
} from "./cli/commands/config/ConfigInitCommand";

export { ConfigInitCommand, parseArgs, TEMPLATE, ConfigInitOptions };

if (require.main === module) {
  new ConfigInitCommand(process.argv.slice(2)).execute();
}
