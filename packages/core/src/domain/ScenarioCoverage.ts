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
