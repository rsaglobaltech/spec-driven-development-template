#!/usr/bin/env node
/**
 * `adopt` — install Spec-Driven Development onto an EXISTING repository
 * (brownfield). Detects the stack from build manifests, then generates the
 * SDD artifacts (spec.md, AI_RULES.md, features/, docs/specs/) without ever
 * overwriting a file that already exists and without touching source code.
 *
 * Usage:
 *   csda adopt [--project-dir <dir>] [--dry-run] [--var KEY=VALUE]...
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { renderTemplate } from "./domain-pack/common";
import { slugify } from "./wizard";

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ADOPT_TEMPLATES = path.join(ROOT_DIR, "templates", "adopt");

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logWarn(msg) {
  process.stdout.write(`⚠️ [WARN] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}
function fail(msg, exitCode = 1) {
  logError(msg);
  process.exit(exitCode);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  csda adopt [--project-dir <dir>] [--dry-run] [--var KEY=VALUE]...\n\n" +
      "Installs Spec-Driven Development on an existing repository:\n" +
      "- detects the stack from pom.xml / build.gradle / package.json / go.mod\n" +
      "- generates spec.md, AI_RULES.md, features/adoption/baseline.feature,\n" +
      "  docs/specs/traceability.md and docs/specs/adr/README.md\n" +
      "- never overwrites existing files and never modifies source code\n\n" +
      "Options:\n" +
      "  --project-dir <dir>  Repository to adopt (default: current directory)\n" +
      "  --dry-run            Print what would be written without writing\n" +
      "  --var KEY=VALUE      Override a detected value (PROJECT_NAME, PROJECT_SLUG,\n" +
      "                       DOMAIN, STACK, API_STYLE, TESTING, TEST_CMD)\n"
  );
}

function parseArgs(argv) {
  const opts = { projectDir: process.cwd(), dryRun: false, vars: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) {
      opts.projectDir = path.resolve(argv[++i]);
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--var" && argv[i + 1]) {
      const pair = argv[++i];
      const eq = pair.indexOf("=");
      if (eq === -1) fail(`--var expects KEY=VALUE, got: ${pair}`, 2);
      opts.vars[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else {
      logError(`Unknown argument: ${a}`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

// ── Stack detection ───────────────────────────────────────────────────────────

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Inspect build manifests at the project root and derive stack facts.
 * Returns { PROJECT_NAME, STACK, TESTING, TEST_CMD, detected }.
 */
export function detectStack(dir) {
  const facts = {
    PROJECT_NAME: path.basename(dir),
    STACK: "unknown — edit AI_RULES.md with your stack",
    TESTING: "unknown — edit AI_RULES.md with your test toolchain",
    TEST_CMD: "echo 'configure your test command'",
    detected: "none",
  };

  const pom = readIfExists(path.join(dir, "pom.xml"));
  if (pom !== null) {
    const parts = ["Java"];
    const javaVersion =
      pom.match(/<java\.version>([^<]+)<\/java\.version>/) ||
      pom.match(/<maven\.compiler\.release>([^<]+)<\/maven\.compiler\.release>/);
    if (javaVersion) parts[0] = `Java ${javaVersion[1].trim()}`;
    if (pom.includes("spring-boot")) parts.push("Spring Boot");
    if (pom.includes("quarkus")) parts.push("Quarkus");
    if (pom.includes("hapi-fhir")) parts.push("HAPI FHIR");
    parts.push("Maven");
    const artifactId = pom.match(/<artifactId>([^<]+)<\/artifactId>/);
    const name = pom.match(/<name>([^<]+)<\/name>/);
    if (name) facts.PROJECT_NAME = name[1].trim();
    else if (artifactId) facts.PROJECT_NAME = artifactId[1].trim();
    facts.STACK = parts.join(", ");
    facts.TESTING = pom.includes("testcontainers") ? "JUnit 5, Testcontainers" : "JUnit 5";
    facts.TEST_CMD = fs.existsSync(path.join(dir, "mvnw")) ? "./mvnw -B test" : "mvn -B test";
    facts.detected = "pom.xml";
    return facts;
  }

  const gradle =
    readIfExists(path.join(dir, "build.gradle")) ||
    readIfExists(path.join(dir, "build.gradle.kts"));
  if (gradle !== null) {
    const parts = [gradle.includes("kotlin") ? "Kotlin" : "Java"];
    if (gradle.includes("spring-boot") || gradle.includes("org.springframework.boot")) {
      parts.push("Spring Boot");
    }
    parts.push("Gradle");
    facts.STACK = parts.join(", ");
    facts.TESTING = "JUnit 5";
    facts.TEST_CMD = fs.existsSync(path.join(dir, "gradlew")) ? "./gradlew test" : "gradle test";
    facts.detected = "build.gradle";
    return facts;
  }

  const pkgRaw = readIfExists(path.join(dir, "package.json"));
  if (pkgRaw !== null) {
    let pkg; // any: shape depends on the user's package.json
    try {
      pkg = JSON.parse(pkgRaw);
    } catch {
      logWarn("package.json is not valid JSON — falling back to generic Node.js facts.");
    }
    if (!pkg || typeof pkg !== "object") pkg = {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const parts = ["Node.js"];
    if (deps.typescript) parts.push("TypeScript");
    for (const fw of ["react", "vue", "@angular/core", "express", "fastify", "next"]) {
      if (deps[fw]) parts.push(fw.replace("@angular/core", "Angular"));
    }
    if (pkg.name) facts.PROJECT_NAME = String(pkg.name).replace(/^@[^/]+\//, "");
    facts.STACK = parts.join(", ");
    facts.TESTING = deps.vitest ? "Vitest" : deps.jest ? "Jest" : "npm test";
    facts.TEST_CMD = pkg.scripts && pkg.scripts.test ? "npm test" : facts.TEST_CMD;
    facts.detected = "package.json";
    return facts;
  }

  if (readIfExists(path.join(dir, "go.mod")) !== null) {
    facts.STACK = "Go";
    facts.TESTING = "go test";
    facts.TEST_CMD = "go test ./...";
    facts.detected = "go.mod";
    return facts;
  }

  return facts;
}

// ── Generation ────────────────────────────────────────────────────────────────

/** Files adopt generates, as [template, destination] pairs. */
const ADOPT_FILES = [
  ["spec.md.tpl", "spec.md"],
  ["AI_RULES.md.tpl", "AI_RULES.md"],
  ["baseline.feature.tpl", "features/adoption/baseline.feature"],
  ["traceability.md.tpl", "docs/specs/traceability.md"],
  ["adr-readme.md.tpl", "docs/specs/adr/README.md"],
];

function main() {
  let rawArgs = process.argv.slice(2);
  if (rawArgs[0] === "adopt") rawArgs = rawArgs.slice(1);
  const opts = parseArgs(rawArgs);
  const dir = opts.projectDir;

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`Directory not found: ${dir}`, 2);
  }
  if (fs.existsSync(path.join(dir, "spec.md"))) {
    fail(
      `${path.join(dir, "spec.md")} already exists — this repository looks spec-driven already.\n` +
        "Run `csda validate .` to check it, or remove spec.md to re-adopt.",
      2
    );
  }

  const detected = detectStack(dir);
  const vars = {
    PROJECT_NAME: detected.PROJECT_NAME,
    PROJECT_SLUG: slugify(detected.PROJECT_NAME),
    DOMAIN: "general",
    STACK: detected.STACK,
    API_STYLE: "REST with DTO boundaries",
    TESTING: detected.TESTING,
    TEST_CMD: detected.TEST_CMD,
    ...opts.vars,
  };

  logInfo(
    `🔍 Stack detection: ${detected.detected === "none" ? "no build manifest found" : detected.detected}`
  );
  logInfo(`- Project: ${vars.PROJECT_NAME}`);
  logInfo(`- Stack: ${vars.STACK}`);
  logInfo(`- Test command: ${vars.TEST_CMD}`);
  if (detected.detected === "none") {
    logWarn("Could not detect the stack — review AI_RULES.md and traceability.md after adoption.");
  }

  let written = 0;
  let skipped = 0;
  for (const [tpl, dst] of ADOPT_FILES) {
    const dstPath = path.join(dir, dst);
    if (fs.existsSync(dstPath)) {
      logWarn(`skip (exists): ${dst}`);
      skipped++;
      continue;
    }
    const rendered = renderTemplate(fs.readFileSync(path.join(ADOPT_TEMPLATES, tpl), "utf8"), vars);
    if (opts.dryRun) {
      logInfo(`[dry-run] write ${dst}`);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.writeFileSync(dstPath, rendered, "utf8");
      logInfo(`write ${dst}`);
    }
    written++;
  }

  if (!fs.existsSync(path.join(dir, "README.md")) && !opts.dryRun) {
    fs.writeFileSync(
      path.join(dir, "README.md"),
      `# ${vars.PROJECT_NAME}\n\nBuild and test: \`${vars.TEST_CMD}\`\n`,
      "utf8"
    );
    logInfo("write README.md (was missing)");
    written++;
  }

  logInfo("📋 Summary");
  logInfo(`- Files written: ${written}${opts.dryRun ? " (dry-run, nothing on disk)" : ""}`);
  logInfo(`- Files skipped (already present): ${skipped}`);
  logInfo("✅ Adoption completed. Next steps:");
  logInfo("  1. csda validate .          # should pass right now");
  logInfo("  2. Retro-fill real requirements in spec.md (one REQ per behaviour you rely on)");
  logInfo("  3. csda plan                # see what each REQ still needs");
  logInfo("  4. Add `validate --strict-tdd` to CI to lock the gate in");
  process.exit(0);
}

if (require.main === module) main();
