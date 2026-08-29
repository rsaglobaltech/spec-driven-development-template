import { McpInstallCommand } from "./McpInstallCommand";
import { BaseCommand } from "../../../lib/command";
import { agentIo } from "../../../lib/agent";

export class McpCommand extends BaseCommand {
  public execute(): void {
    const sub = this.args[0];
    if (sub === "install") {
      new McpInstallCommand(this.args.slice(1)).execute();
      return;
    }
    agentIo(this.args.includes("--json")).fail({ mcp: null }, [{
      code: "unknown_mcp_command",
      message: "Unknown subcommand for mcp.",
      severity: "error", fix: "Use 'csda mcp install --client <client>'"
    }]);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  new McpCommand(process.argv.slice(2)).execute();
}
