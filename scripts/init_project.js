#!/usr/bin/env node
"use strict";

/**
 * Node.js port of new_spec_project.sh — invoked via --engine=node on the
 * 'init' command. Accepts the same flags and produces identical output.
 *
 * Usage (via dispatcher):
 *   create-spec-driven-app init --engine=node --config <path> --out <dir> [--force] [--dry-run] [--no-git]
 *
 * Can also be run directly:
 *   node scripts/init_project.js --config <path> --out <dir>
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logWarn(msg) {
  process.stdout.write(`⚠️ [WARN] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app init --config <path> --out <directory> [--force] [--dry-run] [--no-git]\n\n" +
      "Options:\n" +
      "  --config <path>   Configuration file (required)\n" +
      "  --out <dir>       Parent directory for generated project (required)\n" +
      "  --force           Overwrite target directory if it already exists\n" +
      "  --dry-run         Print actions without writing files\n" +
      "  --no-git          Skip git initialization\n"
  );
}

function parseArgs(argv) {
  const opts = { config: null, out: null, force: false, dryRun: false, noGit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" && argv[i + 1]) {
      opts.config = argv[++i];
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = argv[++i];
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--no-git") {
      opts.noGit = true;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a === "--engine" || a.startsWith("--engine=")) {
      /* consumed by dispatcher */
    } else {
      logError(`Unknown argument: ${a}`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

// ── Config file parsing ───────────────────────────────────────────────────────

function stripInlineComment(s) {
  return s.replace(/#.*$/, "");
}

function stripQuotes(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

const KNOWN_KEYS = new Set([
  "PROJECT_NAME",
  "PROJECT_SLUG",
  "PROJECT_TYPE",
  "DOMAIN",
  "LANG",
  "STACK",
  "API_STYLE",
  "TESTING",
  "ENVIRONMENTS",
  "DEFAULT_ENV",
  "DOCKER_SUPPORT",
  "DEVCONTAINER_SUPPORT",
  "DATABASE_ENGINE",
  "DATABASE_VERSION",
  "DATABASE_IMAGE",
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_PORT_DEV",
  "DATABASE_PORT_FEATURE",
  "DATABASE_PORT_PROD",
  "DATABASE_CONTAINER_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "MODULES",
]);

function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    logError(`Config file not found: ${configPath}`);
    process.exit(2);
  }
  const raw = {};
  const lines = fs.readFileSync(configPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      logError(`Invalid config line: ${trimmed}`);
      process.exit(2);
    }
    const key = trimmed.slice(0, eq).trim();
    const value = stripQuotes(stripInlineComment(trimmed.slice(eq + 1)).trim());
    if (KNOWN_KEYS.has(key)) {
      raw[key] = value;
    } else {
      logWarn(`Unknown config key (ignored): ${key}`);
    }
  }
  return raw;
}

function validateConfig(cfg) {
  const required = [
    "PROJECT_NAME",
    "PROJECT_SLUG",
    "PROJECT_TYPE",
    "DOMAIN",
    "STACK",
    "API_STYLE",
    "TESTING",
  ];
  for (const k of required) {
    if (!cfg[k]) {
      logError(`Missing ${k} in config`);
      process.exit(2);
    }
  }

  cfg.LANG = cfg.LANG || "en";
  cfg.MODULES = cfg.MODULES || "";
  cfg.ENVIRONMENTS = cfg.ENVIRONMENTS || "dev,feature,prod";
  cfg.DEFAULT_ENV = cfg.DEFAULT_ENV || "dev";
  cfg.DOCKER_SUPPORT = cfg.DOCKER_SUPPORT || "true";
  cfg.DEVCONTAINER_SUPPORT = cfg.DEVCONTAINER_SUPPORT || "true";
  cfg.DATABASE_ENGINE = cfg.DATABASE_ENGINE || "postgres";
  cfg.DATABASE_VERSION = cfg.DATABASE_VERSION || "16";
  cfg.DATABASE_HOST = cfg.DATABASE_HOST || "db";
  cfg.DATABASE_PORT = cfg.DATABASE_PORT || "5432";
  cfg.DATABASE_PORT_DEV = cfg.DATABASE_PORT_DEV || cfg.DATABASE_PORT;
  cfg.DATABASE_PORT_FEATURE = cfg.DATABASE_PORT_FEATURE || "5433";
  cfg.DATABASE_PORT_PROD = cfg.DATABASE_PORT_PROD || "5434";
  cfg.DATABASE_CONTAINER_PORT = cfg.DATABASE_CONTAINER_PORT || "5432";
  cfg.DATABASE_NAME = cfg.DATABASE_NAME || cfg.PROJECT_SLUG.replace(/-/g, "_");
  cfg.DATABASE_NAME_DEV = `${cfg.DATABASE_NAME}_dev`;
  cfg.DATABASE_NAME_FEATURE = `${cfg.DATABASE_NAME}_feature`;
  cfg.DATABASE_NAME_PROD = `${cfg.DATABASE_NAME}_prod`;
  cfg.DATABASE_USER = cfg.DATABASE_USER || `${cfg.DATABASE_NAME}_app`;
  cfg.DATABASE_PASSWORD = cfg.DATABASE_PASSWORD || "change-me";

  const SUPPORTED_ENGINES = ["postgres"];
  if (!SUPPORTED_ENGINES.includes(cfg.DATABASE_ENGINE)) {
    logError(
      `DATABASE_ENGINE '${cfg.DATABASE_ENGINE}' is not supported. Supported engines: ${SUPPORTED_ENGINES.join(", ")}`
    );
    process.exit(2);
  }

  if (cfg.DOCKER_SUPPORT !== "true" && cfg.DEVCONTAINER_SUPPORT === "true") {
    logError("DEVCONTAINER_SUPPORT requires DOCKER_SUPPORT=true");
    process.exit(2);
  }

  cfg.DATABASE_IMAGE = cfg.DATABASE_IMAGE || `postgres:${cfg.DATABASE_VERSION}`;
  const dbUrl = (db) =>
    `postgresql://${cfg.DATABASE_USER}:${cfg.DATABASE_PASSWORD}@${cfg.DATABASE_HOST}:${cfg.DATABASE_CONTAINER_PORT}/${db}`;
  cfg.DATABASE_URL_DEV = dbUrl(cfg.DATABASE_NAME_DEV);
  cfg.DATABASE_URL_FEATURE = dbUrl(cfg.DATABASE_NAME_FEATURE);
  cfg.DATABASE_URL_PROD = dbUrl(cfg.DATABASE_NAME_PROD);

  if (!["backend", "frontend"].includes(cfg.PROJECT_TYPE)) {
    logError("PROJECT_TYPE must be backend or frontend");
    process.exit(2);
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(cfg.PROJECT_SLUG)) {
    logError("PROJECT_SLUG must use lowercase letters, numbers, and dashes (example: my-project)");
    process.exit(2);
  }

  return cfg;
}

// ── Template rendering ────────────────────────────────────────────────────────

function renderContent(content, vars) {
  return content.replace(/{{([A-Z][A-Z0-9_]*)}}/g, (_, token) => {
    if (!(token in vars)) {
      logWarn(`Template variable '{{${token}}}' not defined — leaving as-is.`);
      return `{{${token}}}`;
    }
    return String(vars[token]);
  });
}

function renderFile(src, dst, vars, dryRun) {
  if (dryRun) {
    logInfo(`[dry-run] render ${src} -> ${dst}`);
    return;
  }
  const content = fs.readFileSync(src, "utf8");
  const rendered = renderContent(content, vars);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, rendered, "utf8");
}

function renderTree(srcRoot, dstRoot, vars, dryRun) {
  if (!fs.existsSync(srcRoot)) return;
  const allFiles = walkDir(srcRoot).filter((f) => f.endsWith(".tpl"));
  allFiles.sort();
  for (const tpl of allFiles) {
    const rel = path.relative(srcRoot, tpl);
    const dstRel = rel.replace(/\.tpl$/, "");
    renderFile(tpl, path.join(dstRoot, dstRel), vars, dryRun);
  }
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// ── Runtime support flags ─────────────────────────────────────────────────────

function applyRuntimeSupportFlags(projectDir, cfg, dryRun) {
  if (cfg.DOCKER_SUPPORT !== "true") {
    if (dryRun) {
      logInfo("[dry-run] skip Docker artifacts");
      return;
    }
    for (const f of ["docker-compose.yml", ".dockerignore"]) {
      const p = path.join(projectDir, f);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
    for (const f of fs.readdirSync(projectDir)) {
      if (/^\.env\.\w+\.(infra|app)$/.test(f)) {
        fs.rmSync(path.join(projectDir, f));
      }
    }
    return;
  }
  if (cfg.DEVCONTAINER_SUPPORT !== "true") {
    if (dryRun) {
      logInfo("[dry-run] skip devcontainer artifacts");
      return;
    }
    const dc = path.join(projectDir, ".devcontainer");
    if (fs.existsSync(dc)) fs.rmSync(dc, { recursive: true, force: true });
  }
}

// ── Traceability coverage ─────────────────────────────────────────────────────

function featureTitleFromPath(rel) {
  return path.basename(rel, ".feature").replace(/_/g, " ");
}

function ensureTraceabilityCoverage(projectDir) {
  const traceFile = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(traceFile)) return;

  const content = fs.readFileSync(traceFile, "utf8");
  const isRich = content.includes(
    "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |"
  );

  const featuresDir = path.join(projectDir, "features");
  if (!fs.existsSync(featuresDir)) return;

  const featureFiles = walkDir(featuresDir)
    .filter((f) => f.endsWith(".feature"))
    .sort();
  const lines = [];
  let counter = 1;

  for (const ff of featureFiles) {
    const rel = path.relative(projectDir, ff);
    if (content.includes(rel)) continue;
    const title = featureTitleFromPath(rel);
    const scenarioId = `SCN-TBD-${String(counter).padStart(3, "0")}`;
    const ucId = `UC-TBD-${String(counter).padStart(3, "0")} ${title}`;
    if (isRich) {
      lines.push(
        `| REQ-TBD | ${scenarioId} | \`${rel}\` | ${ucId} | TBD | TBD | TBD | TBD | TBD | Draft |`
      );
    } else {
      lines.push(`| \`${rel}\` | ${title} | TBD | Draft |`);
    }
    counter++;
  }

  if (lines.length > 0) {
    fs.appendFileSync(traceFile, "\n" + lines.join("\n") + "\n", "utf8");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // When called via dispatcher, argv[2] is the "init" command and possibly
  // "--engine=node" — skip everything up to actual flags.
  let rawArgs = process.argv.slice(2);
  // Strip leading "init" token if present (called directly via node)
  if (rawArgs[0] === "init") rawArgs = rawArgs.slice(1);

  const opts = parseArgs(rawArgs);

  if (!opts.config) {
    logError("--config is required");
    usage();
    process.exit(2);
  }
  if (!opts.out) {
    logError("--out is required");
    usage();
    process.exit(2);
  }

  const cfg = validateConfig(parseConfig(opts.config));
  const projectDir = path.join(path.resolve(opts.out), cfg.PROJECT_SLUG);

  if (fs.existsSync(projectDir) && !opts.force) {
    logError(`Destination already exists: ${projectDir} (use --force to overwrite)`);
    process.exit(4);
  }

  if (opts.dryRun) {
    logInfo(`[dry-run] project would be generated at: ${projectDir}`);
  } else {
    if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
    fs.mkdirSync(projectDir, { recursive: true });
  }

  logInfo("🧩 Rendering base template");
  renderTree(path.join(TEMPLATES_DIR, "base"), projectDir, cfg, opts.dryRun);
  applyRuntimeSupportFlags(projectDir, cfg, opts.dryRun);

  logInfo(`🛠️ Applying project type template: ${cfg.PROJECT_TYPE}`);
  renderFile(
    path.join(TEMPLATES_DIR, cfg.PROJECT_TYPE, "AI_RULES.md.tpl"),
    path.join(projectDir, "AI_RULES.md"),
    cfg,
    opts.dryRun
  );
  renderTree(
    path.join(TEMPLATES_DIR, cfg.PROJECT_TYPE, "features"),
    path.join(projectDir, "features"),
    cfg,
    opts.dryRun
  );

  if (cfg.MODULES) {
    for (let mod of cfg.MODULES.split(",")) {
      mod = mod.trim();
      if (!mod) continue;
      const modTpl = path.join(TEMPLATES_DIR, "modules", mod, cfg.PROJECT_TYPE);
      if (fs.existsSync(modTpl)) {
        logInfo(`➕ Adding module: ${mod}`);
        renderTree(modTpl, path.join(projectDir, "features", mod), cfg, opts.dryRun);
      } else {
        logWarn(`Template missing for module '${mod}' and type '${cfg.PROJECT_TYPE}'`);
      }
    }
  } else {
    logInfo("🧩 No optional modules selected. Generating base + project-type features only.");
  }

  if (!opts.dryRun) {
    ensureTraceabilityCoverage(projectDir);
  }

  if (!opts.noGit) {
    if (opts.dryRun) {
      logInfo(`[dry-run] git init at ${projectDir}`);
    } else {
      const git = spawnSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
      if (git.error || git.status !== 0) {
        logWarn("git init failed — skipping git initialization.");
      }
    }
  }

  logInfo("📋 Summary");
  logInfo(`- Project: ${cfg.PROJECT_NAME}`);
  logInfo(`- Slug: ${cfg.PROJECT_SLUG}`);
  logInfo(`- Type: ${cfg.PROJECT_TYPE}`);
  logInfo(`- Domain: ${cfg.DOMAIN}`);
  logInfo(`- Output: ${projectDir}`);
  logInfo(`- Dry-run: ${opts.dryRun}`);
  logInfo(`- Git: ${opts.noGit ? "skipped" : "initialized"}`);
  logInfo("✅ Generation completed");
  process.exit(0);
}

main();
