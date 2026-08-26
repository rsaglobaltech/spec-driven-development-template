#!/usr/bin/env node
import {
  ReportCommand,
  buildReport,
  buildDeclaredValues,
  readSpecops,
  renderHtml,
  renderJson,
  parseArgs,
  sparkline,
  ReportOptions,
} from "./cli/commands/quality/ReportCommand";

export {
  ReportCommand,
  buildReport,
  buildDeclaredValues,
  readSpecops,
  renderHtml,
  renderJson,
  parseArgs,
  sparkline,
  ReportOptions,
};

if (require.main === module) {
  new ReportCommand(process.argv.slice(2)).execute();
}
