#!/usr/bin/env node
import {
  InitFromPackCommand,
  parseReference,
  newestProjectIn,
} from "./cli/commands/project/InitFromPackCommand";

export { InitFromPackCommand, parseReference, newestProjectIn };

export function main(argv: string[]) {
  new InitFromPackCommand(argv).execute();
}

if (require.main === module) {
  new InitFromPackCommand(process.argv.slice(2)).execute();
}
