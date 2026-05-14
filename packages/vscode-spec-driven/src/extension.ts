"use strict";

/**
 * VS Code extension entry point.
 * This file is the ONLY one that imports the `vscode` module.
 * All domain logic lives in pure sibling modules (pack-validator, traceability,
 * validate-runner) that can be unit-tested without a VS Code runtime.
 */

const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs");

const { validatePackYaml } = require("./pack-validator");
const { findRequirementIds, findIdInTraceability, parseValidateOutput } = require("./traceability");
const { runValidate } = require("./validate-runner");
const {
  analyzePackGraph,
  referenceKindForLine,
  findDeclarationPosition,
  renderPackMermaid,
} = require("./pack-graph");

// ── Diagnostic collections ──────────────────────────────────────────────────────────────

/** @type {vscode.DiagnosticCollection} */
let packDiagnostics;
/** @type {vscode.DiagnosticCollection} */
let validateDiagnostics;

// The single live "Pack Graph" webview panel, and the pack.yaml it mirrors.
/** @type {vscode.WebviewPanel|null} */
let packGraphPanel = null;
/** @type {string|null} */
let packGraphFsPath = null;

// ── Activation ────────────────────────────────────────────────────────────────────────────

/**
 * Called once when VS Code first activates the extension.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  packDiagnostics = vscode.languages.createDiagnosticCollection("spec-driven-pack");
  validateDiagnostics = vscode.languages.createDiagnosticCollection("spec-driven-validate");

  context.subscriptions.push(packDiagnostics, validateDiagnostics);

  // Validate pack.yaml whenever it's opened or its content changes
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isPackYaml(doc)) lintPackDocument(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((evt) => {
      if (isPackYaml(evt.document)) lintPackDocument(evt.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      packDiagnostics.delete(doc.uri);
    })
  );

  // Run project-level validate on save (opt-in via setting); refresh the
  // Pack Graph webview when its source pack.yaml is saved or edited.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      refreshPackGraphFor(doc);
      const cfg = config();
      if (!cfg.get("validateOnSave")) return;
      const root = findProjectRoot(doc.uri.fsPath);
      if (root) triggerProjectValidate(root, cfg.get("cliPath"));
    }),
    vscode.workspace.onDidChangeTextDocument((evt) => refreshPackGraphFor(evt.document))
  );

  // CodeLens: "Reveal REQ-NNN in traceability" above every requirement ID
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, new RequirementCodeLensProvider())
  );

  // pack.yaml authoring: reference-field autocomplete + go-to-definition.
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: "file", language: "yaml" },
      new PackReferenceCompletionProvider()
    ),
    vscode.languages.registerDefinitionProvider(
      { scheme: "file", language: "yaml" },
      new PackReferenceDefinitionProvider()
    )
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "spec-driven.revealInTraceability",
      cmdRevealInTraceability
    ),
    vscode.commands.registerCommand("spec-driven.validateProject", cmdValidateProject),
    vscode.commands.registerCommand("spec-driven.showPackGraph", cmdShowPackGraph)
  );

  // Lint any pack.yaml files already open when extension activates
  vscode.workspace.textDocuments.forEach((doc) => {
    if (isPackYaml(doc)) lintPackDocument(doc);
  });
}

function deactivate() {
  packDiagnostics?.dispose();
  validateDiagnostics?.dispose();
  packGraphPanel?.dispose();
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** @returns {vscode.WorkspaceConfiguration} */
function config() {
  return vscode.workspace.getConfiguration("spec-driven");
}

/** True when the document is a file named pack.yaml with YAML language mode. */
function isPackYaml(doc) {
  return (
    path.basename(doc.fileName) === "pack.yaml" &&
    (doc.languageId === "yaml" || doc.languageId === "plaintext")
  );
}

/**
 * Walk up the directory tree to find the spec-driven project root.
 * Recognised by the presence of spec.md or docs/specs/traceability.md.
 * @param {string} filePath
 * @returns {string|null}
 */
function findProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  const { root } = path.parse(dir);
  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, "spec.md")) ||
      fs.existsSync(path.join(dir, "docs", "specs", "traceability.md"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── pack.yaml linting ──────────────────────────────────────────────────────────────────

function lintPackDocument(doc) {
  const cfg = config();
  const schemaPath =
    cfg.get("schemaPath") || path.resolve(__dirname, "../../../../schemas/pack.schema.json");

  const { parseError, errors } = validatePackYaml(doc.getText(), schemaPath);

  const diags = [];

  if (parseError) {
    diags.push(makeDiag(parseError.line, parseError.col, parseError.message, parseError.severity));
  }

  for (const e of errors) {
    diags.push(makeDiag(e.line, e.col, e.message, e.severity));
  }

  // Cross-reference linting: dangling REQ/CMD/AGG/EVT references that the
  // JSON Schema cannot catch (it validates shape, not referential integrity).
  for (const d of analyzePackGraph(doc.getText()).dangling) {
    diags.push(makeDiag(d.line, d.col, d.message, d.severity));
  }

  packDiagnostics.set(doc.uri, diags);
}

/** Build a vscode.Diagnostic from a plain error descriptor. */
function makeDiag(line, col, message, severity) {
  const l = Math.max(0, line);
  const c = Math.max(0, col);
  return new vscode.Diagnostic(
    new vscode.Range(l, c, l, Math.max(c + 1, c + 80)),
    message,
    severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information
  );
}

// ── Project validate ─────────────────────────────────────────────────────────────────

function triggerProjectValidate(projectDir, cliPath) {
  const result = runValidate(projectDir, cliPath);

  if (result.spawnError) {
    vscode.window.showErrorMessage(
      `Spec-Driven: could not run validate — ${result.spawnError}. ` +
        `Check the 'spec-driven.cliPath' setting.`
    );
    return;
  }

  const diags = parseValidateOutput(result.stdout, result.stderr);
  const errors = diags.filter((d) => d.severity === "error");
  const warnings = diags.filter((d) => d.severity === "warning");

  // Anchor diagnostics to spec.md if it exists, otherwise the project root URI
  const anchorFile = fs.existsSync(path.join(projectDir, "spec.md"))
    ? path.join(projectDir, "spec.md")
    : projectDir;
  const anchorUri = vscode.Uri.file(anchorFile);

  validateDiagnostics.set(
    anchorUri,
    diags.filter((d) => d.severity !== "info").map((d) => makeDiag(0, 0, d.message, d.severity))
  );

  if (result.exitCode === 0) {
    vscode.window.setStatusBarMessage("$(check) Spec-Driven: validate passed", 5_000);
  } else {
    vscode.window
      .showWarningMessage(
        `Spec-Driven: ${errors.length} error(s), ${warnings.length} warning(s). See Problems panel.`,
        "Open Problems"
      )
      .then((choice) => {
        if (choice === "Open Problems") {
          vscode.commands.executeCommand("workbench.actions.view.problems");
        }
      });
  }
}

// ── Commands ────────────────────────────────────────────────────────────────────────

/** Command: spec-driven.revealInTraceability */
async function cmdRevealInTraceability(editor) {
  if (!editor) {
    vscode.window.showInformationMessage(
      "Open a file first, then place the cursor on a requirement ID."
    );
    return;
  }

  const wordRange = editor.document.getWordRangeAtPosition(
    editor.selection.active,
    /[A-Z]+-\d{3,}/
  );
  if (!wordRange) {
    vscode.window.showInformationMessage(
      "Place the cursor on a requirement ID (e.g. REQ-001, UC-003) then run this command."
    );
    return;
  }

  const id = editor.document.getText(wordRange);
  const root = findProjectRoot(editor.document.fileName);

  if (!root) {
    vscode.window.showWarningMessage(
      "Cannot find spec-driven project root (no spec.md found in parent directories)."
    );
    return;
  }

  const traceFile = path.join(root, "docs", "specs", "traceability.md");
  if (!fs.existsSync(traceFile)) {
    vscode.window.showWarningMessage(
      "docs/specs/traceability.md not found. Run 'init' to generate it."
    );
    return;
  }

  const content = fs.readFileSync(traceFile, "utf8");
  const targetLine = findIdInTraceability(content, id);

  const traceUri = vscode.Uri.file(traceFile);
  const doc = await vscode.workspace.openTextDocument(traceUri);
  const targetEditor = await vscode.window.showTextDocument(doc);

  if (targetLine >= 0) {
    const pos = new vscode.Position(targetLine, 0);
    targetEditor.selection = new vscode.Selection(pos, pos);
    targetEditor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } else {
    vscode.window.showInformationMessage(`${id} is not yet listed in the traceability matrix.`);
  }
}

/** Command: spec-driven.validateProject */
async function cmdValidateProject() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open.");
    return;
  }

  const cfg = config();
  const cliPath = cfg.get("cliPath");

  for (const folder of folders) {
    triggerProjectValidate(folder.uri.fsPath, cliPath);
  }
}

// ── Pack Graph webview ────────────────────────────────────────────────────────────────

/** Command: spec-driven.showPackGraph */
function cmdShowPackGraph() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isPackYaml(editor.document)) {
    vscode.window.showInformationMessage("Open a pack.yaml file, then run this command.");
    return;
  }
  const doc = editor.document;

  if (packGraphPanel) {
    packGraphFsPath = doc.fileName;
    packGraphPanel.title = `Pack Graph — ${path.basename(path.dirname(doc.fileName))}`;
    packGraphPanel.reveal(vscode.ViewColumn.Beside);
    postPackGraph(doc);
    return;
  }

  packGraphPanel = vscode.window.createWebviewPanel(
    "specDrivenPackGraph",
    `Pack Graph — ${path.basename(path.dirname(doc.fileName))}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  packGraphFsPath = doc.fileName;
  packGraphPanel.webview.html = packGraphHtml(packGraphPanel.webview);
  packGraphPanel.onDidDispose(() => {
    packGraphPanel = null;
    packGraphFsPath = null;
  });
  // The webview tells us when its script is ready, then we send the graph.
  packGraphPanel.webview.onDidReceiveMessage((msg) => {
    if (msg && msg.type === "ready") postPackGraph(doc);
  });
}

/** Re-render the webview when its source pack.yaml changes. */
function refreshPackGraphFor(doc) {
  if (!packGraphPanel || !packGraphFsPath) return;
  if (doc.fileName !== packGraphFsPath) return;
  postPackGraph(doc);
}

function postPackGraph(doc) {
  if (!packGraphPanel) return;
  packGraphPanel.webview.postMessage({
    type: "update",
    mermaid: renderPackMermaid(doc.getText()),
  });
}

function nonce() {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Static webview shell. Mermaid is loaded from jsDelivr (the webview needs
 * network for this feature); the graph text arrives via postMessage so edits
 * re-render without reloading the CDN script.
 */
function packGraphHtml(webview) {
  const n = nonce();
  const cdn = "https://cdn.jsdelivr.net";
  const csp =
    `default-src 'none'; ` +
    `img-src ${webview.cspSource} data:; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `script-src 'nonce-${n}' ${cdn};`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 0; margin: 0; }
    #toolbar { padding: 6px 10px; font-size: 12px; opacity: 0.7; }
    #graph { padding: 10px; }
    .err { color: var(--vscode-errorForeground); padding: 10px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="toolbar">REQ → UC → CMD/QUERY/AGG/EVT — refreshes on save</div>
  <div id="graph">Loading…</div>
  <script nonce="${n}" src="${cdn}/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script nonce="${n}">
    const vscode = acquireVsCodeApi();
    let ready = false;
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      ready = true;
    }
    const graphEl = document.getElementById("graph");
    window.addEventListener("message", async (event) => {
      const msg = event.data;
      if (!msg || msg.type !== "update") return;
      if (!ready) { graphEl.innerHTML = '<div class="err">Mermaid failed to load (no network?).</div>'; return; }
      try {
        const { svg } = await mermaid.render("packGraph", msg.mermaid);
        graphEl.innerHTML = svg;
      } catch (e) {
        graphEl.innerHTML = '<div class="err">Could not render graph:\\n' + String(e && e.message || e) + '</div>';
      }
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

// ── CodeLens provider ─────────────────────────────────────────────────────────────────

class RequirementCodeLensProvider {
  /**
   * @param {vscode.TextDocument} document
   * @returns {vscode.CodeLens[]}
   */
  provideCodeLenses(document) {
    const cfg = config();
    if (!cfg.get("codeLens")) return [];

    const lenses = findRequirementIds(document.getText()).map(({ id, line, col, endCol }) => {
      const range = new vscode.Range(line, col, line, endCol);
      return new vscode.CodeLens(range, {
        title: `$(link-external) Reveal ${id} in traceability`,
        command: "spec-driven.revealInTraceability",
        tooltip: `Open docs/specs/traceability.md at ${id}`,
      });
    });

    // In pack.yaml, show how many use cases / scenarios reference each
    // requirement, right on its declaration line.
    if (isPackYaml(document)) {
      const { refCounts } = analyzePackGraph(document.getText());
      const lines = document.getText().split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/\bid:\s*["']?(REQ-\d+)\b/);
        if (!m) continue;
        const counts = refCounts.get(m[1]) || { useCases: 0, scenarios: 0 };
        const idCol = lines[i].indexOf(m[1]);
        const range = new vscode.Range(i, Math.max(0, idCol), i, idCol + m[1].length);
        lenses.push(
          new vscode.CodeLens(range, {
            title:
              `$(references) ${counts.useCases} use case(s) · ` + `${counts.scenarios} scenario(s)`,
            command: "",
            tooltip: `${m[1]} is referenced by ${counts.useCases} use case(s) and ${counts.scenarios} scenario(s) in this pack.`,
          })
        );
      }
    }

    return lenses;
  }
}

// ── pack.yaml reference autocomplete ──────────────────────────────────────────────────

const KIND_DETAIL = {
  requirement: "requirement",
  command: "command",
  query: "query",
  aggregate: "aggregate",
  event: "event",
};

class PackReferenceCompletionProvider {
  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @returns {vscode.CompletionItem[]}
   */
  provideCompletionItems(document, position) {
    if (!isPackYaml(document)) return [];

    const lines = document.getText().split("\n");
    const kind = referenceKindForLine(lines, position.line);
    if (!kind) return [];

    const { declared } = analyzePackGraph(document.getText());
    const candidates = declared[kind];
    if (!candidates || candidates.size === 0) return [];

    return [...candidates].sort().map((value) => {
      const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Reference);
      item.detail = `pack.yaml ${KIND_DETAIL[kind]}`;
      return item;
    });
  }
}

// ── pack.yaml go-to-definition ────────────────────────────────────────────────────────

class PackReferenceDefinitionProvider {
  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @returns {vscode.Location|null}
   */
  provideDefinition(document, position) {
    if (!isPackYaml(document)) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_-]*/);
    if (!wordRange) return null;

    const token = document.getText(wordRange);
    const decl = findDeclarationPosition(document.getText(), token);
    if (!decl) return null;

    // Don't jump from a declaration to itself.
    if (decl.line === position.line) return null;

    return new vscode.Location(document.uri, new vscode.Position(decl.line, decl.col));
  }
}

module.exports = { activate, deactivate };
