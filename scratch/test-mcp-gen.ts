const { SURFACE } = require("../scripts/lib/surface");

function genTools() {
  const tools = {};
  for (const cmd of SURFACE) {
    if (cmd.subcommands) {
      for (const sub of cmd.subcommands) {
        if (sub.mcp) {
          tools[sub.mcp] = `${cmd.name} ${sub.name}`;
        } else {
          tools[`${cmd.name}_${sub.name}`.replace(/-/g, '_')] = `${cmd.name} ${sub.name}`;
        }
      }
    } else {
      if (cmd.mcp) {
        tools[cmd.mcp] = cmd.name;
      } else {
        tools[cmd.name.replace(/-/g, '_')] = cmd.name;
      }
    }
  }
  console.log(tools);
}
genTools();
