#!/usr/bin/env node
import {
  ConfigSetCommand,
  CONFIG_DIR,
  CONFIG_FILE,
  KEYS,
  configPath,
  read,
  write,
} from "./cli/commands/config/ConfigSetCommand";

export { ConfigSetCommand, CONFIG_DIR, CONFIG_FILE, KEYS, configPath, read, write };

export function main(argv: string[]) {
  new ConfigSetCommand(argv).execute();
}

if (require.main === module) {
  new ConfigSetCommand(process.argv.slice(2)).execute();
}
