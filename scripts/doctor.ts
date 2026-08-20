#!/usr/bin/env node
import { DoctorCommand, nodeFloor as commandNodeFloor } from "./cli/commands/quality/DoctorCommand";

export function nodeFloor() {
  return commandNodeFloor();
}

export { DoctorCommand };

if (require.main === module) {
  new DoctorCommand(process.argv.slice(2)).execute();
}
