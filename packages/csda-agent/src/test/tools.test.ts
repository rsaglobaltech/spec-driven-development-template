import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { COMMANDS, buildArgv, inputSchema, toolDescription } from "../tools/manifest.js";
import { TOOL_NAMES, buildTools } from "../tools/registry.js";
import {
  DEFAULT_WRITABLE,
  PathError,
  editFileInScope,
  isWritable,
  listFilesInScope,
  readFileInScope,
  resolveInScope,
  writeFileInScope,
  type FileScope,
} from "../tools/files.js";
import { formatResult, runCsda } from "../tools/exec.js";
import { selectProvider } from "../engine/provider.js";

function scopeIn(root: string): FileScope {
  return { root, additionalRoots: [], writable: DEFAULT_WRITABLE };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "csda-agent-"));
const clean = (d: string) => fs.rmSync(d, { recursive: true, force: true });

// ── the tool surface is the boundary ──────────────────────────────────────────

test("the agent has no shell and no arbitrary-command tool", () => {
  // This is the whole security model. If a tool ever appears here that can run
  // something the manifest did not declare, the boundary is gone.
  for (const forbidden of ["Bash", "bash", "shell", "exec", "run_command", "eval"]) {
    assert.equal(TOOL_NAMES.includes(forbidden), false, `${forbidden} must not exist`);
  }
});

test("every csda command on the CLI is reachable as a tool", () => {
  const expected = [
    "init",
    "validate",
    "expand",
    "plan",
    "done",
    "pack init",
    "pack lint",
    "pack infer",
    "specops add",
    "specops remove",
    "specops sync",
    "specops diff",
    "harness run",
    "harness prompt",
  ];
  const covered = COMMANDS.map((c) => c.argv.join(" "));
  for (const command of expected) {
    assert.ok(covered.includes(command), `csda ${command} has no tool`);
  }
});

test("every tool description says when to use it, not only what it is", () => {
  // A description that only states what a command is leaves the model guessing.
  for (const spec of COMMANDS) {
    assert.ok(spec.when.length > 30, `${spec.tool} has no meaningful 'when'`);
    assert.match(toolDescription(spec), /When to use:/);
    assert.match(toolDescription(spec), /Runs: csda /);
  }
});

test("tool names are unique", () => {
  assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
});

test("mutating commands are marked, read-only ones are not", () => {
  const byTool = new Map(COMMANDS.map((c) => [c.tool, c]));
  assert.equal(byTool.get("csda_validate")!.mutating, false);
  assert.equal(byTool.get("csda_plan")!.mutating, false);
  assert.equal(byTool.get("csda_specops_diff")!.mutating, false);
  assert.equal(byTool.get("csda_done")!.mutating, true);
  assert.equal(byTool.get("csda_specops_sync")!.mutating, true);
  assert.equal(byTool.get("csda_harness_run")!.mutating, true);
});

// ── argv construction ─────────────────────────────────────────────────────────

const spec = (tool: string) => COMMANDS.find((c) => c.tool === tool)!;

test("argv puts positionals and flags where csda expects them", () => {
  assert.deepEqual(buildArgv(spec("csda_validate"), { target: "./proj", strict_tdd: true }), [
    "validate",
    "./proj",
    "--strict-tdd",
  ]);
  assert.deepEqual(buildArgv(spec("csda_done"), { requirement: "REQ-007", check: true }), [
    "done",
    "REQ-007",
    "--check",
  ]);
});

test("a false boolean adds no flag", () => {
  assert.deepEqual(buildArgv(spec("csda_validate"), { target: ".", strict_tdd: false }), [
    "validate",
    ".",
  ]);
});

test("repeatable flags expand once per value", () => {
  const argv = buildArgv(spec("csda_specops_add"), {
    pack_repo: "https://x/y.git",
    pack: "backend",
    var: ["PROJECT_NAME=A", "DOMAIN=B"],
  });
  assert.deepEqual(argv, [
    "specops",
    "add",
    "--pack-repo",
    "https://x/y.git",
    "--pack",
    "backend",
    "--var",
    "PROJECT_NAME=A",
    "--var",
    "DOMAIN=B",
  ]);
});

test("an argument that looks like shell metacharacters stays one argument", () => {
  // There is no shell, so this is data, not syntax. The array shape is what
  // makes injection structurally impossible rather than filtered.
  const argv = buildArgv(spec("csda_validate"), { target: "; rm -rf / #" });
  assert.deepEqual(argv, ["validate", "; rm -rf / #"]);
  assert.equal(argv.length, 2);
});

test("the schema marks required params and forbids extras", () => {
  const schema = inputSchema(spec("csda_validate")) as any;
  assert.deepEqual(schema.required, ["target"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.strict_tdd.type, "boolean");
});

test("enum params advertise their values", () => {
  const schema = inputSchema(spec("csda_plan")) as any;
  assert.deepEqual(schema.properties.format.enum, ["text", "json"]);
});

// ── path confinement ──────────────────────────────────────────────────────────

test("a path outside the project is refused", () => {
  const root = tmp();
  try {
    const scope = scopeIn(root);
    assert.throws(() => resolveInScope("../../../etc/passwd", scope), PathError);
    assert.throws(() => resolveInScope("/etc/passwd", scope), PathError);
  } finally {
    clean(root);
  }
});

test("a symlink pointing out of the project is refused", () => {
  const root = tmp();
  const outside = tmp();
  try {
    fs.writeFileSync(path.join(outside, "secret.txt"), "s3cret", "utf8");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    // Resolution happens on the canonical path, so the link is followed and
    // then judged — checking the string the model supplied would let this pass.
    assert.throws(() => readFileInScope("link.txt", scopeIn(root)), PathError);
  } finally {
    clean(root);
    clean(outside);
  }
});

test("--add-dir opens another root explicitly", () => {
  const root = tmp();
  const other = tmp();
  try {
    fs.writeFileSync(path.join(other, "a.txt"), "hi", "utf8");
    const scope: FileScope = { root, additionalRoots: [other], writable: DEFAULT_WRITABLE };
    assert.equal(readFileInScope(path.join(other, "a.txt"), scope), "hi");
  } finally {
    clean(root);
    clean(other);
  }
});

test("writes are limited to the spec surface", () => {
  const root = tmp();
  try {
    const scope = scopeIn(root);
    assert.equal(isWritable(path.join(root, "docs/specs/x.md"), scope), true);
    assert.equal(isWritable(path.join(root, "features/a/b.feature"), scope), true);
    assert.equal(isWritable(path.join(root, "spec.md"), scope), true);
    // Source code and package manifests are not the agent's to rewrite.
    assert.equal(isWritable(path.join(root, "src/index.ts"), scope), false);
    assert.equal(isWritable(path.join(root, "package.json"), scope), false);
  } finally {
    clean(root);
  }
});

test("writing outside the writable surface is refused with the list", () => {
  const root = tmp();
  try {
    assert.throws(
      () => writeFileInScope("src/index.ts", "x", scopeIn(root)),
      (err: PathError) => {
        assert.match(err.message, /Not writable/);
        assert.match(err.message, /docs/);
        return true;
      }
    );
  } finally {
    clean(root);
  }
});

test("write then read round-trips inside the surface", () => {
  const root = tmp();
  try {
    const scope = scopeIn(root);
    const written = writeFileInScope("docs/specs/a.md", "# Hola\n", scope);
    assert.equal(written, "docs/specs/a.md");
    assert.equal(readFileInScope("docs/specs/a.md", scope), "# Hola\n");
  } finally {
    clean(root);
  }
});

test("edit refuses when the target text is missing or ambiguous", () => {
  const root = tmp();
  try {
    const scope = scopeIn(root);
    writeFileInScope("docs/a.md", "one\ntwo\none\n", scope);
    assert.throws(() => editFileInScope("docs/a.md", "three", "x", scope), /not found/);
    assert.throws(() => editFileInScope("docs/a.md", "one", "x", scope), /appears 2 times/);
    // Unique match succeeds.
    assert.equal(editFileInScope("docs/a.md", "two", "dos", scope), "docs/a.md");
    assert.equal(readFileInScope("docs/a.md", scope), "one\ndos\none\n");
  } finally {
    clean(root);
  }
});

test("list_files skips build output and dependencies", () => {
  const root = tmp();
  try {
    const scope = scopeIn(root);
    writeFileInScope("docs/a.md", "a", scope);
    fs.mkdirSync(path.join(root, "node_modules/pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/pkg/index.js"), "x", "utf8");
    const listed = listFilesInScope(".", scope);
    assert.deepEqual(listed, ["docs/a.md"]);
  } finally {
    clean(root);
  }
});

// ── execution ─────────────────────────────────────────────────────────────────

test("a non-zero exit is reported to the model as the headline", async () => {
  const root = tmp();
  try {
    const script = path.join(root, "fail.js");
    fs.writeFileSync(script, 'console.log("stdout line");process.exit(3);', "utf8");
    const result = await runCsda([], { cliPath: script, cwd: root });
    assert.equal(result.ok, false);
    assert.equal(result.code, 3);
    const text = formatResult([], result);
    // A model shown only stdout would cheerfully report success.
    assert.match(text, /exit code: 3/);
    assert.match(text, /stdout line/);
  } finally {
    clean(root);
  }
});

test("output is capped so one noisy command cannot fill the context", async () => {
  const root = tmp();
  try {
    const script = path.join(root, "loud.js");
    fs.writeFileSync(script, 'process.stdout.write("x".repeat(50000));', "utf8");
    const result = await runCsda([], { cliPath: script, cwd: root, maxOutputBytes: 1000 });
    assert.ok(result.stdout.length < 2000);
    assert.match(result.stdout, /truncated/);
  } finally {
    clean(root);
  }
});

// ── registry wiring ───────────────────────────────────────────────────────────

test("a mutating tool asks before it runs, and a denial is reported back", async () => {
  const root = tmp();
  try {
    const asked: string[] = [];
    const tools = buildTools({
      exec: { cliPath: path.join(root, "noop.js"), cwd: root },
      scope: scopeIn(root),
      confirm: async (tool) => {
        asked.push(tool);
        return false;
      },
    });
    const write = tools.find((t) => t.name === "write_file")!;
    const out = await write.run({ path: "docs/a.md", contents: "x" } as any);
    assert.match(String(out), /Denied by the user/);
    assert.deepEqual(asked, ["write_file"]);
    assert.equal(fs.existsSync(path.join(root, "docs/a.md")), false);
  } finally {
    clean(root);
  }
});

test("a read-only tool never asks", async () => {
  const root = tmp();
  try {
    let asked = 0;
    const scope = scopeIn(root);
    writeFileInScope("docs/a.md", "hello", scope);
    const tools = buildTools({
      exec: { cliPath: path.join(root, "noop.js"), cwd: root },
      scope,
      confirm: async () => {
        asked += 1;
        return true;
      },
    });
    const read = tools.find((t) => t.name === "read_file")!;
    assert.equal(await read.run({ path: "docs/a.md" } as any), "hello");
    assert.equal(asked, 0);
  } finally {
    clean(root);
  }
});

test("a refused path comes back as text the model can act on, not a crash", async () => {
  const root = tmp();
  try {
    const tools = buildTools({
      exec: { cliPath: path.join(root, "noop.js"), cwd: root },
      scope: scopeIn(root),
    });
    const read = tools.find((t) => t.name === "read_file")!;
    const out = await read.run({ path: "../../../etc/passwd" } as any);
    assert.match(String(out), /^Refused:/);
    assert.match(String(out), /outside the project/);
  } finally {
    clean(root);
  }
});

// ── provider selection ────────────────────────────────────────────────────────

test("anthropic is chosen when its key is present", () => {
  const choice = selectProvider(null, null, { ANTHROPIC_API_KEY: "x" } as any);
  assert.equal(choice.id, "anthropic");
  assert.equal(choice.model, "claude-opus-5");
});

test("openai is chosen when only its key is present", () => {
  const choice = selectProvider(null, null, { OPENAI_API_KEY: "x" } as any);
  assert.equal(choice.id, "openai");
  assert.equal(choice.model, "gpt-5");
});

test("an explicit model overrides the provider default", () => {
  const choice = selectProvider(null, "gpt-4.1", { OPENAI_API_KEY: "x" } as any);
  assert.equal(choice.model, "gpt-4.1");
});

test("--provider never silently falls back to the other vendor", () => {
  // A run that quietly used a different model than the one asked for is worse
  // than a run that refused.
  assert.throws(
    () => selectProvider("openai", null, { ANTHROPIC_API_KEY: "x" } as any),
    /OPENAI_API_KEY is not set/
  );
});

test("no credentials at all is a clear error naming both variables", () => {
  assert.throws(
    () => selectProvider(null, null, {} as any),
    (err: Error) => {
      assert.match(err.message, /ANTHROPIC_API_KEY/);
      assert.match(err.message, /OPENAI_API_KEY/);
      return true;
    }
  );
});

test("both engines are handed the identical tool set", () => {
  // The boundary is the tool surface, not the vendor: a tool that existed on
  // one provider and not the other would make the guarantee provider-specific.
  const root = tmp();
  try {
    const built = buildTools({
      exec: { cliPath: path.join(root, "noop.js"), cwd: root },
      scope: scopeIn(root),
    });
    assert.deepEqual(
      built.map((t) => t.name).sort(),
      [...TOOL_NAMES].sort()
    );
    // Every tool carries a JSON Schema, which is what lets one definition
    // serve both vendors' envelopes.
    for (const tool of built) {
      assert.equal((tool as any).input_schema.type, "object");
      assert.ok((tool as any).description.length > 20);
    }
  } finally {
    clean(root);
  }
});
