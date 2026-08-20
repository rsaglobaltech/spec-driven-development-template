import { jiraProvider } from "./jira";
import { azureProvider } from "./azure";
import { githubProvider } from "./github";
import type { AlmProvider } from "../port";

/**
 * The provider registry. Adding an ALM is a row here plus a module beside it;
 * nothing else in the CLI learns its name.
 *
 * The conformance kit iterates this list, so a provider that is registered is
 * a provider that is tested — there is no way to add one quietly.
 */
export const PROVIDERS: readonly AlmProvider[] = [jiraProvider, azureProvider, githubProvider];

const BY_ID: ReadonlyMap<string, AlmProvider> = new Map(PROVIDERS.map((p) => [p.id, p]));

/** Every registered provider id, in registration order. */
export const providerIds = (): string[] => PROVIDERS.map((p) => p.id);

/** Look one up, or explain which ones exist. */
export function getProvider(id: string): AlmProvider {
  const provider = BY_ID.get(id);
  if (!provider) {
    throw new Error(
      `Unknown ALM provider '${id}'. Available: ${providerIds().join(", ")}.\n` +
        "Fix: set `provider:` in alm.config.yaml to one of those."
    );
  }
  return provider;
}
