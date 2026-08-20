#!/usr/bin/env node
import { BundlePackCommand } from "./cli/commands/pack/BundlePackCommand";

export { BundlePackCommand };

if (require.main === module) {
  new BundlePackCommand(process.argv.slice(2)).execute();
}
