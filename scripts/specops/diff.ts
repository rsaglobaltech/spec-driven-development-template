/**
 * `specops diff` — re-export of the command and of the directory comparison
 * it runs on.
 *
 * The command lives in `scripts/cli/commands/specops/DiffCommand`; reducing a
 * directory to content hashes and classifying the differences are
 * infrastructure and domain respectively. Kept as one import site because
 * `specops sync` and the diff tests both reach for these.
 */

import { DiffCommand } from "../cli/commands/specops/DiffCommand";

export {
  DiffCommand,
  parseArgs,
  buildExpandArgs,
  runAsChange,
} from "../cli/commands/specops/DiffCommand";

export {
  diffDirs,
  walkFiles,
  hashFile,
  snapshotDir,
} from "../../packages/core/src/infrastructure/DirectorySnapshot";

export {
  classifyFileChanges,
  FileChangeSet,
  FileHashes,
  IGNORE_DIRS,
  IGNORE_FILES,
} from "../../packages/core/src/domain/FileChangeSet";

// This file is what the command registry spawns, so it stays the entry point.
if (require.main === module) {
  new DiffCommand(process.argv.slice(2)).execute();
}
