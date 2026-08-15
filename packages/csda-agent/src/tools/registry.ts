/**
 * The tool set handed to the model — and the whole of what the agent can do.
 *
 * Built from the manifest plus a small, path-confined file surface. Nothing
 * here can run an arbitrary command: there is no shell tool to expose one.
 */

import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import {
  COMMANDS,
  buildArgv,
  inputSchema,
  toolDescription,
  type CommandSpec,
} from "./manifest.js";
import { formatResult, runCsda, type ExecOptions } from "./exec.js";
import {
  editFileInScope,
  listFilesInScope,
  readFileInScope,
  writeFileInScope,
  PathError,
  type FileScope,
} from "./files.js";

export interface ToolContext {
  exec: ExecOptions;
  scope: FileScope;
  /** Called before a mutating tool runs; returning false denies it. */
  confirm?: (tool: string, detail: string) => Promise<boolean>;
  /** Notified when a tool starts and finishes, for the TUI. */
  onStart?: (tool: string, input: unknown) => string;
  onEnd?: (id: string, ok: boolean, preview: string) => void;
}

/**
 * The `init` config contract, stated once.
 *
 * The agent needs this to hold a real conversation about a new project — but
 * it must not recall it from training. An invented key is accepted silently by
 * `init` and produces a project that is subtly wrong, which is exactly the
 * failure a spec-driven tool exists to prevent.
 */
export const INIT_CONFIG_SCHEMA = `An init config is a flat YAML mapping. Keys are case-sensitive.

Required:
  PROJECT_NAME   Human-readable name.            e.g. "Acme Energy Hub"
  PROJECT_SLUG   kebab-case; becomes the folder. e.g. "acme-energy-hub"
  PROJECT_TYPE   One of: backend | frontend | contracts
  DOMAIN         The business domain in the user's own words. e.g. "community energy"
  STACK          Concrete technologies, comma-separated.
                 e.g. "Quarkus 3.x, Java 21, PostgreSQL, Maven"
  API_STYLE      e.g. "REST with DTO boundaries", "REST and GraphQL"
  TESTING        e.g. "JUnit 5, Testcontainers, Cucumber"

Optional:
  LANG           Language for generated prose. Default: en
  MODULES        Comma-separated seed modules. e.g. "auth,dashboard,billing"
                 Leave empty when the user has not asked for specific modules.

Then: csda_init(config=<path to that file>, out=<PARENT directory>)
\`out\` is the parent — init creates <out>/<PROJECT_SLUG>/ inside it.

Every value must come from the user. Where you propose one, say so and let
them correct it before writing the file.`;

const asTool = (
  name: string,
  description: string,
  schema: Record<string, unknown>,
  run: (args: any) => Promise<string> | string
): BetaRunnableTool =>
  ({
    name,
    description,
    input_schema: schema as any,
    run,
    parse: (content: unknown) => content as any,
  }) as BetaRunnableTool;

/** Wrap a tool body so failures come back as text the model can act on. */
async function guarded(fn: () => Promise<string> | string): Promise<string> {
  try {
    return await fn();
  } catch (err: any) {
    if (err instanceof PathError) return `Refused: ${err.message}`;
    return `Error: ${err?.message ?? String(err)}`;
  }
}

function commandTool(spec: CommandSpec, ctx: ToolContext): BetaRunnableTool {
  return asTool(spec.tool, toolDescription(spec), inputSchema(spec), async (args) =>
    guarded(async () => {
      const argv = buildArgv(spec, args ?? {});
      const detail = `csda ${argv.join(" ")}`;

      if (spec.mutating && ctx.confirm) {
        const allowed = await ctx.confirm(spec.tool, detail);
        if (!allowed) {
          return `Denied by the user: ${detail}. Do not retry this without being asked to.`;
        }
      }

      const id = ctx.onStart?.(spec.tool, args) ?? "";
      const result = await runCsda(argv, ctx.exec);
      const text = formatResult(argv, result);
      ctx.onEnd?.(id, result.ok, text);
      return text;
    })
  );
}

export function buildTools(ctx: ToolContext): BetaRunnableTool[] {
  const tools = COMMANDS.map((spec) => commandTool(spec, ctx));

  const track = async (
    name: string,
    input: unknown,
    body: () => string,
    mutating: boolean,
    detail: string
  ) =>
    guarded(async () => {
      if (mutating && ctx.confirm) {
        const allowed = await ctx.confirm(name, detail);
        if (!allowed) return `Denied by the user: ${detail}.`;
      }
      const id = ctx.onStart?.(name, input) ?? "";
      try {
        const out = body();
        ctx.onEnd?.(id, true, out);
        return out;
      } catch (err: any) {
        ctx.onEnd?.(id, false, err?.message ?? String(err));
        throw err;
      }
    });

  tools.push(
    asTool(
      "csda_config_schema",
      "The exact contract for an `init` config file: every key, which are required, and the accepted values.\n\nWhen to use: before writing a project config or calling csda_init. Read it rather than recalling the field names — an invented key is silently ignored by init and the project comes out wrong.",
      { type: "object", properties: {}, required: [], additionalProperties: false },
      async () => INIT_CONFIG_SCHEMA
    ),

    asTool(
      "read_file",
      "Read a file from the project.\n\nWhen to use: before editing anything, and to inspect specs, feature files, pack.yaml or the traceability matrix. Paths are relative to the project root.",
      {
        type: "object",
        properties: { path: { type: "string", description: "Path relative to the project root." } },
        required: ["path"],
        additionalProperties: false,
      },
      async (args) =>
        track("read_file", args, () => readFileInScope(args.path, ctx.scope), false, args.path)
    ),

    asTool(
      "list_files",
      "List files under a directory of the project.\n\nWhen to use: to find where something lives before reading it. Prefer it over guessing a path.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory relative to the project root. Defaults to the root." },
        },
        required: [],
        additionalProperties: false,
      },
      async (args) =>
        track(
          "list_files",
          args,
          () => listFilesInScope(args.path ?? ".", ctx.scope).join("\n") || "(empty)",
          false,
          args.path ?? "."
        )
    ),

    asTool(
      "write_file",
      "Create or overwrite a file in the project.\n\nWhen to use: to write specs, delta specs, proposals, tasks and .feature files. Overwrites the whole file — read it first if you mean to keep any of it.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project root." },
          contents: { type: "string", description: "The complete new file contents." },
        },
        required: ["path", "contents"],
        additionalProperties: false,
      },
      async (args) =>
        track(
          "write_file",
          args,
          () => `Wrote ${writeFileInScope(args.path, args.contents, ctx.scope)}`,
          true,
          `write ${args.path}`
        )
    ),

    asTool(
      "edit_file",
      "Replace one exact occurrence of a string in a file.\n\nWhen to use: for a surgical change to an existing file. The old text must appear exactly once — include surrounding context to make it unique. Prefer this over write_file when most of the file stays.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project root." },
          old_string: { type: "string", description: "Exact text to replace; must be unique in the file." },
          new_string: { type: "string", description: "Replacement text." },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
      async (args) =>
        track(
          "edit_file",
          args,
          () => `Edited ${editFileInScope(args.path, args.old_string, args.new_string, ctx.scope)}`,
          true,
          `edit ${args.path}`
        )
    )
  );

  return tools;
}

/** Tool names, for the status line and for tests that assert the surface. */
export const TOOL_NAMES = [
  ...COMMANDS.map((c) => c.tool),
  "csda_config_schema",
  "read_file",
  "list_files",
  "write_file",
  "edit_file",
];
