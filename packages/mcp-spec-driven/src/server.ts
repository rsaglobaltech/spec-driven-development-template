#!/usr/bin/env node
"use strict";

/**
 * MCP server for create-spec-driven-app projects.
 *
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 * Supported methods: initialize, tools/list, tools/call.
 *
 * This is a minimal hand-rolled implementation — no @modelcontextprotocol/sdk
 * dependency — to keep the install footprint small. It implements the subset
 * required by Claude Desktop, Cursor, Aider, and other MCP-aware clients.
 */

const { TOOLS } = require("./tools");

const PROTOCOL_VERSION = "2024-11-05";

/**
 * This file is compiled into two layouts: the repository's root `dist/` for the
 * test suite, and the package's own `dist/` for publishing. A fixed relative
 * path to package.json resolves in one and not the other, so walk up for it.
 */
function packageVersion() {
  const fs = require("node:fs");
  const path = require("node:path");
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (pkg.name === "@spec-driven/mcp-server") return pkg.version;
        // Reached the repository root instead: the manifest is beside it, not
        // above the compiled file, because the root build flattens into dist/.
        if (pkg.name === "create-spec-driven-app") {
          const sibling = path.join(dir, "packages", "mcp-spec-driven", "package.json");
          if (fs.existsSync(sibling)) {
            return JSON.parse(fs.readFileSync(sibling, "utf8")).version;
          }
        }
      } catch {
        // Keep walking — a malformed manifest above us is not ours.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "0.0.0";
}

const SERVER_INFO = {
  name: "mcp-spec-driven",
  version: packageVersion(),
};

// ── JSON-RPC framing over stdio ──────────────────────────────────────────────────

let buffer = "";

function readMessage(chunk) {
  buffer += chunk.toString("utf8");

  const messages = [];
  // Try Content-Length framing first (per LSP/MCP convention)
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headers = buffer.slice(0, headerEnd);
    const lengthMatch = headers.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      // Bad header — drop until next \r\n\r\n
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = parseInt(lengthMatch[1], 10);
    const messageStart = headerEnd + 4;
    if (buffer.length < messageStart + length) break;
    const body = buffer.slice(messageStart, messageStart + length);
    buffer = buffer.slice(messageStart + length);
    try {
      messages.push(JSON.parse(body));
    } catch (err) {
      writeError(null, -32700, `Parse error: ${err.message}`);
    }
  }

  // Also try newline-delimited JSON (used by some clients)
  if (messages.length === 0 && buffer.includes("\n")) {
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        messages.push(JSON.parse(trimmed));
      } catch {
        // not JSON — ignore (probably a Content-Length header fragment)
      }
    }
  }

  return messages;
}

function writeMessage(message) {
  const body = JSON.stringify(message);
  const out = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
  process.stdout.write(out);
}

function writeError(id, code, message, data?) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

// ── Method dispatch ──────────────────────────────────────────────────────────────────────

function handleMessage(msg) {
  if (msg.jsonrpc !== "2.0") {
    writeError(msg.id || null, -32600, "Invalid request: missing jsonrpc=2.0");
    return;
  }

  const { id, method, params } = msg;

  try {
    switch (method) {
      case "initialize":
        writeResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: { tools: {} },
        });
        break;

      case "initialized":
      case "notifications/initialized":
        // Notification — no response
        break;

      case "tools/list":
        writeResult(id, {
          tools: Object.entries(TOOLS).map(([name, t]: [string, any]) => ({
            name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        break;

      case "tools/call": {
        const toolName = params && params.name;
        const args = (params && params.arguments) || {};
        const tool = TOOLS[toolName];
        if (!tool) {
          writeError(id, -32601, `Unknown tool: ${toolName}`);
          break;
        }
        try {
          const result = tool.handler(args);
          writeResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: false,
          });
        } catch (err) {
          writeResult(id, {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          });
        }
        break;
      }

      case "ping":
        writeResult(id, {});
        break;

      case "shutdown":
        writeResult(id, null);
        process.exit(0);
        break;

      default:
        if (id !== undefined && id !== null) {
          writeError(id, -32601, `Method not found: ${method}`);
        }
      // else: notification — ignore unknown notifications
    }
  } catch (err) {
    writeError(id, -32603, `Internal error: ${err.message}`);
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────────────────

function main() {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    const messages = readMessage(chunk);
    for (const msg of messages) handleMessage(msg);
  });
  process.stdin.on("end", () => {
    process.exit(0);
  });

  // Log activation to stderr so clients see it (stdout is reserved for JSON-RPC)
  process.stderr.write(`mcp-spec-driven ${SERVER_INFO.version} ready\n`);
}

if (require.main === module) main();

module.exports = { handleMessage, readMessage, writeMessage };
