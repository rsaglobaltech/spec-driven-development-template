/**
 * The Gherkin keyword table, for the dialects this CLI offers.
 *
 * **Vendored data, not a fork.** Copied verbatim from
 * `@cucumber/gherkin`'s own `gherkin-languages.json` (MIT, Cucumber Ltd —
 * see `THIRD-PARTY-NOTICES.md`), version 42.0.0, and generated from it
 * rather than transcribed, because a table typed by hand is a table that
 * silently disagrees with the runner.
 *
 * ## Why vendored at all
 *
 * `package.json` has **no runtime dependencies** and `AI_RULES.md` requires an
 * ADR to add one. The CLI runs through `npx` on other people's machines, so
 * that promise is structural rather than stylistic. Depending on
 * `@cucumber/gherkin` at runtime to read three dialects would buy correctness
 * at a price this product has decided not to pay.
 *
 * The real risk of vendoring is drift, and that is answered directly:
 * `packages/core/test/unit/gherkin-dialects.test.ts` compares every entry here
 * against the installed official table and fails if they diverge. Bumping
 * Cucumber therefore either passes or tells you exactly what moved.
 *
 * ## Only three dialects, deliberately
 *
 * The official table carries eighty. This carries the three `csda init`
 * offers (`LANG`: en, es, pt). Adding a dialect is adding it here and
 * regenerating; carrying eighty would be carrying seventy-seven we cannot test.
 */

/** A step keyword's trailing space is significant: `* ` and `Given ` both end in one. */
export interface GherkinDialect {
  readonly name: string;
  readonly native: string;
  readonly feature: readonly string[];
  readonly background: readonly string[];
  readonly rule: readonly string[];
  readonly scenario: readonly string[];
  readonly scenarioOutline: readonly string[];
  readonly examples: readonly string[];
  readonly given: readonly string[];
  readonly when: readonly string[];
  readonly then: readonly string[];
  readonly and: readonly string[];
  readonly but: readonly string[];
}

/**
 * The version of `@cucumber/gherkin` this table was generated from.
 *
 * Bumped to 42.0.1 for #141 after the drift test confirmed the keyword data is
 * byte-identical to 42.0.0 — only the stamp was stale. The two tests are
 * deliberately separate: one compares every keyword against the installed
 * table, the other records which version that comparison ran against. A patch
 * release that changes no dialect still has to move this line, so the number in
 * the file never claims more than it was checked against.
 */
export const DIALECT_TABLE_VERSION = "42.0.1";

export const DIALECTS: Readonly<Record<string, GherkinDialect>> = {
  en: {
    name: "English",
    native: "English",
    feature: ["Feature", "Business Need", "Ability"],
    background: ["Background"],
    rule: ["Rule"],
    scenario: ["Example", "Scenario"],
    scenarioOutline: ["Scenario Outline", "Scenario Template"],
    examples: ["Examples", "Scenarios"],
    given: ["* ", "Given "],
    when: ["* ", "When "],
    then: ["* ", "Then "],
    and: ["* ", "And "],
    but: ["* ", "But "],
  },
  es: {
    name: "Spanish",
    native: "español",
    feature: ["Característica", "Necesidad del negocio", "Requisito"],
    background: ["Antecedentes"],
    rule: ["Regla", "Regla de negocio"],
    scenario: ["Ejemplo", "Escenario"],
    scenarioOutline: ["Esquema del escenario"],
    examples: ["Ejemplos"],
    given: ["* ", "Dado ", "Dada ", "Dados ", "Dadas "],
    when: ["* ", "Cuando "],
    then: ["* ", "Entonces "],
    and: ["* ", "Y ", "E "],
    but: ["* ", "Pero "],
  },
  pt: {
    name: "Portuguese",
    native: "português",
    feature: ["Funcionalidade", "Característica", "Caracteristica"],
    background: ["Contexto", "Cenário de Fundo", "Cenario de Fundo", "Fundo"],
    rule: ["Regra"],
    scenario: ["Exemplo", "Cenário", "Cenario"],
    scenarioOutline: [
      "Esquema do Cenário",
      "Esquema do Cenario",
      "Delineação do Cenário",
      "Delineacao do Cenario",
    ],
    examples: ["Exemplos", "Cenários", "Cenarios"],
    given: ["* ", "Dado ", "Dada ", "Dados ", "Dadas "],
    when: ["* ", "Quando "],
    then: ["* ", "Então ", "Entao "],
    and: ["* ", "E "],
    but: ["* ", "Mas "],
  },
};

/** The dialect a document uses when it declares none. */
export const DEFAULT_DIALECT = "en";
