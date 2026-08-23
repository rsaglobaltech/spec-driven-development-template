import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseYamlLite } from "../../../../packages/core/src/domain/YamlLite";
import { listChangeIds } from "../../../../packages/core/src/infrastructure/ChangeWorkspace";
import { ValidateChangeUseCase } from "../../../../packages/core/src/application/ValidateChangeUseCase";
import { DiskProjectRepository } from "../../../../packages/core/src/infrastructure/DiskProjectRepository";
import { formatDiagnostic, error } from "../../../lib/diagnostics";
import { checkAgainstLock } from "../../../specops/against_lock";
import { requirementGraphFromProject } from "../../../lib/requirement-graph";
import { agentIo, wantsJson, EXIT } from "../../../lib/agent";
import { findUnresolvedPlaceholders } from "../../../lib/placeholders";
import { BaseCommand } from "../../../lib/command";
import { ValidateProjectUseCase } from "../../../../packages/core/src/application/ValidateProjectUseCase";
import { DiskTraceabilityRepository } from "../../../../packages/core/src/infrastructure/DiskTraceabilityRepository";
import { RICH_HEADER } from "../../../../packages/core/src/domain/TraceabilityFormat";
import { findCliRoot } from "../../../lib/project-root";
import { analyseGherkinSource } from "../../../../packages/core/src/domain/GherkinQuality";
import { csdaTagsIn } from "../../../../packages/core/src/domain/GherkinTags";
import { parseTraceabilityRows } from "../../../../packages/core/src/domain/TraceabilityFormat";

export class ValidateSpecsCommand extends BaseCommand {
  private io: any = null;

  private logInfo(msg: string) {
    const stream = this.io && this.io.json ? process.stderr : process.stdout;
    stream.write(`ℹ️ [INFO] ${msg}\n`);
  }
  private logError(msg: string) {
    process.stderr.write(`❌ [ERROR] ${msg}\n`);
  }

  private usage() {
    process.stdout.write(
      "🔎 Usage:\n" +
        "  validate_specs.js <project_dir> [--strict-tdd] [--strict-scenarios] [--against-lock]\n\n" +
        "Checks:\n" +
        "- minimum SDD structure\n" +
        "- required files\n" +
        "- at least one .feature file\n" +
        "- unresolved placeholders ({{...}})\n" +
        "- feature coverage in traceability.md\n" +
        "- allowed status values in traceability.md\n" +
        "- expected DDD Lite document headers when present\n\n" +
        "--against-lock additionally enforces:\n" +
        "- Every requirement the locked packs declare is present in the matrix\n" +
        "- Its scenario and feature file still match what the pack declares\n\n" +
        "--strict-scenarios additionally enforces, over features/**/*.feature:\n" +
        "- No scenario Cucumber would see as empty (upper-case keywords are the usual cause)\n" +
        "- Every scenario has a When and a Then, at least three steps and a title that names the behaviour\n" +
        "- No vague, unfalsifiable step text; no Scenario Outline without Examples\n\n" +
        "--strict-tdd additionally enforces:\n" +
        "- No 'Test Artifact = TBD' when Status is In Dev or later\n" +
        "- Every requirement has at least one traceability row\n" +
        "- Every scenario row has a non-empty Scenario ID\n"
    );
  }

  private logFix(lines: string | string[]) {
    for (const line of Array.isArray(lines) ? lines : [lines]) {
      process.stderr.write(`💡 [FIX] ${line}\n`);
    }
  }

  private fail(code: string, msg: string, exitCode = 1, fix: string | string[] | null = null) {
    const fixLines = fix ? (Array.isArray(fix) ? fix : [fix]) : [];
    if (this.io && this.io.json) {
      const diag = error(code, msg, fixLines.length ? { fix: fixLines.join(" ") } : undefined);
      if (exitCode === EXIT.USAGE) this.io.usage({ validation: null }, [diag]);
      this.io.fail({ validation: null }, [diag]);
      return;
    }
    this.logError(msg);
    if (fixLines.length) this.logFix(fixLines);
    process.exit(exitCode);
  }

  private validateMonorepo(targetDir: string, strictTdd: boolean, strictScenarios: boolean) {
    const cfgPath = path.join(targetDir, "specops.config.yaml");
    if (!fs.existsSync(cfgPath)) return null;
    let cfg: any;
    try {
      cfg = parseYamlLite(fs.readFileSync(cfgPath, "utf8"));
    } catch {
      return null;
    }
    const projects = cfg && Array.isArray(cfg.projects) ? cfg.projects : null;
    if (!projects || projects.length === 0) return null;

    this.logInfo(`🗂️ Monorepo: validating ${projects.length} project(s) from specops.config.yaml`);
    const results = [];
    for (const entry of projects) {
      const rel = typeof entry === "string" ? entry : entry && entry.path;
      if (!rel) {
        results.push({ project: String(entry), ok: false, detail: "invalid projects entry" });
        continue;
      }
      const subDir = path.join(targetDir, rel);
      process.stdout.write(`\n── ${rel} ──\n`);
      if (!fs.existsSync(subDir)) {
        this.logError(`Project directory not found: ${rel}`);
        this.logFix(`Fix the 'projects:' entry in specops.config.yaml or create ${rel}.`);
        results.push({ project: rel, ok: false, detail: "directory not found" });
        continue;
      }
      const root = findCliRoot(__dirname);
      const scriptPath = fs.existsSync(path.join(root, "dist", "scripts", "validate_specs.js"))
        ? path.join(root, "dist", "scripts", "validate_specs.js")
        : path.join(root, "scripts", "validate_specs.js");
      const args = [scriptPath, subDir];
      if (strictTdd) args.push("--strict-tdd");
      if (strictScenarios) args.push("--strict-scenarios");
      const r = spawnSync(process.execPath, args, { encoding: "utf8" });
      process.stdout.write(r.stdout || "");
      process.stderr.write(r.stderr || "");
      results.push({ project: rel, ok: r.status === 0 });
    }

    const failures = results.filter((r) => !r.ok);
    process.stdout.write("\n── monorepo summary ──\n");
    for (const r of results) {
      process.stdout.write(
        `  ${r.ok ? "✅" : "❌"} ${r.project}${r.detail ? ` (${r.detail})` : ""}\n`
      );
    }
    process.stdout.write(
      `\n${failures.length === 0 ? "✅" : "❌"} ${results.length - failures.length}/${results.length} project(s) passed\n`
    );
    return { failures: failures.length };
  }

  /**
   * `--strict-scenarios`: the pack's quality rules, applied where the harness
   * actually runs (A3).
   *
   * `docs/specs/harness.md` says the gate is only as strong as its scenarios,
   * and until now the rules that enforce that lived in `pack lint` and judged
   * one thing: a `pack.yaml`. But a project's features arrive by three routes
   * that never touch `pack lint` — `change archive`, `req add`, and a person
   * with an editor. This closes that gap by reading the same domain rules.
   *
   * **Why a flag and not the default.** A project brought in with `csda adopt`
   * can have dozens of weak features written long before this tool existed;
   * failing its first `validate` would teach people to skip the gate. `csda
   * doctor` reports the same findings as advisories, which is the gradual path
   * this tool uses everywhere else. Under the flag, warnings fail too — asking
   * for strict and getting lenient is the H14 mistake in a different costume.
   */
  private checkScenarioQuality(targetDir: string, featureFiles: string[]) {
    const findings = [];
    for (const file of featureFiles.slice().sort()) {
      const rel = path.relative(targetDir, file).split(path.sep).join("/");
      findings.push(...analyseGherkinSource(fs.readFileSync(file, "utf8"), rel));
    }
    if (findings.length === 0) return;

    if (this.io.json) {
      this.io.fail({ validation: null }, findings);
      return;
    }
    const errs = findings.filter((f) => f.severity === "error");
    this.logError(
      `--strict-scenarios violations detected: ${findings.length} ` +
        `(${errs.length} that make a scenario pass without testing anything)`
    );
    for (const f of findings) process.stderr.write(`  ${formatDiagnostic(f)}\n`);
    this.logFix([
      "Fix the errors first: a scenario Cucumber sees as empty reports `0 steps · exit 0`,",
      "so the gate approves the requirement without having checked it.",
    ]);
    process.exit(1);
  }

  /**
   * Does the scenario the matrix names actually exist in the file? (F4)
   *
   * The help text has been asking for a Scenario ID "that matches a scenario in
   * its feature file" without ever comparing the two. Measured before writing
   * this: rename the scenario and both `--strict-tdd` and `--strict-scenarios`
   * still pass, with the matrix pointing at something that is not there.
   *
   * The check runs off tags, because a tag survives the rename and a title does
   * not — and the matrix carries an id, not a title, so there is nothing else to
   * compare. `csda expand` writes them; nobody types them.
   *
   * **Only files that carry our tags are checked.** A project brought in with
   * `csda adopt`, or one scaffolded before this existed, has none — and failing
   * it here would punish it for a link it was never given the means to make.
   * Once a file is tagged, a row pointing into it has to be right.
   */
  private checkScenarioTags(targetDir: string, traceContent: string) {
    let rows: any[] = [];
    try {
      rows = parseTraceabilityRows(traceContent).rows || [];
    } catch {
      return;
    }

    for (const row of rows) {
      const scenarioId = String(row.scenarioId || "").trim();
      const featureRel = String(row.featureFile || "")
        .replace(/`/g, "")
        .split("#")[0]
        .trim();
      if (!/^SCN-[A-Za-z0-9.]+$/.test(scenarioId) || !featureRel) continue;

      const file = path.join(targetDir, featureRel);
      if (!fs.existsSync(file)) continue; // the coverage check below reports this

      let tags: string[] = [];
      try {
        tags = csdaTagsIn(fs.readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      if (tags.length === 0) continue; // untagged file — nothing to compare against

      if (!tags.includes(`@${scenarioId}`)) {
        this.fail(
          "scenario_id_not_in_feature",
          `${featureRel} carries traceability tags but not @${scenarioId}, which ` +
            `${row.requirement || "a row"} declares. The matrix points at a scenario ` +
            `that is not there.`,
          1,
          [
            `Tag the scenario: put \`@${scenarioId}\` above its \`Scenario:\` line,`,
            "or correct the Scenario ID in docs/specs/traceability.md.",
          ]
        );
      }
    }
  }

  public execute(): void {
    const rawArgs = this.args[0] === "validate" ? this.args.slice(1) : this.args;
    const argv = rawArgs;
    this.io = agentIo(wantsJson(argv));
    const strictTdd = argv.includes("--strict-tdd");
    const strictScenarios = argv.includes("--strict-scenarios");
    const againstLock = argv.includes("--against-lock");
    const positional = argv.filter((a) => !a.startsWith("-"));

    const targetDir = positional[0];
    if (!targetDir) {
      this.usage();
      process.exit(2);
    }
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      this.fail("project_dir_not_found", `Directory not found: ${targetDir}`, EXIT.USAGE, [
        "Check the path for typos, or scaffold a new project first:",
        "  csda init",
      ]);
    }

    const monorepo = this.validateMonorepo(targetDir, strictTdd, strictScenarios);
    if (monorepo !== null) {
      process.exit(monorepo.failures === 0 ? 0 : 1);
    }

    const SKIP_DIRS = new Set([
      "node_modules",
      "dist",
      "build",
      "out",
      "target",
      "coverage",
      "vendor",
      ".git",
      ".next",
      ".gradle",
      ".specops",
    ]);

    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full);
      }
      return out;
    }

    function findRecursive(rootDir: string, predicate: (f: string) => boolean) {
      return walk(rootDir).filter(predicate);
    }

    const REQUIRED_FILES = [
      "spec.md",
      "AI_RULES.md",
      "README.md",
      "docs/specs/traceability.md",
      "docs/specs/adr/README.md",
    ];
    const REQUIRED_DIRS = ["features", "docs/specs"];
    const PLACEHOLDER_RE = /\{\{[A-Z_][A-Z0-9_]*\}\}/;

    for (const d of REQUIRED_DIRS) {
      if (!fs.existsSync(path.join(targetDir, d))) {
        this.fail("missing_required_dir", `Missing required directory: ${d}`, 1, [
          `Create it: mkdir -p ${d}`,
          "Or scaffold the full SDD structure with `csda init` / `specops add`.",
        ]);
      }
    }

    const FILE_FIXES: Record<string, string> = {
      "spec.md":
        "Author it from the shipped template (templates/base/spec.md.tpl) — one `## REQ-NNN — <title>` section per requirement.",
      "AI_RULES.md":
        "Author it from templates/backend/AI_RULES.md.tpl (or frontend) — it is the agent's project rulebook.",
      "README.md": "Add a README.md describing how to build and test the project.",
      "docs/specs/traceability.md": `Create it with the rich matrix header:\n  ${RICH_HEADER}`,
      "docs/specs/adr/README.md":
        "Create docs/specs/adr/README.md as the index of your Architecture Decision Records.",
    };
    for (const f of REQUIRED_FILES) {
      if (!fs.existsSync(path.join(targetDir, f))) {
        this.fail("missing_required_file", `Missing required file: ${f}`, 1, [
          FILE_FIXES[f] || `Create ${f}.`,
          "Generated projects include every required file — compare with `csda init --yes --out <tmp>`.",
        ]);
      }
    }

    const featuresDir = path.join(targetDir, "features");
    const featureFiles = findRecursive(featuresDir, (f) => f.endsWith(".feature"));
    if (featureFiles.length < 1) {
      this.fail("no_feature_files", "No .feature files were found in features/", 1, [
        "Write at least one Gherkin scenario, e.g. features/<area>/<name>.feature,",
        "or pull scenarios from a domain pack: csda specops add --pack-repo <url> …",
      ]);
    }
    const featureCount = featureFiles.length;

    if (strictScenarios) {
      this.checkScenarioQuality(targetDir, featureFiles);
    }

    const offenders = findUnresolvedPlaceholders(targetDir).map((rel) => path.join(targetDir, rel));
    if (offenders.length > 0) {
      this.logError("Unresolved placeholders detected");
      const tokens = new Set();
      for (const f of offenders) {
        const lines = fs.readFileSync(f, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (PLACEHOLDER_RE.test(lines[i])) {
            process.stderr.write(`${f}:${i + 1}:${lines[i]}\n`);
            for (const m of lines[i].match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g) || []) tokens.add(m);
          }
        }
      }
      const varList = [...tokens].map((t: any) => String(t).replace(/[{}]/g, "")).join(", ");
      this.logFix([
        `Replace the tokens with real values, or re-expand the pack passing each variable:`,
        `  csda specops sync --project-dir . (after adding the missing vars to .specops.lock)`,
        `Missing variables: ${varList}`,
      ]);
      process.exit(1);
    }

    const tracePath = path.join(targetDir, "docs/specs/traceability.md");
    const traceContent = fs.readFileSync(tracePath, "utf8");

    // Every judgement about the matrix's contents comes from the use case; this
    // command's job from here is to render what it found and pick the exit code.
    const specPath = path.join(targetDir, "spec.md");
    const {
      report,
      mode,
      requirements: reqsInMatrix,
    } = new ValidateProjectUseCase(new DiskTraceabilityRepository()).checkMatrix(traceContent, {
      strictTdd,
      specContent: fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : null,
    });

    const strictTddViolations = report.findings
      .filter((f) => f.code === "strict_tdd_violation")
      .map((f) => f.message);

    for (const finding of report.findings) {
      if (finding.code === "strict_tdd_violation") continue; // reported together, below
      this.fail(finding.code, finding.message, 1, [...(finding.fixLines || [])]);
      return;
    }

    const traceMode = mode as string;

    const TDD_FIXES: Record<string, string> = {
      "TDD-1":
        "Write the test first, then set its path in the row's 'Test artifact' column (or move the status back to Draft).",
      "TDD-2":
        "Give the row a Scenario ID that matches a scenario in its feature file (e.g. SCN-001).",
      "TDD-3":
        "Add a traceability row for the requirement — run `csda plan` to list what each REQ still needs.",
    };

    if (strictTddViolations.length > 0) {
      if (this.io.json) {
        this.io.fail(
          { validation: null },
          strictTddViolations.map((v) => {
            const tdd = v.slice(1, 6);
            return error(`strict_tdd_${tdd.split("-")[1]}`, v, {
              fix: TDD_FIXES[tdd],
            });
          })
        );
        return;
      }
      this.logError("--strict-tdd violations detected:");
      for (const v of strictTddViolations) {
        process.stderr.write(`  ${v}\n`);
      }
      const codes = new Set(strictTddViolations.map((v) => v.slice(1, 6)));
      this.logFix([...codes].sort().map((c) => `${c}: ${TDD_FIXES[c]}`));
      process.exit(1);
    }

    this.checkScenarioTags(targetDir, traceContent);

    for (const ff of featureFiles.sort()) {
      const rel = path.relative(targetDir, ff).split(path.sep).join("/");
      if (!traceContent.includes(rel)) {
        const exampleRow =
          traceMode === "rich"
            ? `| REQ-TBD | SCN-TBD | \`${rel}\` | UC-TBD | TBD | TBD | TBD | TBD | TBD | Draft |`
            : `| \`${rel}\` | <scenario> | TBD | Draft |`;
        this.fail("feature_not_in_matrix", `Feature file missing from traceability.md: ${rel}`, 1, [
          "Add a row for it to docs/specs/traceability.md, e.g.:",
          `  ${exampleRow}`,
        ]);
      }
    }

    const useCasesPath = path.join(targetDir, "docs/specs/use-cases.md");
    if (fs.existsSync(useCasesPath)) {
      const content = fs.readFileSync(useCasesPath, "utf8");
      if (
        !content.includes(
          "| ID | Use Case | Actor | Requirement | Command/Query | Aggregate | Emits"
        )
      ) {
        this.fail(
          "use_cases_header_missing",
          "use-cases.md is missing the expected table header",
          1,
          [
            "Start the use-case table with:",
            "  | ID | Use Case | Actor | Requirement | Command/Query | Aggregate | Emits |",
          ]
        );
      }
    }
    const eventsPath = path.join(targetDir, "docs/specs/events.md");
    if (fs.existsSync(eventsPath)) {
      const content = fs.readFileSync(eventsPath, "utf8");
      if (!content.includes("| ID | Event | Producer | Consumers | Payload |")) {
        this.fail("events_header_missing", "events.md is missing the expected table header", 1, [
          "Start the events table with:",
          "  | ID | Event | Producer | Consumers | Payload |",
        ]);
      }
    }

    let changeCount = 0;
    const changesDir = path.join(targetDir, "docs/specs/changes");
    if (fs.existsSync(changesDir)) {
      const ids = listChangeIds(targetDir);
      changeCount = ids.length;
      const problems: string[] = [];
      const rawProblems: any[] = [];
      for (const id of ids) {
        const result = new ValidateChangeUseCase(new DiskProjectRepository(targetDir)).execute(id, {
          strict: false,
        });
        for (const d of result.diagnostics) {
          if (d.severity === "error") {
            rawProblems.push(d);
            problems.push(formatDiagnostic(d));
          }
        }
      }
      if (problems.length > 0) {
        if (this.io.json) {
          this.io.fail({ validation: null }, rawProblems);
          return;
        }
        this.logError("Active changes have invalid delta specs:");
        for (const line of problems) process.stderr.write(`  ${line}\n`);
        process.exit(1);
      }
    }

    let lockChecked = 0;
    let lockAdvisories: any[] = [];
    if (againstLock) {
      const result = checkAgainstLock(targetDir, {});
      lockChecked = result.checked;
      const errors = result.diagnostics.filter((d: any) => d.severity === "error");
      const rest = result.diagnostics.filter((d: any) => d.severity !== "error");

      if (!this.io.json) {
        for (const d of rest) process.stdout.write(`  ${formatDiagnostic(d)}\n`);
      }

      if (errors.length > 0) {
        if (this.io.json) {
          this.io.fail({ validation: null }, result.diagnostics);
          return;
        }
        this.logError("--against-lock violations detected:");
        for (const d of errors) process.stderr.write(`  ${formatDiagnostic(d)}\n`);
        process.exit(1);
      }
      lockAdvisories = rest;
    }

    {
      const graph = requirementGraphFromProject(targetDir, [...reqsInMatrix]);
      const graphProblems: any[] = [];

      for (const cycle of graph.cycles) {
        const loop = [...cycle, cycle[0]].join(" → ");
        graphProblems.push(
          error("requirement_cycle", `Requirements depend on each other in a cycle: ${loop}`, {
            target: cycle[0],
            fix:
              `Remove one \`depends=\` from the csda:trace comment of one of them — ` +
              `${cycle.join(", ")} cannot all come after each other.`,
          })
        );
      }

      for (const { requirement, dependency } of graph.unknown) {
        graphProblems.push(
          error(
            "unknown_dependency",
            `${requirement} declares depends=${dependency}, which is not a requirement in this project.`,
            {
              target: requirement,
              fix: `Correct the id in ${requirement}'s csda:trace comment, or add a traceability row for ${dependency}.`,
            }
          )
        );
      }

      for (const requirement of graph.selfReferential) {
        graphProblems.push(
          error("self_dependency", `${requirement} declares that it depends on itself.`, {
            target: requirement,
            fix: `Remove \`depends=${requirement}\` from its csda:trace comment.`,
          })
        );
      }

      if (graphProblems.length > 0) {
        if (this.io.json) {
          this.io.fail({ validation: null }, graphProblems);
          return;
        }
        this.logError("Requirement dependency problems:");
        for (const d of graphProblems) process.stderr.write(`  ${formatDiagnostic(d)}\n`);
        process.exit(1);
      }
    }

    if (this.io.json) {
      this.io.emit({
        validation: {
          projectDir: targetDir,
          passed: true,
          features: featureCount,
          activeChanges: changeCount,
          traceabilityMode: traceMode,
          strictTdd,
          againstLock,
          packsChecked: lockChecked,
        },
        status: lockAdvisories,
      });
      process.exit(EXIT.OK);
    }

    this.logInfo("✅ Validation passed");
    this.logInfo(`- Features detected: ${featureCount}`);
    if (changeCount > 0) this.logInfo(`- Active changes: ${changeCount} (deltas valid)`);
    if (againstLock) {
      this.logInfo(
        lockChecked > 0
          ? `- Lock drift gate: passed (${lockChecked} pack(s) checked)`
          : "- Lock drift gate: no locked packs to check"
      );
    }
    this.logInfo("- Base SDD structure: complete");
    this.logInfo(`- Traceability mode: ${traceMode}`);
    if (strictTdd) this.logInfo("- Strict TDD gate: passed");
    process.exit(0);
  }
}
