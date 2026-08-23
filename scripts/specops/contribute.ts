/**
 * `specops contribute` — re-export of the command and of the rendering it does.
 *
 * The command lives in `scripts/cli/commands/specops/ContributeCommand`;
 * turning a change into a `pack.yaml` fragment is domain
 * (`core/domain/PackContribution`) and staging it as a git branch is
 * infrastructure (`GitContributionStager`).
 */

import { ContributeCommand } from "../cli/commands/specops/ContributeCommand";

export {
  ContributeCommand,
  ContributeOptions,
  parseArgs,
} from "../cli/commands/specops/ContributeCommand";

export {
  deltaToPackFragment,
  contributionReadme,
} from "../../packages/core/src/domain/PackContribution";

export { stageContribution } from "../../packages/core/src/infrastructure/GitContributionStager";

// This file is what the command registry spawns, so it stays the entry point.
if (require.main === module) new ContributeCommand(process.argv.slice(2)).execute();
