"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = require("node:path").resolve(__dirname.split("/tests")[0].replace(/\/dist$/, ""));
const CLI_PATH = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

function cli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    ...options,
  });
}

function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csda-adopt-"));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Brownfield fixture: a Spring Boot / HAPI FHIR Maven project with code. */
function makeMavenProject(tmp) {
  const dir = path.join(tmp, "hie-his-platform");
  fs.mkdirSync(path.join(dir, "src", "main", "java", "com", "hie"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pom.xml"),
    `<?xml version="1.0"?>
<project>
  <name>HIE/HIS Platform</name>
  <artifactId>hie-his-platform</artifactId>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>ca.uhn.hapi.fhir</groupId><artifactId>hapi-fhir-base</artifactId></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>testcontainers</artifactId></dependency>
  </dependencies>
</project>
`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "README.md"), "# Existing README — do not touch\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "src", "main", "java", "com", "hie", "App.java"),
    "public class App {}\n",
    "utf8"
  );
  return dir;
}

test("adopt on a Maven project detects the stack and passes validate", () => {
  withTmp((tmp) => {
    const dir = makeMavenProject(tmp);
    const readmeBefore = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    const javaBefore = fs.readFileSync(
      path.join(dir, "src", "main", "java", "com", "hie", "App.java"),
      "utf8"
    );

    const r = cli(["adopt", "--project-dir", dir, "--var", "DOMAIN=health information exchange"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Stack detection: pom\.xml/);
    assert.match(r.stdout, /Java 21, Spring Boot, HAPI FHIR, Maven/);
    assert.match(r.stdout, /mvn -B test/);

    // SDD artifacts generated.
    for (const f of [
      "spec.md",
      "AI_RULES.md",
      "features/adoption/baseline.feature",
      "docs/specs/traceability.md",
      "docs/specs/adr/README.md",
    ]) {
      assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
    }
    assert.match(fs.readFileSync(path.join(dir, "spec.md"), "utf8"), /HIE\/HIS Platform/);
    assert.match(fs.readFileSync(path.join(dir, "spec.md"), "utf8"), /health information exchange/);

    // Existing files untouched.
    assert.equal(fs.readFileSync(path.join(dir, "README.md"), "utf8"), readmeBefore);
    assert.equal(
      fs.readFileSync(path.join(dir, "src", "main", "java", "com", "hie", "App.java"), "utf8"),
      javaBefore
    );

    // The adopted project validates immediately — the A1 acceptance criterion.
    const v = cli(["validate", dir]);
    assert.equal(v.status, 0, v.stdout + v.stderr);
    const strict = cli(["validate", dir, "--strict-tdd"]);
    assert.equal(strict.status, 0, strict.stdout + strict.stderr);
  });
});

test("adopt on a Node project reads package.json facts", () => {
  withTmp((tmp) => {
    const dir = path.join(tmp, "web-api");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "@acme/web-api",
        scripts: { test: "vitest run" },
        devDependencies: { typescript: "^5", vitest: "^2" },
        dependencies: { express: "^4" },
      }),
      "utf8"
    );

    const r = cli(["adopt", "--project-dir", dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Stack detection: package\.json/);
    assert.match(r.stdout, /Node\.js, TypeScript, express/);
    const rules = fs.readFileSync(path.join(dir, "AI_RULES.md"), "utf8");
    assert.match(rules, /web-api/);
    assert.match(rules, /Vitest/);
    assert.match(rules, /npm test/);
    // README was missing → adopt creates a stub so validate passes.
    assert.ok(fs.existsSync(path.join(dir, "README.md")));

    const v = cli(["validate", dir]);
    assert.equal(v.status, 0, v.stdout + v.stderr);
  });
});

test("adopt refuses a project that already has spec.md", () => {
  withTmp((tmp) => {
    const dir = path.join(tmp, "already");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spec.md"), "# Spec\n", "utf8");
    const r = cli(["adopt", "--project-dir", dir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /already exists/);
    assert.match(r.stderr, /validate/);
  });
});

test("adopt --dry-run writes nothing", () => {
  withTmp((tmp) => {
    const dir = makeMavenProject(tmp);
    const r = cli(["adopt", "--project-dir", dir, "--dry-run"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\[dry-run\] write spec\.md/);
    assert.ok(!fs.existsSync(path.join(dir, "spec.md")));
    assert.ok(!fs.existsSync(path.join(dir, "features")));
  });
});

test("adopt never overwrites an existing artifact", () => {
  withTmp((tmp) => {
    const dir = makeMavenProject(tmp);
    fs.writeFileSync(path.join(dir, "AI_RULES.md"), "# My custom rules\n", "utf8");
    const r = cli(["adopt", "--project-dir", dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /skip \(exists\): AI_RULES\.md/);
    assert.equal(fs.readFileSync(path.join(dir, "AI_RULES.md"), "utf8"), "# My custom rules\n");
  });
});

test("adopt with no build manifest warns but still validates", () => {
  withTmp((tmp) => {
    const dir = path.join(tmp, "bare");
    fs.mkdirSync(dir, { recursive: true });
    const r = cli(["adopt", "--project-dir", dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Could not detect the stack/);
    const v = cli(["validate", dir]);
    assert.equal(v.status, 0, v.stdout + v.stderr);
  });
});
