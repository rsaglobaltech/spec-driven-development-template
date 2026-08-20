/**
 * `csda change` — re-export of the command, its templates and its validation.
 *
 * The command lives in `scripts/cli/commands/change/ChangeCommand`; the files
 * `change new` scaffolds are domain (`core/domain/ChangeTemplates`) and
 * checking a change is `ValidateChangeUseCase`. Kept as one import site for
 * `validate`, which validates changes alongside the project.
 */

import { CliCommand } from "../cli/commands/change/ChangeCommand";

export { CliCommand, TEMPLATES } from "../cli/commands/change/ChangeCommand";
export { artifactState, ARTIFACTS } from "./artifacts";
export * from "../../packages/core/src/domain/ChangeTemplates";
export { ValidateChangeUseCase } from "../../packages/core/src/application/ValidateChangeUseCase";

// This file is what the command registry spawns, so it stays the entry point.
if (require.main === module) new CliCommand(process.argv.slice(2)).execute();
