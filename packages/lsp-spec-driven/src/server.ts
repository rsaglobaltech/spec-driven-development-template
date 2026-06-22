#!/usr/bin/env node
"use strict";

/**
 * Spec-Driven Language Server (LSP over stdio, JSON-RPC 2.0).
 *
 * A minimal, dependency-free server — same hand-rolled framing as the MCP
 * server — that publishes inline diagnostics for `traceability.md` using the
 * shared pure core in `diagnostics.ts` (the same rules as `validate
 * --strict-tdd`). One LSP feeds every editor: VS Code, IntelliJ (via LSP4IJ),
 * Neovim, etc. — instead of reimplementing the checks per IDE.
 *
 * Implemented: initialize, initialized, textDocument/{didOpen,didChange,didSave,
 * didClose}, shutdown, exit. Diagnostics are pushed via textDocument/publishDiagnostics.
 */

import { computeTraceabilityDiagnostics, SpecDiagnostic } from "./diagnostics";

let buffer = "";
let shuttingDown = false;

function send(message: any): void {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function isTraceability(uri: string): boolean {
  return uri.endsWith("/traceability.md") || uri.endsWith("traceability.md");
}

function toLspDiagnostics(diags: SpecDiagnostic[]): any[] {
  return diags.map((d) => ({
    range: {
      start: { line: d.line, character: d.startCol },
      end: { line: d.line, character: d.endCol },
    },
    severity: d.severity,
    code: d.code,
    source: "spec-driven",
    message: d.message,
  }));
}

function publish(uri: string, text: string): void {
  if (!isTraceability(uri)) return;
  const diagnostics = toLspDiagnostics(computeTraceabilityDiagnostics(text));
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics },
  });
}

function handle(msg: any): void {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          capabilities: {
            // 1 = full document sync: client sends the whole text on each change.
            textDocumentSync: 1,
          },
          serverInfo: { name: "spec-driven-lsp", version: "0.1.0" },
        },
      });
      return;

    case "initialized":
      return; // notification, no response

    case "textDocument/didOpen":
      publish(params.textDocument.uri, params.textDocument.text);
      return;

    case "textDocument/didChange": {
      // Full sync → the last content change holds the entire document.
      const changes = params.contentChanges || [];
      const text = changes.length ? changes[changes.length - 1].text : "";
      publish(params.textDocument.uri, text);
      return;
    }

    case "textDocument/didSave":
      if (params.text !== undefined) publish(params.textDocument.uri, params.text);
      return;

    case "textDocument/didClose":
      // Clear diagnostics for the closed document.
      send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: params.textDocument.uri, diagnostics: [] },
      });
      return;

    case "shutdown":
      shuttingDown = true;
      send({ jsonrpc: "2.0", id, result: null });
      return;

    case "exit":
      process.exit(shuttingDown ? 0 : 1);
      return;

    default:
      // Respond to unknown *requests* (those with an id) with MethodNotFound;
      // ignore unknown notifications.
      if (id !== undefined && id !== null) {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
      }
  }
}

function onChunk(chunk: Buffer): void {
  buffer += chunk.toString("utf8");
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headers = buffer.slice(0, headerEnd);
    const m = headers.match(/Content-Length:\s*(\d+)/i);
    if (!m) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = parseInt(m[1], 10);
    const start = headerEnd + 4;
    if (buffer.length < start + length) break;
    const body = buffer.slice(start, start + length);
    buffer = buffer.slice(start + length);
    try {
      handle(JSON.parse(body));
    } catch {
      // Malformed message — skip it; LSP clients resend on the next change.
    }
  }
}

function main(): void {
  process.stdin.on("data", onChunk);
  process.stdin.on("end", () => process.exit(0));
}

if (require.main === module) main();

export { handle, toLspDiagnostics, isTraceability };
