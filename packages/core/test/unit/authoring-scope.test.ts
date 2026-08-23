/**
 * The `spec-author` boundary.
 *
 * Every case here is a way an agent asked to *describe* a change could instead
 * quietly *make* it — editing the capability spec so the proposal becomes
 * unnecessary, or flipping a row in the matrix. The role exists to write a
 * proposal a human reads; the boundary is what keeps it to that.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { changeScope, isInScope, judgeScope } from "../../src/domain/AuthoringScope";

test("the scope is the change's own directory", () => {
  assert.equal(changeScope("add-pricing"), "docs/specs/changes/add-pricing/");
});

test("everything the change owns is writable", () => {
  for (const p of [
    "docs/specs/changes/add-pricing/proposal.md",
    "docs/specs/changes/add-pricing/tasks.md",
    "docs/specs/changes/add-pricing/specs/billing/spec.md",
    "docs/specs/changes/add-pricing/features/billing/pricing.feature",
  ]) {
    assert.ok(isInScope(p, "add-pricing"), `${p} should be writable`);
  }
});

test("the things the role must never write are refused", () => {
  for (const p of [
    "spec.md",
    "docs/specs/traceability.md",
    "docs/specs/capabilities/billing/spec.md",
    "src/pricing.ts",
    "AI_RULES.md",
    "docs/specs/changes/another-change/proposal.md",
  ]) {
    assert.equal(isInScope(p, "add-pricing"), false, `${p} should be refused`);
  }
});

test("a path that climbs out is refused even though it starts inside", () => {
  // Prefix matching alone says yes to this, which is why it is not the test.
  assert.equal(
    isInScope("docs/specs/changes/add-pricing/../../capabilities/billing/spec.md", "add-pricing"),
    false
  );
});

test("a change whose name prefixes another is not a way in", () => {
  // `add-pricing-v2` starts with `add-pricing`; the trailing slash is what
  // stops one change from writing into another's directory.
  assert.equal(isInScope("docs/specs/changes/add-pricing-v2/proposal.md", "add-pricing"), false);
});

test("windows separators and a leading ./ are understood", () => {
  assert.ok(isInScope("docs\\specs\\changes\\add-pricing\\proposal.md", "add-pricing"));
  assert.ok(isInScope("./docs/specs/changes/add-pricing/proposal.md", "add-pricing"));
});

test("judgeScope separates what was permitted from what strayed", () => {
  const verdict = judgeScope(
    [
      "docs/specs/changes/add-pricing/proposal.md",
      "docs/specs/capabilities/billing/spec.md",
      "docs/specs/changes/add-pricing/specs/billing/spec.md",
      "src/pricing.ts",
    ],
    "add-pricing"
  );
  assert.deepEqual(verdict.allowed, [
    "docs/specs/changes/add-pricing/proposal.md",
    "docs/specs/changes/add-pricing/specs/billing/spec.md",
  ]);
  assert.deepEqual(verdict.strayed, ["docs/specs/capabilities/billing/spec.md", "src/pricing.ts"]);
});

test("an agent that wrote nothing outside its change strays nothing", () => {
  const verdict = judgeScope(["docs/specs/changes/x/proposal.md"], "x");
  assert.deepEqual(verdict.strayed, []);
});
