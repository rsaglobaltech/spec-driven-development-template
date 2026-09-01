import * as fs from "node:fs";
import { BaseCommand } from "../../../lib/command";
import { parseGherkin } from "../../../../packages/core/src/domain/Gherkin";

function logError(msg: string) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

export interface InferPackOptions {
  from: string | null;
  format: string;
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  specgate pack infer --from <feature-file> [--format yaml|json]\n\n" +
      "Reads a Gherkin .feature file and prints a proposed pack.yaml fragment\n" +
      "(requirements, use_cases, commands, events, scenarios) to stdout. The\n" +
      "output is a heuristic skeleton — review every TODO before merging.\n\n" +
      "Options:\n" +
      "  --from <path>     Gherkin .feature file to infer from (required)\n" +
      "  --format <fmt>    Output format: yaml (default) or json\n"
  );
}

export function parseArgs(argv: string[]) {
  const opts: InferPackOptions = { from: null, format: "yaml" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) {
      opts.from = argv[++i];
    } else if (a === "--format" && argv[i + 1]) {
      opts.format = argv[++i];
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!["yaml", "json"].includes(opts.format)) {
    logError(`Invalid --format: ${opts.format}. Expected: yaml | json.`);
    process.exit(2);
  }
  return opts;
}

/**
 * What `pack infer` reads out of a `.feature` file.
 *
 * Delegates to `parseGherkin`, the one reader in this repository (F1). It used
 * to carry its own regular expressions — one of three sets that disagreed with
 * each other — and matched case-insensitively, so it would have reported steps
 * for a file Cucumber reads as prose.
 *
 * The shape is kept as it was so the rest of this command is untouched.
 */
export function parseFeatureFile(content: string) {
  const doc = parseGherkin(content);
  return {
    featureName: doc.feature ?? "",
    featureTags: [...doc.featureTags],
    scenarios: doc.scenarios.map((scenario) => ({
      title: scenario.name,
      tags: [...scenario.tags],
      steps: scenario.steps.map((step) => ({ keyword: step.keyword, text: step.text })),
    })),
  };
}

function pad(n: number) {
  return String(n).padStart(3, "0");
}

export function toPascalCase(text: string) {
  const words = text
    .replace(/"[^"]*"/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w))
    .slice(0, 4);
  if (words.length === 0) return "Action";
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}

export function collectRequirementIds(parsed: any) {
  const ids = new Set<string>();
  const scan = (tags: string[]) => {
    for (const tag of tags || []) {
      const m = String(tag).match(/REQ-\d+/i);
      if (m) ids.add(m[0].toUpperCase());
    }
  };
  scan(parsed.featureTags);
  for (const scn of parsed.scenarios) scan(scn.tags);
  return [...ids];
}

export function extractEventNames(text: string) {
  const out: string[] = [];
  const re = /"([A-Z][A-Za-z0-9]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

export function inferModel(parsed: any, sourceFile: string) {
  const reqIds = collectRequirementIds(parsed);
  const requirements =
    reqIds.length > 0
      ? reqIds.map((id) => ({ id, title: `TODO: describe ${id}` }))
      : [
          {
            id: "REQ-XXX",
            title: `TODO: requirement behind "${parsed.featureName || sourceFile}"`,
          },
        ];
  const primaryReq = requirements[0].id;

  const useCase: any = {
    id: "UC-XXX",
    name: parsed.featureName || "TODO: name the use case",
    requirement: primaryReq,
    command: "TODO: command",
    aggregate: "TODO: aggregate",
    emits: [],
  };

  const commands: any[] = [];
  const events: any[] = [];
  const scenarios: any[] = [];
  let ci = 1;
  let ei = 1;
  let si = 1;

  for (const scn of parsed.scenarios) {
    const scnId = `SCN-${pad(si++)}`;

    const whenStep = scn.steps.find((s: any) => s.keyword === "when");
    let commandName: string | null = null;
    if (whenStep) {
      commandName = `${toPascalCase(whenStep.text)}Command`;
      commands.push({ id: `CMD-${pad(ci++)}`, name: commandName });
    }

    const eventNames: string[] = [];
    for (const step of scn.steps.filter((s: any) => s.keyword === "then")) {
      for (const name of extractEventNames(step.text)) {
        if (!events.some((e) => e.name === name)) {
          events.push({ id: `EVT-${pad(ei++)}`, name });
        }
        if (!eventNames.includes(name)) eventNames.push(name);
      }
    }

    scenarios.push({
      id: scnId,
      title: scn.title,
      use_case: useCase.id,
      command: commandName || "TODO: command",
      events: eventNames,
    });
  }

  if (commands.length > 0) useCase.command = commands[0].name;
  useCase.emits = [...new Set(events.map((e) => e.name))];

  return { requirements, use_cases: [useCase], commands, events, scenarios };
}

function yamlScalar(value: any) {
  const s = String(value);
  if (s === "") return '""';
  if (/^[A-Za-z0-9_][A-Za-z0-9_ .\-/]*$/.test(s) && !/:\s/.test(s) && !s.includes(": ")) {
    if (/^(true|false|null|yes|no|~|\d+(\.\d+)?)$/i.test(s)) return `"${s}"`;
    return s;
  }
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function renderYamlFragment(model: any, sourceFile: string) {
  const out = [
    `# Proposed pack.yaml fragment inferred from ${sourceFile}`,
    `# Heuristic skeleton — review and resolve every TODO before merging.`,
    "",
    "requirements:",
  ];
  for (const r of model.requirements) {
    out.push(`  - id: ${yamlScalar(r.id)}`);
    out.push(`    title: ${yamlScalar(r.title)}`);
  }
  out.push("");
  out.push("use_cases:");
  for (const u of model.use_cases) {
    out.push(`  - id: ${yamlScalar(u.id)}`);
    out.push(`    name: ${yamlScalar(u.name)}`);
    out.push(`    requirement: ${yamlScalar(u.requirement)}`);
    out.push(`    command: ${yamlScalar(u.command)}`);
    out.push(`    aggregate: ${yamlScalar(u.aggregate)}`);
    if (u.emits.length === 0) {
      out.push(`    emits: []`);
    } else {
      out.push(`    emits:`);
      for (const e of u.emits) out.push(`      - ${yamlScalar(e)}`);
    }
  }
  out.push("");
  out.push("commands:");
  if (model.commands.length === 0) out.push("  []");
  for (const c of model.commands) {
    out.push(`  - id: ${yamlScalar(c.id)}`);
    out.push(`    name: ${yamlScalar(c.name)}`);
  }
  out.push("");
  out.push("events:");
  if (model.events.length === 0) out.push("  []");
  for (const e of model.events) {
    out.push(`  - id: ${yamlScalar(e.id)}`);
    out.push(`    name: ${yamlScalar(e.name)}`);
  }
  out.push("");
  out.push("scenarios:");
  for (const s of model.scenarios) {
    out.push(`  - id: ${yamlScalar(s.id)}`);
    out.push(`    title: ${yamlScalar(s.title)}`);
    out.push(`    use_case: ${yamlScalar(s.use_case)}`);
    out.push(`    command: ${yamlScalar(s.command)}`);
    if (s.events.length === 0) {
      out.push(`    events: []`);
    } else {
      out.push(`    events:`);
      for (const e of s.events) out.push(`      - ${yamlScalar(e)}`);
    }
  }
  out.push("");
  return out.join("\n");
}

export class InferPackCommand extends BaseCommand {
  public execute(): void {
    const rawArgs = this.args[0] === "pack" ? this.args.slice(1) : this.args;
    const args = rawArgs[0] === "infer" ? rawArgs.slice(1) : rawArgs;
    const opts = parseArgs(args);

    if (!opts.from) {
      logError("--from <feature-file> is required.");
      usage();
      process.exit(2);
    }

    let content: string;
    try {
      content = fs.readFileSync(opts.from, "utf8");
    } catch (err: any) {
      logError(`Cannot read feature file '${opts.from}': ${err.message}`);
      process.exit(1);
    }

    const parsed = parseFeatureFile(content);
    if (parsed.scenarios.length === 0) {
      logError(`No Gherkin scenarios found in '${opts.from}'.`);
      process.exit(1);
    }

    const model = inferModel(parsed, opts.from);

    if (opts.format === "json") {
      process.stdout.write(
        JSON.stringify({ schemaVersion: 1, source: opts.from, ...model }, null, 2) + "\n"
      );
    } else {
      process.stdout.write(renderYamlFragment(model, opts.from) + "\n");
    }
    process.exit(0);
  }
}
