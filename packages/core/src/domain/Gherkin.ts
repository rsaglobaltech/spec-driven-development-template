import { DEFAULT_DIALECT, DIALECTS, GherkinDialect } from "./GherkinDialects";

/**
 * The one Gherkin reader in this repository.
 *
 * ## Why one (F1)
 *
 * There were three, and they gave three different answers to the same question
 * about the same file:
 *
 *   | where                  | scenario keywords                       | case       | tags |
 *   |------------------------|-----------------------------------------|------------|------|
 *   | `pack lint`            | Scenario Outline \| Scenario            | insensitive| no   |
 *   | `pack infer`           | Scenario Outline \| Scenario            | insensitive| yes  |
 *   | `specops diff`         | Scenario \| Scenario Outline \| Escenario| sensitive  | no   |
 *
 * That is the diagnosis that already forced the placeholder scanner into one
 * module — *two checkers that answer the same question differently is worse
 * than one imperfect checker* — except here there were three.
 *
 * ## Case sensitivity is the point, not a detail
 *
 * Gherkin keywords are **case-sensitive**. `GIVEN` is not `Given`: the real
 * parser reads it as prose. Two of the three parsers above matched
 * case-insensitively and therefore saw steps where Cucumber saw none, which is
 * exactly how H14 shipped — 27 pack scenarios that executed nothing while
 * `pack lint --strict` called them fine. This reader is case-sensitive because
 * the runner is, and being lenient here would re-create the defect.
 *
 * ## Correct without a runtime dependency
 *
 * `package.json` has no `dependencies` and the CLI runs through `npx` on other
 * people's machines, so the keyword table is vendored as data (see
 * `GherkinDialects`) rather than pulled in as code. Drift is the real risk of
 * that choice, so the tests answer it two ways: the table is compared against
 * the official one, and this parser is compared against `@cucumber/gherkin`
 * itself over every Gherkin file the repository ships.
 *
 * ## Scope
 *
 * Feature, Rule, Background, Scenario, Scenario Outline, Examples, steps, tags,
 * doc strings and data tables — enough for what the CLI reads. Not a
 * replacement for Cucumber: it never executes anything, and where the two
 * disagree, Cucumber is right and this is a bug.
 */

export interface GherkinStep {
  /** Normalised to `given` | `when` | `then`; `And`/`But`/`*` inherit the step above. */
  readonly keyword: string;
  /** The keyword exactly as written, trailing space trimmed. */
  readonly rawKeyword: string;
  readonly text: string;
  readonly line: number;
}

export interface GherkinScenario {
  readonly name: string;
  readonly tags: readonly string[];
  readonly steps: readonly GherkinStep[];
  readonly outline: boolean;
  readonly hasExamples: boolean;
  /** The Rule this scenario sits under, when there is one. */
  readonly rule: string | null;
  readonly line: number;
}

export interface GherkinDocument {
  readonly dialect: string;
  readonly feature: string | null;
  readonly featureTags: readonly string[];
  readonly background: readonly GherkinStep[];
  readonly scenarios: readonly GherkinScenario[];
}

/** `# language: es` on one of the first lines, as Cucumber defines it. */
const LANGUAGE_RE = /^\s*#\s*language\s*:\s*([a-zA-Z-]+)\s*$/;

const STEP_KINDS = ["given", "when", "then", "and", "but"] as const;
type StepKind = (typeof STEP_KINDS)[number];

/**
 * Does the line open a block whose keyword is one of `keywords`?
 *
 * Block keywords are followed by a colon (`Feature:`, `Scenario:`), which is
 * what separates them from a step. Matching is exact and case-sensitive.
 */
function matchBlock(line: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    if (line.startsWith(`${keyword}:`)) return line.slice(keyword.length + 1).trim();
  }
  return null;
}

/**
 * Does the line open a step?
 *
 * Step keywords carry their trailing space in the table — `"Given "`, `"* "` —
 * because that space is what stops `Givenchy` from parsing as a `Given`. Kept
 * as the table has it rather than trimmed and re-added.
 */
function matchStep(
  line: string,
  dialect: GherkinDialect
): { kind: StepKind; raw: string; text: string } | null {
  for (const kind of STEP_KINDS) {
    for (const keyword of dialect[kind]) {
      if (line.startsWith(keyword)) {
        return { kind, raw: keyword.trim(), text: line.slice(keyword.length).trim() };
      }
    }
  }
  return null;
}

/** The dialect a document declares, or English. Unknown tags fall back rather than throw. */
export function detectDialect(source: string): string {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const declared = LANGUAGE_RE.exec(line);
    if (declared) {
      const tag = declared[1];
      return DIALECTS[tag] ? tag : DEFAULT_DIALECT;
    }
    // The language comment must precede everything but blank lines and other
    // comments; once real content starts, there is no dialect to declare.
    if (!line.startsWith("#")) break;
  }
  return DEFAULT_DIALECT;
}

/**
 * Read a Gherkin document.
 *
 * Never throws: a malformed file yields whatever was recognisable, because
 * every caller wants "what does this file contain" rather than "is this file
 * perfect". Judging it is `pack lint`'s and `validate`'s job.
 */
export function parseGherkin(source: string): GherkinDocument {
  const dialectTag = detectDialect(source);
  const dialect = DIALECTS[dialectTag];

  const lines = String(source).replace(/\r\n/g, "\n").split("\n");

  let feature: string | null = null;
  const featureTags: string[] = [];
  const background: GherkinStep[] = [];
  const scenarios: GherkinScenario[] = [];

  let pendingTags: string[] = [];
  let currentRule: string | null = null;
  let currentSteps: GherkinStep[] | null = null;
  let currentScenario: {
    name: string;
    tags: string[];
    steps: GherkinStep[];
    outline: boolean;
    hasExamples: boolean;
    rule: string | null;
    line: number;
  } | null = null;
  let lastKind: StepKind | null = null;
  // Doc strings hold arbitrary text, including lines that look like keywords.
  let inDocString: string | null = null;

  const closeScenario = () => {
    if (currentScenario) scenarios.push(currentScenario as GherkinScenario);
    currentScenario = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const lineNo = i + 1;

    if (inDocString !== null) {
      if (line === inDocString) inDocString = null;
      continue;
    }
    if (line.startsWith('"""') || line.startsWith("```")) {
      inDocString = line.slice(0, 3);
      continue;
    }

    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("@")) {
      pendingTags.push(...line.split(/\s+/).filter((t) => t.startsWith("@")));
      continue;
    }

    const featureName = matchBlock(line, dialect.feature);
    if (featureName !== null && feature === null) {
      feature = featureName;
      featureTags.push(...pendingTags);
      pendingTags = [];
      currentSteps = null;
      continue;
    }

    const ruleName = matchBlock(line, dialect.rule);
    if (ruleName !== null) {
      closeScenario();
      currentRule = ruleName;
      currentSteps = null;
      pendingTags = [];
      continue;
    }

    if (matchBlock(line, dialect.background) !== null) {
      closeScenario();
      currentSteps = background;
      lastKind = null;
      pendingTags = [];
      continue;
    }

    const outlineName = matchBlock(line, dialect.scenarioOutline);
    const scenarioName = outlineName === null ? matchBlock(line, dialect.scenario) : null;
    if (outlineName !== null || scenarioName !== null) {
      closeScenario();
      currentScenario = {
        name: (outlineName ?? scenarioName ?? "").trim(),
        tags: pendingTags.slice(),
        steps: [],
        outline: outlineName !== null,
        hasExamples: false,
        rule: currentRule,
        line: lineNo,
      };
      currentSteps = currentScenario.steps;
      lastKind = null;
      pendingTags = [];
      continue;
    }

    if (matchBlock(line, dialect.examples) !== null) {
      if (currentScenario) currentScenario.hasExamples = true;
      currentSteps = null;
      pendingTags = [];
      continue;
    }

    const step = matchStep(line, dialect);
    if (step && currentSteps) {
      // `And`, `But` and `*` continue whatever came before them; a scenario
      // opening with one has nothing to inherit, so it keeps its own kind.
      const inherits = step.kind === "and" || step.kind === "but" || step.raw === "*";
      const keyword = inherits && lastKind ? lastKind : step.kind;
      if (!inherits) lastKind = step.kind;
      currentSteps.push({ keyword, rawKeyword: step.raw, text: step.text, line: lineNo });
      pendingTags = [];
      continue;
    }

    // A data-table row, or prose. Neither ends a scenario, but both mean any
    // pending tags belonged to nothing.
    pendingTags = [];
  }

  closeScenario();

  return { dialect: dialectTag, feature, featureTags, background, scenarios };
}
