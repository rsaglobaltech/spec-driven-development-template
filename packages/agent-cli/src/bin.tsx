#!/usr/bin/env node
/**
 * Entry point.
 *
 * Chooses between the Ink REPL and the non-interactive printer. The choice is
 * automatic when stdout is not a TTY: nobody should have to remember `--print`
 * inside a pipe, and forgetting it would otherwise dump ANSI redraw sequences
 * into a log file.
 */

import { render } from "ink";
import { createRequire } from "node:module";

import { App } from "./tui/App.js";
import { CliError, helpText, parseArgs } from "./cli.js";
import { SdkAgentEngine } from "./engine/sdk-engine.js";
import { ScriptedAgentEngine } from "./engine/scripted-engine.js";
import type { AgentEngine } from "./engine/types.js";
import { runPrint } from "./print.js";
import { loadSettings, persistAllowRule } from "./config/settings.js";
import { mergeRulesets } from "./config/permissions.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

function buildEngine(
  options: ReturnType<typeof parseArgs>,
  settings: ReturnType<typeof loadSettings>["settings"]
): AgentEngine {
  if (options.engine === "scripted") {
    // A visible, deterministic engine for smoke-testing the surface without
    // spending tokens. Not a mock hidden behind a flag nobody knows about —
    // it is documented in --help.
    return new ScriptedAgentEngine([
      { event: { type: "session_start", sessionId: "scripted", model: "scripted", tools: [], cwd: options.cwd } },
      { event: { type: "text_delta", text: "The scripted engine is running. " }, delayMs: 40 },
      { event: { type: "text_delta", text: "Nothing was sent to a model." }, delayMs: 40 },
      {
        event: {
          type: "turn_end",
          stopReason: "end_turn",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            costUsd: 0,
            model: "scripted",
            lastTurnMs: 80,
          },
        },
      },
    ]);
  }

  return new SdkAgentEngine({
    // CLI flags outrank the settings files; the files outrank nothing else.
    model: options.model ?? settings.model ?? undefined,
    cwd: options.cwd,
    permissionMode: options.permissionMode,
    ruleset: mergeRulesets(settings.permissions),
    onPersistRule: (rule) => {
      const { file } = persistAllowRule(options.cwd, rule);
      process.stderr.write(`· rule saved to ${file}: ${rule}\n`);
    },
    allowedTools: options.allowedTools ?? undefined,
    disallowedTools: options.disallowedTools ?? undefined,
    additionalDirectories: options.addDirs.length > 0 ? options.addDirs : undefined,
    maxTurns: options.maxTurns ?? undefined,
    resume: options.resume ?? undefined,
    continueSession: options.continueSession || undefined,
  });
}

async function main(): Promise<number> {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`✖  ${err.message}\n`);
      if (err.fix) process.stderr.write(`   ${err.fix}\n`);
      return 2;
    }
    throw err;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const { settings, errors } = loadSettings({ cwd: options.cwd });
  // A malformed settings file must be loud: running with different permissions
  // than the file says is the worst outcome available here.
  for (const error of errors) process.stderr.write(`⚠  ${error}\n`);

  // A permission mode written in a settings file applies unless the user typed
  // one on the command line.
  if (!process.argv.includes("--permission-mode") && settings.permissionMode) {
    options.permissionMode = settings.permissionMode;
  }

  const engine = buildEngine(options, settings);
  const interactive = !options.print && Boolean(process.stdout.isTTY);

  if (!interactive) {
    if (!options.prompt) {
      process.stderr.write("✖  Non-interactive mode needs a prompt.\n");
      process.stderr.write('   e.g. csda-agent -p "summarise the diff"\n');
      return 2;
    }
    return runPrint(engine, options.prompt);
  }

  const app = render(<App engine={engine} cwd={options.cwd} initialPrompt={options.prompt ?? undefined} />);
  await app.waitUntilExit();
  await engine.dispose?.();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`✖  ${err?.stack ?? err}\n`);
    process.exit(1);
  }
);
