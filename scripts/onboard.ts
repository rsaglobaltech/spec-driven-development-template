#!/usr/bin/env node
import {
  OnboardCommand,
  NOT_DOMAIN,
  descendThroughWrappers,
  titleCase,
  proposeCapabilities,
} from "./cli/commands/project/OnboardCommand";

export { OnboardCommand, NOT_DOMAIN, descendThroughWrappers, titleCase, proposeCapabilities };

export function main(argv: string[]) {
  new OnboardCommand(argv).execute();
}

if (require.main === module) {
  new OnboardCommand(process.argv.slice(2)).execute();
}
