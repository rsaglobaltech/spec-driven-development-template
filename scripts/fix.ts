#!/usr/bin/env node
import { FixCommand, computeFixes, parseArgs, FixOptions } from "./cli/commands/quality/FixCommand";

export { FixCommand, computeFixes, parseArgs, FixOptions };

if (require.main === module) {
  new FixCommand(process.argv.slice(2)).execute();
}
