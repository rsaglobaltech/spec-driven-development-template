/**
 * A deterministic engine that replays a fixed script.
 *
 * This exists so the TUI can be developed and tested without a network, an API
 * key, or spending tokens — and so an abort test can assert that Esc really
 * stops work in flight rather than just stopping the paint. It is the proof
 * that the `AgentEngine` boundary is real: the TUI cannot tell this apart from
 * the SDK engine.
 */

import type {
  AgentEngine,
  AgentEvent,
  PermissionMode,
  TurnInput,
  UsageSnapshot,
} from "./types.js";
import { emptyUsage } from "./types.js";

export interface ScriptedStep {
  event: AgentEvent;
  /** Simulated delay before this event, in ms. */
  delayMs?: number;
}

export class ScriptedAgentEngine implements AgentEngine {
  readonly name = "scripted";

  private mode: PermissionMode = "default";
  private snapshot: UsageSnapshot = emptyUsage();
  /** Set when a run is cut short by its signal — asserted in tests. */
  aborted = false;
  /** How many events actually made it out, for abort assertions. */
  emitted = 0;

  constructor(private readonly script: ScriptedStep[] = []) {}

  usage(): UsageSnapshot {
    return { ...this.snapshot };
  }

  permissionMode(): PermissionMode {
    return this.mode;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  async *run(_input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    for (const step of this.script) {
      if (signal.aborted) {
        this.aborted = true;
        yield { type: "turn_end", stopReason: "interrupted", usage: { ...this.snapshot } };
        return;
      }
      if (step.delayMs) {
        const interrupted = await sleepUntilAborted(step.delayMs, signal);
        if (interrupted) {
          this.aborted = true;
          yield { type: "turn_end", stopReason: "interrupted", usage: { ...this.snapshot } };
          return;
        }
      }
      if (step.event.type === "turn_end") this.snapshot = step.event.usage;
      this.emitted += 1;
      yield step.event;
    }
  }
}

/** Resolve early when the signal fires, so an abort is felt immediately. */
function sleepUntilAborted(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
