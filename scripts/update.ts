#!/usr/bin/env node
import {
  UpdateCommand,
  BASELINE_DIR,
  generatedFiles,
  updateFile,
  GeneratedFile,
  UpdateOptions,
  UpdateResult,
} from "./cli/commands/project/UpdateCommand";

export {
  UpdateCommand,
  BASELINE_DIR,
  generatedFiles,
  updateFile,
  GeneratedFile,
  UpdateOptions,
  UpdateResult,
};

export function main(argv: string[]) {
  new UpdateCommand(argv).execute();
}

if (require.main === module) {
  new UpdateCommand(process.argv.slice(2)).execute();
}
