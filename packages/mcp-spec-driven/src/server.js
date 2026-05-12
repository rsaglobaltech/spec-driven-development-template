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
const SERVER_INFO = {
  name: "mcp-spec-driven",
  version: require("../package.json").version,
};

// ── JSON-RPC framing over stdio ───────────────────────────────────────────────

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
      } catch (err) {
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

function writeError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

// ── Method dispatch ───────────────────────────────────────────────────────────

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
          tools: Object.entries(TOOLS).map(([name, t]) => ({
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

// ── Main loop ─────────────────────────────────────────────────────────────────

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
