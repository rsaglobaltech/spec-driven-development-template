#!/usr/bin/env node
import {
  LicenseCheckCommand,
  ALLOWED,
  licenseOf,
  alternatives,
  isAllowed,
  summarise,
} from "./cli/commands/quality/LicenseCheckCommand";

export { LicenseCheckCommand, ALLOWED, licenseOf, alternatives, isAllowed, summarise };

if (require.main === module) {
  new LicenseCheckCommand(process.argv.slice(2)).execute();
}
