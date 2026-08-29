const fs = require('fs');
let content = fs.readFileSync('scripts/lib/surface.ts', 'utf8');

// Find all name: "..." and if they don't have an mcp: "..." in the same block, we will just manually do it.
