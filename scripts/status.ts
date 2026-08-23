#!/usr/bin/env node
import {
  StatusCommand,
  parseArgs,
  summarise,
  nextCommandPlain,
  StatusOptions,
} from "./cli/commands/spec/StatusCommand";

export { StatusCommand, parseArgs, summarise, nextCommandPlain, StatusOptions };

export function main() {
  new StatusCommand(process.argv.slice(2)).execute();
}

if (require.main === module) {
  main();
}
