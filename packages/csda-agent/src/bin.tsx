#!/usr/bin/env node
/**
 * Entry point.
 *
 * Chooses between the Ink REPL and the non-interactive printer. The choice is
 * automatic when stdout is not a TTY: nobody should have to remember `--print`
 * inside a pipe.
 */

import { render } from "ink";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

import { App } from "./tui/App.js";
import { CliError, helpText, parseArgs } from "./cli.js";
import { ToolRunnerAgentEngine } from "./engine/toolrunner-engine.js";
import { OpenAIAgentEngine } from "./engine/openai-engine.js";
import { selectProvider } from "./engine/provider.js";
import { ScriptedAgentEngine } from "./engine/scripted-engine.js";
import type { AgentEngine } from "./engine/types.js";
import { runPrint } from "./print.js";
import { resolveCliPath } from "./tools/exec.js";
import { DEFAULT_WRITABLE, type FileScope } from "./tools/files.js";
import { TOOL_NAMES } from "./tools/registry.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

/** Walk up for the csda checkout that owns `bin/create-spec-driven-app.js`. */
function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, "bin", "create-spec-driven-app.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function buildEngine(options: ReturnType<typeof parseArgs>): AgentEngine {
  if (options.engine === "scripted") {
    return new ScriptedAgentEngine([
      {
        event: {
          type: "session_start",
          sessionId: "scripted",
          model: "scripted",
          tools: TOOL_NAMES,
          cwd: options.cwd,
        },
      },
      { event: { type: "text_delta", text: "Scripted engine. " }, delayMs: 30 },
      { event: { type: "text_delta", text: "Nothing was sent to a model." }, delayMs: 30 },
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
            lastTurnMs: 60,
          },
        },
      },
    ]);
  }

  const repoRoot = findRepoRoot(options.cwd);
  const scope: FileScope = {
    root: path.resolve(options.cwd),
    additionalRoots: options.addDirs.map((d) => path.resolve(d)),
    writable: DEFAULT_WRITABLE,
  };

  const provider = selectProvider(options.provider, options.model);
  const exec = { cliPath: resolveCliPath(options.cliPath, repoRoot), cwd: scope.root };

  if (provider.id === "openai") {
    return new OpenAIAgentEngine({
      model: provider.model,
      permissionMode: options.permissionMode,
      scope,
      exec,
      maxIterations: options.maxTurns ?? undefined,
    });
  }

  return new ToolRunnerAgentEngine({
    model: provider.model,
    permissionMode: options.permissionMode,
    scope,
    exec,
    maxIterations: options.maxTurns ?? undefined,
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
  if (options.listTools) {
    // The tool set is the security boundary, so it has to be inspectable
    // without reading the source.
    process.stdout.write(`${TOOL_NAMES.join("\n")}\n`);
    return 0;
  }

  let engine: AgentEngine;
  try {
    engine = buildEngine(options);
  } catch (err) {
    // A missing key is a configuration problem with an obvious fix, not a
    // stack trace.
    process.stderr.write(`✖  ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  if (options.engine !== "scripted") {
    const cliPath = resolveCliPath(options.cliPath, findRepoRoot(options.cwd));
    if (!fs.existsSync(cliPath)) {
      process.stderr.write(`✖  csda not found at ${cliPath}\n`);
      process.stderr.write("   Pass --cli-path, or run from inside a csda checkout.\n");
      return 2;
    }
  }

  const interactive = !options.print && Boolean(process.stdout.isTTY);

  if (!interactive) {
    if (!options.prompt) {
      process.stderr.write("✖  Non-interactive mode needs a prompt.\n");
      process.stderr.write('   e.g. csda-agent -p "what still needs a test?"\n');
      return 2;
    }
    return runPrint(engine, options.prompt);
  }

  const app = render(
    <App engine={engine} cwd={options.cwd} initialPrompt={options.prompt ?? undefined} />
  );
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
