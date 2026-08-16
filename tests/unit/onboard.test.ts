"use strict";

/**
 * `csda onboard` — reading a repository that has code but no specs.
 *
 * The heuristic is deliberately conservative: it proposes capabilities from
 * directories a team already named, and says nothing when the layout implies
 * nothing. A confident wrong answer here is worse than silence, because the
 * whole point is to give someone something to argue with on day one.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

const { proposeCapabilities, descendThroughWrappers, titleCase } = require("../../scripts/onboard");

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ROOT_DIR });
}

/** Build a fake repository from a map of path → contents. */
function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onboard-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents as string, "utf8");
  }
  return dir;
}

test("capabilities come from the directories a team already named", () => {
  const dir = repo({
    "domain/booking/Booking.ts": "export class Booking {}",
    "domain/booking/BookingRepo.ts": "export interface BookingRepo {}",
    "domain/billing/Invoice.ts": "export class Invoice {}",
    "domain/identity/User.ts": "export class User {}",
    "package.json": "{}",
  });
  try {
    const caps = proposeCapabilities(dir);
    assert.deepEqual(caps.map((c) => c.id).sort(), ["billing", "booking", "identity"]);
    // Ordered by weight, so the biggest area is the one to describe first.
    assert.equal(caps[0].id, "booking");
    // Every proposal names where it came from — it is an argument, not a verdict.
    assert.equal(caps[0].evidence, "domain/booking");
    assert.equal(caps[0].files, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("build and test directories are never proposed as capabilities", () => {
  const dir = repo({
    "src/modules/orders/Order.java": "class Order {}",
    "src/modules/shipping/Ship.java": "class Ship {}",
    "src/modules/config/Config.java": "class Config {}",
    "node_modules/left-pad/index.js": "module.exports = 1;",
    "dist/bundle.js": "//",
    "tests/OrderTest.java": "//",
  });
  try {
    const ids = proposeCapabilities(dir).map((c) => c.id);
    assert.deepEqual(ids.sort(), ["orders", "shipping"]);
    assert.ok(!ids.includes("config"));
    assert.ok(!ids.includes("node_modules"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a Java package root is walked through, not proposed", () => {
  // src/main/java/com/acme/ — stopping early would propose "com" as a capability.
  const dir = repo({
    "src/main/java/com/acme/billing/Invoice.java": "class Invoice {}",
    "src/main/java/com/acme/catalog/Item.java": "class Item {}",
    "pom.xml": "<project/>",
  });
  try {
    const caps = proposeCapabilities(dir);
    assert.deepEqual(caps.map((c) => c.id).sort(), ["billing", "catalog"]);
    assert.ok(!caps.some((c) => c.id === "com"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a layout that implies nothing proposes nothing", () => {
  // Silence beats a confident wrong answer.
  const dir = repo({ "index.js": "console.log(1);", "package.json": "{}" });
  try {
    assert.deepEqual(proposeCapabilities(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("descendThroughWrappers stops at the first meaningful level", () => {
  const dir = repo({ "a/b/c/billing/x.ts": "//", "a/b/c/orders/y.ts": "//" });
  try {
    const base = descendThroughWrappers(path.join(dir, "a"));
    assert.equal(path.basename(base), "c");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("titleCase reads directory names the way a person would", () => {
  assert.equal(titleCase("order-history"), "Order History");
  assert.equal(titleCase("user_accounts"), "User Accounts");
  assert.equal(titleCase("paymentGateway"), "Payment Gateway");
});

test("onboard runs on a repository that is not adopted yet", () => {
  // Every other command requires a spec-driven project. This one exists for
  // repositories that are not one, so it must not demand spec.md.
  const dir = repo({
    "domain/booking/Booking.ts": "//",
    "domain/billing/Invoice.ts": "//",
    "package.json": JSON.stringify({ name: "acme", dependencies: { react: "18" } }),
  });
  try {
    const r = cli("onboard", "--project-dir", dir, "--json");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.onboarding.adopted, false);
    assert.equal(doc.onboarding.nextCommand, "csda adopt");
    assert.equal(doc.onboarding.capabilities.length, 2);
    assert.match(doc.onboarding.stack.name, /Node\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("once adopted, the next step is describing the largest capability", () => {
  const dir = repo({
    "spec.md": "# Spec\n",
    "domain/booking/a.ts": "//",
    "domain/booking/b.ts": "//",
    "domain/billing/c.ts": "//",
  });
  try {
    const doc = JSON.parse(cli("onboard", "--project-dir", dir, "--json").stdout);
    assert.equal(doc.onboarding.adopted, true);
    assert.equal(doc.onboarding.nextCommand, "csda change new describe-booking");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable layout says so, with a way forward", () => {
  const dir = repo({ "index.js": "//" });
  try {
    const doc = JSON.parse(cli("onboard", "--project-dir", dir, "--json").stdout);
    const codes = doc.status.map((d) => d.code);
    assert.ok(codes.includes("capabilities_undetected"));
    for (const d of doc.status) assert.ok(d.fix, `${d.code} should carry a fix`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("onboard writes nothing", () => {
  const dir = repo({ "domain/a/x.ts": "//", "domain/b/y.ts": "//" });
  try {
    const before = fs.readdirSync(dir).sort();
    cli("onboard", "--project-dir", dir);
    assert.deepEqual(fs.readdirSync(dir).sort(), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
