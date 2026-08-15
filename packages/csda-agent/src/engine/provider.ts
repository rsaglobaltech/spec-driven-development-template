/**
 * Provider selection.
 *
 * The agent is provider-agnostic by design: the value it adds is the closed
 * csda tool set and the spec-driven system prompt, and neither of those is
 * tied to a vendor. Both providers get the *same* tool schemas — JSON Schema
 * is the common currency — and the same tool implementations. Only the loop
 * that carries them differs.
 */

export type ProviderId = "anthropic" | "openai";

export interface ProviderChoice {
  id: ProviderId;
  /** Why this one was chosen, for the status line and for --help output. */
  reason: string;
  model: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
};

export class NoProviderError extends Error {
  constructor() {
    super(
      "No model provider credentials found.\n" +
        "   Set ANTHROPIC_API_KEY, or OPENAI_API_KEY, and re-run.\n" +
        "   Force one with --provider anthropic|openai."
    );
  }
}

/**
 * Pick a provider.
 *
 * An explicit `--provider` always wins, and fails loudly when its key is
 * missing rather than silently falling back to the other vendor — a run that
 * quietly used a different model than the one asked for is worse than a run
 * that refused.
 */
export function selectProvider(
  explicit: ProviderId | null,
  model: string | null,
  env: NodeJS.ProcessEnv = process.env
): ProviderChoice {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);

  if (explicit) {
    const available = explicit === "anthropic" ? hasAnthropic : hasOpenAI;
    if (!available) {
      const key = explicit === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      throw new Error(`--provider ${explicit} was requested but ${key} is not set.`);
    }
    return { id: explicit, reason: "requested with --provider", model: model ?? DEFAULT_MODELS[explicit] };
  }

  if (hasAnthropic) {
    return { id: "anthropic", reason: "ANTHROPIC_API_KEY is set", model: model ?? DEFAULT_MODELS.anthropic };
  }
  if (hasOpenAI) {
    return { id: "openai", reason: "OPENAI_API_KEY is set", model: model ?? DEFAULT_MODELS.openai };
  }
  throw new NoProviderError();
}
