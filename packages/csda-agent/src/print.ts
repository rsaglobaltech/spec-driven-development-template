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
        case "permission_request":
          // Nobody can answer in non-interactive mode, and a turn blocked on a
          // prompt nobody will see is a hang. Deny explicitly and say which
          // rule would have let it through, so the fix is a config change
          // rather than a guess.
          failed = true;
          process.stderr.write(
            `✖ ${event.tool} needs permission and this is non-interactive: ${event.reason}\n` +
              `  allow it with a rule: ${event.suggestedRule}\n`
          );
          engine.resolvePermission?.(event.id, {
            decision: "deny",
            message: `Denied: non-interactive mode cannot prompt. Add a permission rule for ${event.suggestedRule}.`,
          });
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
