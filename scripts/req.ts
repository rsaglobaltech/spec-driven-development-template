#!/usr/bin/env node
/**
 * Supported subcommands: "add", "link", "done", "list"
 */
import {
  ReqCommand,
  COL,
  LINK_FIELDS,
  pad3,
  nextReqId,
  nextScenarioId,
  buildRow,
  isMatrixDataLine,
  appendRequirement,
  updateRequirementFields,
} from "./cli/commands/spec/ReqCommand";

export {
  ReqCommand,
  COL,
  LINK_FIELDS,
  pad3,
  nextReqId,
  nextScenarioId,
  buildRow,
  isMatrixDataLine,
  appendRequirement,
  updateRequirementFields,
};

if (require.main === module) {
  new ReqCommand(process.argv.slice(2)).execute();
}
