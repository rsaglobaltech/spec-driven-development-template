/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */

/*
 * Mutation testing over the compiled output, not the TypeScript source.
 *
 * Everything in this repository runs against `dist/` — that is what `npm test`
 * executes and what the published package ships. Mutating the source would need
 * a rebuild per mutant; mutating the artefact under test is both faster and
 * closer to what the gate actually protects.
 *
 * Run with: npm run mutation:pilot  (builds first)
 */
export default {
  // The most logic-dense modules: the pack model and the delta engine.
  //
  // These paths moved. `6ada847` dissolved the re-export shims, so
  // `dist/scripts/domain-pack/common.js` stopped existing and
  // `dist/scripts/change/delta.js` shrank to 19 lines of re-exports — and this
  // file was never updated. Stryker only *warns* on a glob that matches nothing,
  // so the weekly pilot kept reporting a "mutation score" over a shim: 4 mutants,
  // one of the two targets missing entirely, and nothing red. That is H15's shape
  // again — a filter that matches nothing and reports success.
  //
  // `npm run mutation:pilot` now fails when a target resolves to no file, so this
  // cannot rot silently a third time.
  mutate: [
    "dist/packages/core/src/domain/PackSpec.js",
    "dist/packages/core/src/domain/DeltaSpec.js",
  ],

  testRunner: "command",
  commandRunner: {
    command:
      "node --test dist/tests/unit/common.test.js dist/tests/unit/property-based.test.js dist/tests/unit/change-delta.test.js",
  },

  mutator: {
    plugins: [],
    // Error message wording is not behaviour; mutating it only produces
    // survivors nobody should chase.
    excludedMutations: ["StringLiteral"],
  },

  coverageAnalysis: "off",

  // A recorded baseline, not yet a gate. `break` stays 0 until the score is
  // stable enough that failing on it would be honest rather than noisy.
  thresholds: { high: 60, low: 40, break: 0 },

  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },

  cleanTempDir: "always",
  timeoutMS: 30000,
  timeoutFactor: 1.5,
  concurrency: 2,
};
