#!/usr/bin/env node
/**
 * Supported shells: "bash", "zsh", "fish"
 */
import {
  CompletionCommand,
  COMMANDS,
  SUBCOMMANDS,
  bashScript,
  zshScript,
  fishScript,
  installTarget,
  GENERATORS,
} from "./cli/commands/config/CompletionCommand";

export {
  CompletionCommand,
  COMMANDS,
  SUBCOMMANDS,
  bashScript,
  zshScript,
  fishScript,
  installTarget,
  GENERATORS,
};

export function main(argv: string[]) {
  new CompletionCommand(argv).execute();
}

if (require.main === module) {
  new CompletionCommand(process.argv.slice(2)).execute();
}
