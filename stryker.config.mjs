/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  // Pilot scope: only the JS helpers in common.js (the most logic-dense file)
  mutate: ["scripts/domain-pack/common.js"],

  // Use node:test runner via the command test runner
  testRunner: "command",
  commandRunner: {
    command: "node --test tests/unit/common.test.js tests/unit/property-based.test.js",
  },

  // Mutation operators to apply
  mutator: {
    plugins: [],
    excludedMutations: [
      // String literals in error messages are not worth mutating
      "StringLiteral",
    ],
  },

  // Coverage analysis: static is fastest for a pilot
  coverageAnalysis: "off",

  // Report thresholds — pilot target: record baseline, not enforce yet
  thresholds: {
    high: 60,
    low: 40,
    break: 0,
  },

  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },

  // Keep temp files for inspection
  cleanTempDir: "always",

  timeoutMS: 30000,
  timeoutFactor: 1.5,

  // Concurrency: 2 workers for the pilot
  concurrency: 2,
};
