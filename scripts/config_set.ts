#!/usr/bin/env node
"use strict";

/**
 * `csda config set|get|list` — the project's own preferences.
 *
 * Deliberately tiny and deliberately separate from `project.yaml`. That file
 * describes what the project *is* and is consumed by `init`; this one records
 * how this checkout prefers the CLI to behave, and is read on every
 * invocation. Conflating them would mean re-running `init` to change a help
 * setting.
 *
 * Lives at `.csda/config.json` — the same directory the artefact schemas use.
 */

const fs = require("node:fs");
const path = require("node:path");

const { error } = require("../scripts/lib/diagnostics");
const { agentIo, wantsJson, EXIT } = require("./lib/agent");

const CONFIG_DIR = ".csda";
const CONFIG_FILE = "config.json";

/**
 * Every key is declared, with its allowed values. An unknown key is a typo,
 * not an extension point — silently accepting one means the setting appears to
 * work and does nothing.
 */
const KEYS = {
  profile: {
    values: ["core", "full"],
    describe: "Which commands `csda --help` lists by default.",
  },
  language: {
    values: null, // free-form: an IETF tag like en, es, pt-BR
    describe: "Language for generated prose. Technical terms stay in English.",
  },
};

function configPath(projectDir) {
  return path.join(projectDir, CONFIG_DIR, CONFIG_FILE);
}

function read(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(configPath(projectDir), "utf8"));
  } catch {
    return {};
  }
}

function write(projectDir, config) {
  const file = configPath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return file;
}

function usage() {
  const keys = Object.entries(KEYS)
    .map(([k, v]: [string, any]) => {
      const allowed = v.values ? ` (${v.values.join(" | ")})` : "";
      return `    ${k}${allowed}\n      ${v.describe}`;
    })
    .join("\n");
  process.stdout.write(
    "Usage:\n" +
      "  csda config set <key> <value>\n" +
      "  csda config get <key>\n" +
      "  csda config list\n\n" +
      `Keys:\n${keys}\n\n` +
      `Stored in ${CONFIG_DIR}/${CONFIG_FILE}. Commit it to share the setting.\n`
  );
}

function main(argv) {
  const io = agentIo(wantsJson(argv));
  const NULL_SHAPE = { config: null };
  const args = argv.filter((a) => a !== "--json");

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(EXIT.OK);
  }

  let projectDir = ".";
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project-dir" && args[i + 1]) projectDir = args[++i];
    else if (!args[i].startsWith("-")) positional.push(args[i]);
  }

  const [action, key, ...rest] = positional;

  if (action === "list" || (!action && !key)) {
    const config = read(projectDir);
    return io.emit({ config }, () => {
      const entries = Object.entries(config);
      if (entries.length === 0) {
        process.stdout.write("  (no settings — everything is at its default)\n");
        return;
      }
      for (const [k, v] of entries) process.stdout.write(`  ${k} = ${v}\n`);
    });
  }

  if (!KEYS[key]) {
    io.usage(NULL_SHAPE, [
      error("config_key_unknown", `Unknown setting: ${key || "(none)"}`, {
        target: key,
        fix: `Known settings: ${Object.keys(KEYS).join(", ")}.`,
      }),
    ]);
  }

  if (action === "get") {
    const config = read(projectDir);
    return io.emit({ config: { [key]: config[key] ?? null } }, () =>
      process.stdout.write(`  ${key} = ${config[key] ?? "(default)"}\n`)
    );
  }

  if (action !== "set") {
    io.usage(NULL_SHAPE, [
      error("config_action_unknown", `Unknown action: ${action || "(none)"}`, {
        target: action,
        fix: "Use one of: set, get, list.",
      }),
    ]);
  }

  const value = rest[0];
  if (value === undefined) {
    io.usage(NULL_SHAPE, [
      error("config_value_required", `No value given for ${key}.`, {
        fix: `csda config set ${key} <value>`,
      }),
    ]);
  }

  const allowed = KEYS[key].values;
  if (allowed && !allowed.includes(value)) {
    io.usage(NULL_SHAPE, [
      error("config_value_invalid", `${value} is not a valid ${key}.`, {
        target: value,
        fix: `Use one of: ${allowed.join(", ")}.`,
      }),
    ]);
  }

  const config = read(projectDir);
  config[key] = value;
  const file = write(projectDir, config);

  io.emit({ config }, () =>
    process.stdout.write(
      `  ✔  ${key} = ${value}\n     ${path.relative(process.cwd(), file) || file}\n`
    )
  );
  process.exit(EXIT.OK);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, read, write, configPath, KEYS, CONFIG_DIR, CONFIG_FILE };
