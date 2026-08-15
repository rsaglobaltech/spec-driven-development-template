/**
 * Non-interactive mode.
 *
 * The escape hatch from the TUI (plan risk R5): if Ink misbehaves on some
 * terminal, or the process is inside a pipe or a CI job, the CLI is still
 * fully usable. Plain text on stdout, diagnostics on stderr, and Ctrl-C wired
 * to a real abort.
 */

import type { AgentEngine } from "./engine/types.js";
import { formatCost, formatTokens, summarizeToolInput } from "./tui/format.js";

export async function runPrint(engine: AgentEngine, prompt: string): Promise<number> {
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on("SIGINT", onSigint);

  let failed = false;

  try {
    for await (const event of engine.run({ prompt }, controller.signal)) {
      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.text);
          break;
        case "tool_start":
          process.stderr.write(`· ${event.name} ${summarizeToolInput(event.name, event.input)}\n`);
          break;
        case "tool_end":
          if (!event.ok) process.stderr.write(`✖ tool failed: ${event.preview}\n`);
          break;
        case "compacted":
          process.stderr.write("· context compacted\n");
          break;
        case "error":
          failed = true;
          process.stderr.write(`✖ ${event.message}\n`);
          break;
        case "turn_end": {
          const u = event.usage;
          process.stdout.write("\n");
          process.stderr.write(
            `· ${event.stopReason} · ${formatTokens(u.inputTokens)}in/${formatTokens(u.outputTokens)}out · ${formatCost(u.costUsd)}\n`
          );
          if (event.stopReason === "interrupted") failed = true;
          break;
        }
        default:
          break;
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    await engine.dispose?.();
  }

  return failed ? 1 : 0;
}
