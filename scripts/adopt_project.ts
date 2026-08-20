#!/usr/bin/env node
import { AdoptProjectCommand, detectStack } from "./cli/commands/project/AdoptCommand";

export { AdoptProjectCommand, detectStack };

if (require.main === module) {
  new AdoptProjectCommand(process.argv.slice(2)).execute();
}
