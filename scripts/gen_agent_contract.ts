#!/usr/bin/env node
import {
  GenAgentContractCommand,
  OUTPUT,
  COMMANDS,
  harvestCodes,
  render,
} from "./cli/commands/config/GenAgentContractCommand";

export { GenAgentContractCommand, OUTPUT, COMMANDS, harvestCodes, render };

if (require.main === module) {
  new GenAgentContractCommand(process.argv.slice(2)).execute();
}
