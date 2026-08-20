import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseYamlLite } from "../../../domain-pack/common";
import { runInitWizard, defaultAnswers, renderConfigYaml } from "./WizardCommand";
import { BaseCommand } from "../../../lib/command";

import { findCliRoot } from "../../../lib/project-root";

const ROOT_DIR = findCliRoot(__dirname);
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

export const PROJECT_TYPES = ["backend", "frontend", "mobile"];

function logInfo(msg: string) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logWarn(msg: string) {
  process.stdout.write(`⚠️ [WARN] ${msg}\n`);
}
function logError(msg: string) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  csda init [--config <path>] [--out <directory>] [--yes] [--force] [--dry-run]\n" +
      "                 [--no-git] [--no-sample-req]\n\n" +
      "Options:\n" +
      "  --config <path>   Configuration file. Accepts a YAML mapping (.yaml/.yml)\n" +
      '                    or the legacy KEY="value" format (.config). When omitted,\n' +
      "                    an interactive wizard asks for each value.\n" +
      "  --out <dir>       Parent directory for generated project (default: current directory)\n" +
      "  --yes, -y         Skip the wizard and accept every default (non-interactive)\n" +
      "  --force           Overwrite target directory if it already exists\n" +
      "  --dry-run         Print actions without writing files\n" +
      "  --no-git          Skip git initialization\n" +
      "  --no-sample-req   Omit the starter REQ-000 health requirement. Use when a\n" +
      "                    domain pack will supply the real ones (implied by\n" +
      "                    --from-pack).\n"
  );
}

export function parseArgs(argv: string[]) {
  const opts = {
    config: null as string | null,
    out: null as string | null,
    yes: false,
    force: false,
    dryRun: false,
    noGit: false,
    noSampleReq: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" && argv[i + 1]) {
      opts.config = argv[++i];
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = argv[++i];
    } else if (a === "--yes" || a === "-y") {
      opts.yes = true;
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--no-git") {
      opts.noGit = true;
    } else if (a === "--no-sample-req") {
      opts.noSampleReq = true;
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

function stripInlineComment(s: string) {
  return s.replace(/#.*$/, "");
}

function stripQuotes(s: string) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export const KNOWN_KEYS = new Set([
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
  "DATASTORE",
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

export function parseConfig(configPath: string) {
  if (!fs.existsSync(configPath)) {
    logError(`Config file not found: ${configPath}`);
    process.exit(2);
  }
  const content = fs.readFileSync(configPath, "utf8");
  const ext = path.extname(configPath).toLowerCase();
  return ext === ".yaml" || ext === ".yml"
    ? parseConfigYaml(content)
    : parseConfigKeyValue(content);
}

export function parseConfigKeyValue(content: string) {
  const raw: Record<string, string> = {};
  for (const line of content.split("\n")) {
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

export function parseConfigYaml(content: string) {
  let parsed: any;
  try {
    parsed = parseYamlLite(content);
  } catch (err: any) {
    logError(`Invalid YAML config: ${err.message}`);
    process.exit(2);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logError("YAML config must be a flat mapping of KEY: value pairs.");
    process.exit(2);
  }
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (KNOWN_KEYS.has(key)) {
      raw[key] = value === null || value === undefined ? "" : String(value);
    } else {
      logWarn(`Unknown config key (ignored): ${key}`);
    }
  }
  return raw;
}

function hasDatastore(cfg: any) {
  return cfg.DATASTORE !== "none";
}

function runtimeDockerSection(cfg: any) {
  if (cfg.DOCKER_SUPPORT !== "true") {
    return [
      "## Docker",
      "",
      "Docker support is disabled for this project (`DOCKER_SUPPORT=false`), so no",
      "`docker-compose.yml`, `.dockerignore` or `.devcontainer/` is generated. The",
      "environment contract above still holds: provision the database yourself and",
      "point `DATABASE_URL` at it.",
    ].join("\n");
  }

  const service = hasDatastore(cfg) ? cfg.DATABASE_HOST : "workspace";
  const lines = [
    "## Docker",
    "",
    "- Compose file: `docker-compose.yml`",
    ...(hasDatastore(cfg) ? [`- Database image: \`${cfg.DATABASE_IMAGE}\``] : []),
    `- Service name: \`${service}\``,
    "",
    "Bring one environment up:",
    "",
    "```bash",
    `APP_ENV=dev docker compose --env-file .env.dev up -d ${service}`,
    `APP_ENV=feature docker compose --env-file .env.feature up -d ${service}`,
    `APP_ENV=prod docker compose --env-file .env.prod up -d ${service}`,
    "```",
  ];

  if (cfg.DEVCONTAINER_SUPPORT === "true") {
    lines.push(
      "",
      "## Devcontainer",
      "",
      "- Configuration: `.devcontainer/devcontainer.json`",
      ...(hasDatastore(cfg)
        ? [
            "- The devcontainer joins the same Compose network as the database service,",
            `  so it reaches it at \`${cfg.DATABASE_HOST}:${cfg.DATABASE_CONTAINER_PORT}\`.`,
          ]
        : ["- The devcontainer runs the workspace service defined in `docker-compose.yml`."])
    );
  }

  return lines.join("\n");
}

function runtimeEnvTable(cfg: any) {
  const rows = [
    ["dev", "Local development and day-to-day implementation", "`.env.dev`", cfg.DATABASE_NAME_DEV],
    [
      "feature",
      "Short-lived branch or preview validation",
      "`.env.feature`",
      cfg.DATABASE_NAME_FEATURE,
    ],
    ["prod", "Production-like configuration contract", "`.env.prod`", cfg.DATABASE_NAME_PROD],
  ];
  if (!hasDatastore(cfg)) {
    return [
      "| Environment | Purpose | Env file |",
      "| --- | --- | --- |",
      ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
    ].join("\n");
  }
  return [
    "| Environment | Purpose | Env file | Database |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | \`${r[3]}\` |`),
  ].join("\n");
}

function runtimeDatabaseSection(cfg: any) {
  if (!hasDatastore(cfg)) {
    return [
      "## Data",
      "",
      "This project owns no datastore (`DATASTORE=none`). It reads its data through",
      "the APIs declared in `AI_RULES.md`; the environments above differ in",
      "configuration, not in schema.",
    ].join("\n");
  }
  return [
    "## Database",
    "",
    `- Engine: \`${cfg.DATABASE_ENGINE}\` (version \`${cfg.DATABASE_VERSION}\`)`,
    `- Application user: \`${cfg.DATABASE_USER}\``,
    "",
    "| Environment | Host port | URL |",
    "| --- | --- | --- |",
    `| dev | \`${cfg.DATABASE_PORT_DEV}\` | \`${cfg.DATABASE_URL_DEV}\` |`,
    `| feature | \`${cfg.DATABASE_PORT_FEATURE}\` | \`${cfg.DATABASE_URL_FEATURE}\` |`,
    `| prod | \`${cfg.DATABASE_PORT_PROD}\` | \`${cfg.DATABASE_URL_PROD}\` |`,
    "",
    "Each environment binds a different host port so two of them can run side by",
    `side. Inside the network every database listens on \`${cfg.DATABASE_CONTAINER_PORT}\`.`,
  ].join("\n");
}

function runtimeInvariants(cfg: any) {
  const invariants = [];
  if (hasDatastore(cfg)) {
    invariants.push(
      "**No shared databases.** Each environment owns its own database name; the three above never point at the same instance."
    );
  }
  invariants.push(
    "**No credentials in the repository.** The generated `.env.*` files carry placeholders. Real secrets arrive from the deployment platform or a secret manager, never from a commit.",
    "**No hardcoded configuration.** Hosts, ports and credentials are read from the environment at runtime.",
    "**`.env.example` is the schema.** Every variable the application reads must appear there, with a safe placeholder value.",
    "**Adding an environment is a spec change.** Extend this document and the `.env.*` set together — a new environment that exists only in deployment configuration is drift."
  );
  return invariants.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

function composeDependsOn(cfg: any) {
  return hasDatastore(cfg) ? "    depends_on:\n      db:\n        condition: service_healthy" : "";
}

function composeDbService(cfg: any) {
  if (!hasDatastore(cfg)) return "";
  return `
  db:
    image: ${cfg.DATABASE_IMAGE}
    restart: unless-stopped
    env_file:
      - .env.\${APP_ENV:-${cfg.DEFAULT_ENV}}.infra
    ports:
      - "\${DATABASE_PORT:-${cfg.DATABASE_PORT_DEV}}:${cfg.DATABASE_CONTAINER_PORT}"
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$\${POSTGRES_USER} -d $$\${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
    name: ${cfg.PROJECT_SLUG}_\${APP_ENV:-${cfg.DEFAULT_ENV}}_db_data`;
}

export function validateConfig(cfg: any) {
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

  cfg.DATASTORE = cfg.DATASTORE || (cfg.PROJECT_TYPE === "backend" ? "postgres" : "none");
  const SUPPORTED_DATASTORES = ["postgres", "none"];
  if (!SUPPORTED_DATASTORES.includes(cfg.DATASTORE)) {
    logError(
      `DATASTORE '${cfg.DATASTORE}' is not supported. Supported: ${SUPPORTED_DATASTORES.join(", ")}`
    );
    process.exit(2);
  }

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
  const dbUrl = (db: string) =>
    `postgresql://${cfg.DATABASE_USER}:${cfg.DATABASE_PASSWORD}@${cfg.DATABASE_HOST}:${cfg.DATABASE_CONTAINER_PORT}/${db}`;
  cfg.DATABASE_URL_DEV = dbUrl(cfg.DATABASE_NAME_DEV);
  cfg.DATABASE_URL_FEATURE = dbUrl(cfg.DATABASE_NAME_FEATURE);
  cfg.DATABASE_URL_PROD = dbUrl(cfg.DATABASE_NAME_PROD);

  cfg.RUNTIME_DOCKER_SECTION = runtimeDockerSection(cfg);
  cfg.RUNTIME_ENV_TABLE = runtimeEnvTable(cfg);
  cfg.RUNTIME_DATABASE_SECTION = runtimeDatabaseSection(cfg);
  cfg.RUNTIME_INVARIANTS = runtimeInvariants(cfg);
  cfg.COMPOSE_DEPENDS_ON = composeDependsOn(cfg);
  cfg.COMPOSE_DB_SERVICE = composeDbService(cfg);

  if (!PROJECT_TYPES.includes(cfg.PROJECT_TYPE)) {
    logError(`PROJECT_TYPE must be one of ${PROJECT_TYPES.join(", ")}`);
    process.exit(2);
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(cfg.PROJECT_SLUG)) {
    logError("PROJECT_SLUG must use lowercase letters, numbers, and dashes (example: my-project)");
    process.exit(2);
  }

  return cfg;
}

function renderContent(content: string, vars: any) {
  return content.replace(/{{([A-Z][A-Z0-9_]*)}}/g, (_, token) => {
    if (!(token in vars)) {
      logWarn(`Template variable '{{${token}}}' not defined — leaving as-is.`);
      return `{{${token}}}`;
    }
    return String(vars[token]);
  });
}

function renderFile(src: string, dst: string, vars: any, dryRun: boolean) {
  if (dryRun) {
    logInfo(`[dry-run] render ${src} -> ${dst}`);
    return;
  }
  const content = fs.readFileSync(src, "utf8");
  const rendered = renderContent(content, vars);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, rendered, "utf8");
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

function renderTree(srcRoot: string, dstRoot: string, vars: any, dryRun: boolean) {
  if (!fs.existsSync(srcRoot)) return;
  const allFiles = walkDir(srcRoot).filter((f) => f.endsWith(".tpl"));
  allFiles.sort();
  for (const tpl of allFiles) {
    const rel = path.relative(srcRoot, tpl);
    const dstRel = rel.replace(/\.tpl$/, "");
    renderFile(tpl, path.join(dstRoot, dstRel), vars, dryRun);
  }
}

function applyRuntimeSupportFlags(projectDir: string, cfg: any, dryRun: boolean) {
  if (cfg.DATASTORE === "none" && !dryRun) {
    for (const file of fs.readdirSync(projectDir)) {
      if (!/^\.env\b/.test(file)) continue;
      const full = path.join(projectDir, file);
      const kept = fs
        .readFileSync(full, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(DATABASE_|POSTGRES_)/.test(line));
      fs.writeFileSync(full, kept.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
    }
  }

  if (cfg.DOCKER_SUPPORT !== "true") {
    if (dryRun) {
      logInfo("[dry-run] skip Docker artifacts");
    } else {
      for (const f of ["docker-compose.yml", ".dockerignore"]) {
        const p = path.join(projectDir, f);
        if (fs.existsSync(p)) fs.rmSync(p);
      }
      for (const f of fs.readdirSync(projectDir)) {
        if (/^\.env\.\w+\.(infra|app)$/.test(f)) {
          fs.rmSync(path.join(projectDir, f));
        }
      }
    }
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

function removeSampleRequirement(projectDir: string, dryRun: boolean) {
  const traceFile = path.join(projectDir, "docs/specs/traceability.md");
  if (fs.existsSync(traceFile)) {
    const content = fs.readFileSync(traceFile, "utf8");
    const kept = content
      .split("\n")
      .filter((line) => !/^\|\s*REQ-000\s*\|/.test(line))
      .join("\n");
    if (kept !== content && !dryRun) fs.writeFileSync(traceFile, kept, "utf8");
  }

  const healthFeature = path.join(projectDir, "features", "core", "health.feature");
  if (fs.existsSync(healthFeature) && !dryRun) {
    fs.rmSync(healthFeature);
    const coreDir = path.dirname(healthFeature);
    if (fs.existsSync(coreDir) && fs.readdirSync(coreDir).length === 0) fs.rmdirSync(coreDir);
  }
}

function featureTitleFromPath(rel: string) {
  return path.basename(rel, ".feature").replace(/_/g, " ");
}

function ensureTraceabilityCoverage(projectDir: string) {
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
    const rel = path.relative(projectDir, ff).split(path.sep).join("/");
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

export class InitProjectCommand extends BaseCommand {
  public async execute(): Promise<void> {
    let rawArgs = this.args;
    if (rawArgs[0] === "init") rawArgs = rawArgs.slice(1);

    const opts = parseArgs(rawArgs);

    let wizardAnswers = null;
    let cfg: any;
    if (opts.config) {
      cfg = validateConfig(parseConfig(opts.config));
    } else if (opts.yes) {
      wizardAnswers = defaultAnswers();
      cfg = validateConfig({ ...wizardAnswers });
    } else if (process.stdin.isTTY && process.stdout.isTTY) {
      logInfo("No --config given — starting the interactive wizard (Enter accepts the default).");
      wizardAnswers = await runInitWizard();
      cfg = validateConfig({ ...wizardAnswers });
    } else {
      logError("--config is required when not running in a terminal.");
      logInfo("Fix: run `csda init` in a terminal for the interactive wizard,");
      logInfo("     pass --yes to scaffold with defaults, or provide --config <path>.");
      process.exit(2);
    }

    if (!opts.out) {
      logInfo(`No --out given — using the current directory: ${process.cwd()}`);
    }
    const outDir = opts.out ? path.resolve(opts.out) : process.cwd();
    const projectDir = path.join(outDir, cfg.PROJECT_SLUG);

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
    if (opts.noSampleReq) {
      logInfo("🧩 Skipping the sample requirement (--no-sample-req)");
      if (!opts.dryRun) fs.mkdirSync(path.join(projectDir, "features"), { recursive: true });
      removeSampleRequirement(projectDir, opts.dryRun);
    } else {
      renderTree(
        path.join(TEMPLATES_DIR, cfg.PROJECT_TYPE, "features"),
        path.join(projectDir, "features"),
        cfg,
        opts.dryRun
      );
    }

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
      if (wizardAnswers) {
        fs.writeFileSync(
          path.join(projectDir, "project.yaml"),
          renderConfigYaml(wizardAnswers),
          "utf8"
        );
      }
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
    if (wizardAnswers && !opts.dryRun) {
      logInfo("- Config: saved to project.yaml (reproduce with `init --config project.yaml`)");
    }
    logInfo("✅ Generation completed");
    process.exit(0);
  }
}
