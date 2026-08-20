/**
 * The language of generated prose.
 *
 * A Spanish team writing Spanish specs should not have `Added` and `Retired`
 * appear in the middle of them — but they must not have `SHALL` translated
 * either. The grammar is not prose: `SHALL`, `GIVEN`/`WHEN`/`THEN`,
 * `## ADDED Requirements`, `REQ-NNN` and `csda:trace` are what the validator
 * parses. Translating any of them breaks the file.
 *
 * So the split is explicit. Only the sentences a human reads are translated;
 * the keywords never are, and there is a test asserting that.
 *
 * Set with `csda config set language es`. Defaults to English.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Never translated, in any language. These are parsed, not read. */
export const KEYWORDS = Object.freeze([
  "SHALL",
  "MUST",
  "SHOULD",
  "MAY",
  "GIVEN",
  "WHEN",
  "THEN",
  "AND",
  "ADDED Requirements",
  "MODIFIED Requirements",
  "REMOVED Requirements",
  "Requirement:",
  "Scenario:",
  "csda:trace",
]);

export const PHRASES = {
  en: {
    systemShall: (behaviour) => `The system SHALL ${behaviour}.`,
    systemShallMeet: (what) => `The system SHALL satisfy "${what}".`,
    observableBehaviour: "<observable behaviour>",
    priority: (value) => `_Priority: ${value}._`,
    todoSteps: (name) => `- TODO: write the GIVEN / WHEN / THEN steps for "${name}"`,
    todoStepsPlain: "- TODO: write the GIVEN / WHEN / THEN steps",
    precondition: "<precondition>",
    action: "<action>",
    outcome: "<observable outcome>",
    scenarioName: "<scenario name>",
    shortName: "<short name>",
    capability: "<capability>",
    added: "Added",
    modified: "Modified",
    removed: "Retired",
  },
  es: {
    systemShall: (behaviour) => `El sistema SHALL ${behaviour}.`,
    systemShallMeet: (what) => `El sistema SHALL cumplir "${what}".`,
    observableBehaviour: "<comportamiento observable>",
    priority: (value) => `_Prioridad: ${value}._`,
    todoSteps: (name) => `- TODO: escribir los pasos GIVEN / WHEN / THEN de "${name}"`,
    todoStepsPlain: "- TODO: escribir los pasos GIVEN / WHEN / THEN",
    precondition: "<precondición>",
    action: "<acción>",
    outcome: "<resultado observable>",
    scenarioName: "<nombre del escenario>",
    shortName: "<nombre corto>",
    capability: "<capacidad>",
    added: "Añadidos",
    modified: "Modificados",
    removed: "Retirados",
  },
  pt: {
    systemShall: (behaviour) => `O sistema SHALL ${behaviour}.`,
    systemShallMeet: (what) => `O sistema SHALL cumprir "${what}".`,
    observableBehaviour: "<comportamento observável>",
    priority: (value) => `_Prioridade: ${value}._`,
    todoSteps: (name) => `- TODO: escrever os passos GIVEN / WHEN / THEN de "${name}"`,
    todoStepsPlain: "- TODO: escrever os passos GIVEN / WHEN / THEN",
    precondition: "<precondição>",
    action: "<ação>",
    outcome: "<resultado observável>",
    scenarioName: "<nome do cenário>",
    shortName: "<nome curto>",
    capability: "<capacidade>",
    added: "Adicionados",
    modified: "Modificados",
    removed: "Retirados",
  },
};

export const DEFAULT = "en";

/**
 * The project's language: `.csda/config.json`, or `CSDA_LANGUAGE`, or English.
 * A regional tag (`pt-BR`) falls back to its base language rather than to
 * English — closer is better than default.
 */
export function resolveLanguage(projectDir) {
  const raw = process.env.CSDA_LANGUAGE || readConfigured(projectDir);
  if (!raw) return DEFAULT;
  const tag = String(raw).toLowerCase();
  if (PHRASES[tag]) return tag;
  const base = tag.split("-")[0];
  return PHRASES[base] ? base : DEFAULT;
}

export function readConfigured(projectDir) {
  try {
    const file = path.join(projectDir || ".", ".csda", "config.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && parsed.language;
  } catch {
    return null;
  }
}

/** The phrase table for a project. */
export function phrases(projectDir) {
  return PHRASES[resolveLanguage(projectDir)];
}
