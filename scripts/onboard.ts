#!/usr/bin/env node
import {
  OnboardCommand,
  NOT_DOMAIN,
  BUILD_OUTPUT,
  descendThroughWrappers,
  titleCase,
  proposeCapabilities,
  findAdoptedAncestor,
  findDeclaredModules,
  looksLayered,
} from "./cli/commands/project/OnboardCommand";

export {
  OnboardCommand,
  NOT_DOMAIN,
  BUILD_OUTPUT,
  descendThroughWrappers,
  titleCase,
  proposeCapabilities,
  findAdoptedAncestor,
  findDeclaredModules,
  looksLayered,
};

export function main(argv: string[]) {
  new OnboardCommand(argv).execute();
}

if (require.main === module) {
  new OnboardCommand(process.argv.slice(2)).execute();
}
