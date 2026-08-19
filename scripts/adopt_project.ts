#!/usr/bin/env node
"use strict";

/**
 * `adopt` — install Spec-Driven Development onto an EXISTING repository
 * (brownfield). Detects the stack from build manifests, then generates the
 * SDD artifacts (spec.md, AI_RULES.md, features/, docs/specs/) without ever
 * overwriting a file that already exists and without touching source code.
 *
 * Usage:
 *   csda adopt [--project-dir <dir>] [--dry-run] [--var KEY=VALUE]...
 */

const fs = require("node:fs");
const path = require("node:path");
const { renderTemplate } = require("./domain-pack/common");
const { slugify } = require("./wizard");

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
      "  csda adopt [--project-dir <dir>] [--dry-run] [--monorepo]\n" +
      "             [--no-capabilities] [--var KEY=VALUE]...\n\n" +
      "Installs Spec-Driven Development on an existing repository:\n" +
      "- detects the stack from pom.xml / build.gradle / package.json / go.mod\n" +
      "- generates spec.md, AI_RULES.md, features/adoption/baseline.feature,\n" +
      "  docs/specs/traceability.md and docs/specs/adr/README.md\n" +
      "- seeds one proposed requirement per capability the layout implies\n" +
      "- never overwrites existing files and never modifies source code\n\n" +
      "Options:\n" +
      "  --project-dir <dir>  Repository to adopt (default: current directory)\n" +
      "  --dry-run            Print what would be written without writing\n" +
      "  --monorepo           Adopt every module the repository declares and write\n" +
      "                       the specops.config.yaml that `validate` reads\n" +
      "  --no-capabilities    Do not seed proposed requirements — skeleton only\n" +
      "  --var KEY=VALUE      Override a detected value (PROJECT_NAME, PROJECT_SLUG,\n" +
      "                       DOMAIN, STACK, API_STYLE, TESTING, TEST_CMD)\n"
  );
}

function parseArgs(argv) {
  const opts = {
    projectDir: process.cwd(),
    dryRun: false,
    monorepo: false,
    noCapabilities: false,
    vars: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) {
      opts.projectDir = path.resolve(argv[++i]);
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--monorepo") {
      opts.monorepo = true;
    } else if (a === "--no-capabilities") {
      opts.noCapabilities = true;
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
function detectStack(dir) {
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

/**
 * Turn the capabilities `onboard` reads off the layout into seeded requirements.
 *
 * Without this the two commands do not speak: `onboard` proposes eight
 * capabilities with evidence and file counts, and then `adopt` throws them away
 * and writes a single placeholder. That seam is where adoption dies — measured
 * on `lixi-platform`, adopted months ago and still sitting on `REQ-001` while
 * the repository carries 297 tests.
 *
 * Every seeded requirement is labelled a proposal and starts `Draft` with a
 * `TBD` test, so nothing here claims to be specified or verified. It exists to
 * replace the blank page with eight arguable statements.
 */
function buildProposedRequirements(capabilities) {
  if (capabilities.length === 0) return { spec: "", rows: "" };

  const spec = capabilities
    .map((cap, i) => {
      const id = `REQ-${String(i + 2).padStart(3, "0")}`;
      return (
        `\n## ${id} — ${cap.title}\n\n` +
        `**Proposed, not specified.** Read off \`${cap.evidence}\` ` +
        `(${cap.files} source file${cap.files === 1 ? "" : "s"}), which says this codebase has a\n` +
        `${cap.title} area — not what it must do. Replace this paragraph with one behaviour you\n` +
        `already rely on, add its scenario under \`features/${cap.id}/\`, then\n` +
        `\`csda req link ${id} --code <path> --test <path>\`.\n`
      );
    })
    .join("");

  const rows = capabilities
    .map((cap, i) => {
      const id = `REQ-${String(i + 2).padStart(3, "0")}`;
      return `| ${id} | - | - | UC-${String(i + 2).padStart(3, "0")} ${cap.title} | - | - | - | \`${cap.evidence}\` | TBD | Draft |`;
    })
    .join("\n");

  return { spec, rows: `${rows}\n` };
}

/** Adopt one directory. Returns what it wrote, or null when it was already adopted. */
function adoptOne(dir, opts, { quiet = false } = {}) {
  const say = quiet ? () => {} : logInfo;

  const detected = detectStack(dir);

  // Required lazily: onboard.ts imports detectStack from this file, and a
  // top-level require would close the cycle.
  const capabilities = opts.noCapabilities ? [] : require("./onboard").proposeCapabilities(dir);
  const proposed = buildProposedRequirements(capabilities);

  const vars = {
    PROJECT_NAME: detected.PROJECT_NAME,
    PROJECT_SLUG: slugify(detected.PROJECT_NAME),
    DOMAIN: "general",
    STACK: detected.STACK,
    API_STYLE: "REST with DTO boundaries",
    TESTING: detected.TESTING,
    TEST_CMD: detected.TEST_CMD,
    PROPOSED_REQUIREMENTS: proposed.spec,
    PROPOSED_ROWS: proposed.rows,
    ...opts.vars,
  };

  say(
    `🔍 Stack detection: ${detected.detected === "none" ? "no build manifest found" : detected.detected}`
  );
  say(`- Project: ${vars.PROJECT_NAME}`);
  say(`- Stack: ${vars.STACK}`);
  say(`- Test command: ${vars.TEST_CMD}`);
  if (detected.detected === "none" && !quiet) {
    logWarn("Could not detect the stack — review AI_RULES.md and traceability.md after adoption.");
  }

  let written = 0;
  let skipped = 0;
  for (const [tpl, dst] of ADOPT_FILES) {
    const dstPath = path.join(dir, dst);
    if (fs.existsSync(dstPath)) {
      if (!quiet) logWarn(`skip (exists): ${dst}`);
      skipped++;
      continue;
    }
    const rendered = renderTemplate(fs.readFileSync(path.join(ADOPT_TEMPLATES, tpl), "utf8"), vars);
    if (opts.dryRun) {
      say(`[dry-run] write ${dst}`);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.writeFileSync(dstPath, rendered, "utf8");
      say(`write ${dst}`);
    }
    written++;
  }

  if (!fs.existsSync(path.join(dir, "README.md")) && !opts.dryRun) {
    fs.writeFileSync(
      path.join(dir, "README.md"),
      `# ${vars.PROJECT_NAME}\n\nBuild and test: \`${vars.TEST_CMD}\`\n`,
      "utf8"
    );
    say("write README.md (was missing)");
    written++;
  }

  return { written, skipped, capabilities };
}

/**
 * `--monorepo`: adopt every module the repository declares, and write the
 * `specops.config.yaml` that puts `validate` into monorepo mode.
 *
 * The mode already existed (B8) but nothing generated its config, so the
 * documented path was "hand-write a projects list and run adopt once per
 * module". The module list is the same one `onboard` reads — a directory with
 * its own build manifest — so this is bookkeeping, not new inference.
 */
function adoptMonorepo(dir, opts) {
  const { findDeclaredModules } = require("./onboard");
  const modules = findDeclaredModules(dir);

  if (modules.length < 2) {
    fail(
      `--monorepo found ${modules.length} declared module(s) under ${dir}.\n` +
        "A module is a directory with its own build manifest (pom.xml, build.gradle,\n" +
        "package.json, Cargo.toml, go.mod, *.gemspec, *.csproj…).\n" +
        "Adopt this repository as a single project instead: csda adopt",
      2
    );
  }

  logInfo(`🗂️ Monorepo: ${modules.length} declared module(s)`);
  let written = 0;
  let skipped = 0;
  const adopted = [];

  for (const mod of modules) {
    const rel = path.relative(dir, mod.dir).split(path.sep).join("/");
    if (fs.existsSync(path.join(mod.dir, "spec.md"))) {
      logWarn(`skip (already adopted): ${rel}`);
      adopted.push(rel);
      skipped++;
      continue;
    }
    logInfo(`── ${rel}`);
    const r = adoptOne(mod.dir, opts, { quiet: true });
    logInfo(`   ${opts.dryRun ? "[dry-run] " : ""}${r.written} file(s), ${r.capabilities.length} capability requirement(s) seeded`);
    written += r.written;
    adopted.push(rel);
  }

  const cfgPath = path.join(dir, "specops.config.yaml");
  if (fs.existsSync(cfgPath)) {
    logWarn("skip (exists): specops.config.yaml — check its projects: list covers every module");
    skipped++;
  } else {
    const body =
      "# Monorepo layout for `csda validate .` — one entry per adopted module.\n" +
      "# Generated by `csda adopt --monorepo`; edit freely.\n" +
      "projects:\n" +
      adopted.map((rel) => `  - path: ${rel}\n`).join("");
    if (opts.dryRun) {
      logInfo("[dry-run] write specops.config.yaml");
    } else {
      fs.writeFileSync(cfgPath, body, "utf8");
      logInfo("write specops.config.yaml");
    }
    written++;
  }

  logInfo("📋 Summary");
  logInfo(`- Files written: ${written}${opts.dryRun ? " (dry-run, nothing on disk)" : ""}`);
  logInfo(`- Skipped: ${skipped}`);
  logInfo("✅ Adoption completed. Next steps:");
  logInfo("  1. csda validate .          # validates every module listed");
  logInfo("  2. Replace the seeded proposals in each module's spec.md with real behaviour");
  logInfo("  3. Add `validate --strict-tdd` to CI to lock the gate in");
  process.exit(0);
}

function main() {
  let rawArgs = process.argv.slice(2);
  if (rawArgs[0] === "adopt") rawArgs = rawArgs.slice(1);
  const opts = parseArgs(rawArgs);
  const dir = opts.projectDir;

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`Directory not found: ${dir}`, 2);
  }

  if (opts.monorepo) adoptMonorepo(dir, opts);

  if (fs.existsSync(path.join(dir, "spec.md"))) {
    fail(
      `${path.join(dir, "spec.md")} already exists — this repository looks spec-driven already.\n` +
        "Run `csda validate .` to check it, or remove spec.md to re-adopt.",
      2
    );
  }

  const { written, skipped, capabilities } = adoptOne(dir, opts);

  logInfo("📋 Summary");
  logInfo(`- Files written: ${written}${opts.dryRun ? " (dry-run, nothing on disk)" : ""}`);
  logInfo(`- Files skipped (already present): ${skipped}`);
  if (capabilities.length > 0) {
    logInfo(
      `- Requirements seeded: ${capabilities.length} proposal(s) from the layout — ${capabilities.map((c) => c.id).join(", ")}`
    );
  }
  logInfo("✅ Adoption completed. Next steps:");
  logInfo("  1. csda validate .          # should pass right now");
  if (capabilities.length > 0) {
    logInfo("  2. Argue with the seeded proposals in spec.md — each one names its evidence");
    logInfo("  3. csda plan                # see what each REQ still needs");
  } else {
    logInfo("  2. Retro-fill real requirements in spec.md (one REQ per behaviour you rely on)");
    logInfo("  3. csda plan                # see what each REQ still needs");
  }
  logInfo("  4. Add `validate --strict-tdd` to CI to lock the gate in");
  process.exit(0);
}

if (require.main === module) main();

module.exports = { detectStack, buildProposedRequirements };
