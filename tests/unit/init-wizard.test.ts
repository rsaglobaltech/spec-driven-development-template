/**
 * Unit test for the init wizard's pure helper (slugify). The interactive flow
 * itself is TTY-gated and exercised manually / via the --config path in
 * tests/cli.test.ts.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { slugify } from "../../scripts/init_project";

test("slugify lowercases and dash-separates", () => {
  assert.equal(slugify("My Cool App"), "my-cool-app");
});

test("slugify strips punctuation and collapses separators", () => {
  assert.equal(slugify("Acme — Energy/Hub!!"), "acme-energy-hub");
});

test("slugify trims leading/trailing separators", () => {
  assert.equal(slugify("  Hello  "), "hello");
});
