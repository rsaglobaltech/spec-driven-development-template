/**
 * Does anything actually prove this scenario? (#168)
 *
 * A matrix row names one `Scenario ID` and one feature file. The file may hold
 * five scenarios. Nothing related the other four to anything, so a scenario
 * could be declared and never tested while every gate stayed green — measured,
 * with `--strict-tdd --strict-scenarios --strict-links` all on at once.
 *
 * That is not a theoretical hole. Handed five scenarios where one contradicted
 * another, an agent wrote tests for four and silently skipped the impossible
 * one; the gate approved and the row went to `Implemented`. The scenario it
 * dropped was precisely the one worth knowing about.
 *
 * ## Why matching by name is the right amount of cleverness
 *
 * This tool does not run the test suite and cannot know which assertion
 * corresponds to which scenario. What it can check is that the scenario is
 * *named* in the artifact the matrix says proves it. That works because it is
 * what people and agents already do without being asked — `test('SCN-012 money
 * is rounded half-up')` was written by an agent nobody instructed to do so.
 *
 * It is a heuristic, and it is stated as one: this lives behind
 * `--strict-coverage` rather than in the default gate, because a project that
 * names its tests some other way would fail through no fault of its own.
 */

/** A scenario, and the strings that would identify it in a test file. */
export interface ScenarioIdentity {
  /** The scenario title as written, for the diagnostic. */
  title: string;
  /**
   * What to look for in the test artifact, best first.
   *
   * An id — from a `@SCN-001` tag or an `SCN-001` prefix in the title — is
   * exact and survives rewording, so it is preferred. The title is the
   * fallback, normalised, for projects that do not carry ids.
   */
  needles: string[];
}

const SCENARIO_LINE = /^(\s*)(Scenario Outline|Scenario|Escenario|Example)\s*:\s*(.*)$/;
const TAG_LINE = /^\s*@/;
const SCN_ID = /\b(SCN-[A-Za-z0-9.]+)\b/;

/** Lowercase alphanumerics only, so punctuation and case cannot break a match. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Every scenario in a feature file, with what would identify it in a test.
 *
 * Scenario Outlines count: an outline with Examples is still behaviour someone
 * promised, and skipping it would leave the widest scenarios unchecked.
 */
export function scenariosIn(featureSource: string): ScenarioIdentity[] {
  const lines = featureSource.replace(/\r\n/g, "\n").split("\n");
  const out: ScenarioIdentity[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = SCENARIO_LINE.exec(lines[i]);
    if (!match) continue;

    const title = match[3].trim();
    if (title === "") continue;

    const needles: string[] = [];

    // A tag on the line above is the strongest identity: it survives a rename,
    // which is the one edit that otherwise defeats every link to a scenario.
    if (i > 0 && TAG_LINE.test(lines[i - 1])) {
      const tagged = SCN_ID.exec(lines[i - 1]);
      if (tagged) needles.push(tagged[1]);
    }
    const inTitle = SCN_ID.exec(title);
    if (inTitle && !needles.includes(inTitle[1])) needles.push(inTitle[1]);

    // Without an id anywhere, the title is all there is.
    if (needles.length === 0) needles.push(title);

    out.push({ title, needles });
  }
  return out;
}

/**
 * The scenarios none of `testSources` mentions.
 *
 * `testSources` is every file the matrix declares as proof for this row — one
 * file usually, but a directory expands to several, and a scenario proved in
 * any of them is proved.
 */
export function uncoveredScenarios(
  featureSource: string,
  testSources: readonly string[]
): ScenarioIdentity[] {
  const haystack = testSources.map(normalise).join("\n");
  if (haystack === "") return scenariosIn(featureSource);

  return scenariosIn(featureSource).filter(
    (scenario) => !scenario.needles.some((needle) => haystack.includes(normalise(needle)))
  );
}

/**
 * A declared test artifact that names neither the requirement nor any of its
 * scenarios (Fase 1.2).
 *
 * `--strict-links` is `fs.existsSync` and nothing more, so a link that merely
 * *lies* passes: measured on a real adoption, a "Vet" requirement ended up
 * declaring `PetValidatorTests.java` as its proof and every gate stayed green.
 * `uncoveredScenarios` catches that whenever the row has scenarios to name —
 * but the rows that lie most easily are the ones `adopt` seeds, which have a
 * use case and no scenario at all, so there is nothing to match and the check
 * skips them.
 *
 * For those, the requirement id is the only available evidence: a test file
 * that mentions neither `REQ-014` nor any scenario of REQ-014 is not visibly
 * proving REQ-014.
 *
 * Returns true when the link has no evidence in it.
 *
 * ## The limit, stated rather than hidden
 *
 * This says the artifact does not *mention* the requirement. It cannot say the
 * artifact does not *prove* it — that needs the suite executed and coverage
 * attributed per test, which this tool does not do. Naming is a proxy, and the
 * flag it lives behind is opt-in for exactly that reason.
 */
export function linkIsUnevidenced(
  requirementId: string,
  featureSource: string,
  testSources: readonly string[]
): boolean {
  if (!requirementId) return false;
  const haystack = testSources.map(normalise).join("\n");
  if (haystack === "") return true;

  if (haystack.includes(normalise(requirementId))) return false;

  return !scenariosIn(featureSource).some((scenario) =>
    scenario.needles.some((needle) => haystack.includes(normalise(needle)))
  );
}

/**
 * Does this project name requirements or scenarios in its tests at all?
 *
 * ## Why the check has to ask this first
 *
 * `--strict-coverage` matches names, and that works because agents and people
 * writing tests alongside scenarios do it without being asked. It does **not**
 * work for the case this product leads with. Retro-fitting specs onto a
 * brownfield repository means pointing a row at a test that already exists and
 * was written years before anyone had heard of this tool — and the only way to
 * satisfy a name match there is to edit that test.
 *
 * Which is exactly what `adopt` promises it will never make you do. Measured on
 * a real adoption: every retro-fitted row failed `link_without_evidence`, and
 * the only fix was to write `REQ-006` into someone's existing test file. A gate
 * that contradicts the product's headline promise is not a gate, it is a
 * reason to stop using the product.
 *
 * So the check calibrates on the project instead of assuming. If some tests
 * name their requirements and others do not, the silent ones are worth
 * reporting. If none do, the convention is not in use here and the honest
 * answer is to say the check could not run — not to fail every row for
 * following a convention nobody adopted.
 */
export function usesNamingConvention(
  rows: readonly { requirement?: string; feature: string; tests: readonly string[] }[]
): boolean {
  return rows.some((row) => !linkIsUnevidenced(row.requirement || "", row.feature, row.tests));
}
