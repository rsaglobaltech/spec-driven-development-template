#!/usr/bin/env node
import { CiInitCommand, PROVIDERS, parseArgs } from "./cli/commands/config/CiInitCommand";

export { CiInitCommand, PROVIDERS, parseArgs };

if (require.main === module) {
  new CiInitCommand(process.argv.slice(2)).execute();
}
