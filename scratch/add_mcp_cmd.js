const fs = require('fs');
let content = fs.readFileSync('scripts/lib/surface.ts', 'utf8');
const insertStr = `
  {
    name: "mcp",
    subcommands: [
      { name: "install", mcp: false, help: { summary: "Install MCP server configuration for AI clients.", opts: "--client <claude|cursor|vscode|kiro>" } }
    ]
  },`;

content = content.replace(/name: "studio",\s*}/, 'name: "studio",\n  },' + insertStr);
fs.writeFileSync('scripts/lib/surface.ts', content);
