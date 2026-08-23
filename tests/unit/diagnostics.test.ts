/**
 * `errorMessage` is the narrowing every `catch (err: unknown)` in the CLI goes
 * through, so a defect here surfaces only on the error path — exactly where it
 * is least likely to be exercised. These tests pin each branch.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  errorMessage,
  diagnostic,
  error,
  hasErrors,
  countBySeverity,
} from "../../scripts/lib/diagnostics.js";

test("errorMessage unwraps an Error to its message", () => {
  // Regression: this branch once recursed into errorMessage(err) instead of
  // reading err.message, so every reported Error blew the stack.
  assert.equal(errorMessage(new Error("boom")), "boom");
});

test("errorMessage passes a thrown string through", () => {
  assert.equal(errorMessage("plain failure"), "plain failure");
});

test("errorMessage stringifies anything else that was thrown", () => {
  assert.equal(errorMessage(42), "42");
  assert.equal(errorMessage(null), "null");
  assert.equal(errorMessage(undefined), "undefined");
});

test("errorMessage handles an Error subclass and an empty message", () => {
  class PackError extends Error {}
  assert.equal(errorMessage(new PackError("pack missing")), "pack missing");
  assert.equal(errorMessage(new Error()), "");
});

test("diagnostic keeps only the optional fields it was given", () => {
  assert.deepEqual(diagnostic("error", "boom_code", "boom"), {
    severity: "error",
    code: "boom_code",
    message: "boom",
  });

  assert.deepEqual(error("boom_code", "boom", { fix: "do the thing", line: 0 }), {
    severity: "error",
    code: "boom_code",
    message: "boom",
    fix: "do the thing",
    line: 0,
  });
});

test("hasErrors and countBySeverity tolerate an absent list", () => {
  assert.equal(hasErrors(undefined), false);
  assert.deepEqual(countBySeverity(undefined), { error: 0, warning: 0, info: 0 });
});
