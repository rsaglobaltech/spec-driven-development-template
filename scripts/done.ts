#!/usr/bin/env node
import { DoneCommand, parseArgs, ALLOWED_STATUSES } from "./cli/commands/spec/DoneCommand";
import { TraceabilityMatrix } from "../packages/core/src/domain/TraceabilityMatrix";

export { DoneCommand, parseArgs, ALLOWED_STATUSES };

export function setRequirementStatus(content: string, reqId: string, newStatus: string) {
  return TraceabilityMatrix.updateStatus(content, reqId, newStatus);
}

if (require.main === module) {
  new DoneCommand(process.argv.slice(2)).execute();
}
