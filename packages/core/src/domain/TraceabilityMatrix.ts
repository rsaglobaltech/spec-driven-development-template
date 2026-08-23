import { parseTraceabilityRows, buildTraceabilityMarkdown } from "./TraceabilityFormat";

const EMPTY = "-";

function code(value: string | undefined): string {
  if (!value || value === EMPTY) return EMPTY;
  return /^`.*`$/.test(value) ? value : `\`${value}\``;
}

export class TraceabilityMatrix {
  public static traceRow(req: any) {
    const trace = req.trace || {};
    const firstScenario = (req.scenarios || [])[0];
    return {
      requirement: req.id || req.name,
      scenarioId: trace.scn || (firstScenario && firstScenario.id) || EMPTY,
      featureFile: code(trace.feature),
      useCase: trace.uc || EMPTY,
      commandOrQuery: trace.cmd || trace.qry || EMPTY,
      aggregate: trace.agg || EMPTY,
      event: trace.evt || EMPTY,
      technicalArtifact: code(trace.artifact),
      testArtifact: trace.test || "TBD",
      status: trace.status || "Draft",
    };
  }

  public static statedFields(req: any) {
    const trace = req.trace || {};
    const firstScenario = (req.scenarios || [])[0];
    const stated: Record<string, string> = {};

    if (trace.scn || (firstScenario && firstScenario.id)) {
      stated.scenarioId = trace.scn || firstScenario.id;
    }
    if (trace.feature) stated.featureFile = code(trace.feature);
    if (trace.uc) stated.useCase = trace.uc;
    if (trace.cmd || trace.qry) stated.commandOrQuery = trace.cmd || trace.qry;
    if (trace.agg) stated.aggregate = trace.agg;
    if (trace.evt) stated.event = trace.evt;
    if (trace.artifact) stated.technicalArtifact = code(trace.artifact);
    if (trace.test) stated.testArtifact = trace.test;
    if (trace.status) stated.status = trace.status;

    return stated;
  }

  public static syncTraceability(
    existingContent: string | null,
    applied: { upserts: any[]; removals: string[] }
  ) {
    const parsed = existingContent
      ? parseTraceabilityRows(existingContent)
      : { mode: "rich", rows: [] };

    const rows = parsed.mode === "rich" ? parsed.rows.slice() : [];
    const legacyDropped = parsed.mode !== "rich" ? parsed.rows.length : 0;

    const indexOf = (requirement: string) =>
      rows.findIndex((r: any) => String(r.requirement).trim() === String(requirement).trim());

    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const entry of applied.upserts) {
      const row = this.traceRow(entry.req);
      const idx = indexOf(row.requirement);
      if (idx === -1) {
        rows.push(row);
        added++;
      } else {
        rows[idx] = { ...rows[idx], ...this.statedFields(entry.req) };
        updated++;
      }
    }

    for (const requirement of applied.removals) {
      const idx = indexOf(requirement);
      if (idx !== -1) {
        rows.splice(idx, 1);
        removed++;
      }
    }

    return {
      markdown: this.spliceMatrix(existingContent, buildTraceabilityMarkdown(rows, "rich")),
      totals: { added, updated, removed, legacyDropped },
    };
  }

  private static spliceMatrix(existing: string | null, generated: string) {
    if (!existing) return generated;

    const lines = existing.replace(/\r\n/g, "\n").split("\n");
    const start = lines.findIndex(
      (l) => l.trim().startsWith("| Requirement |") && l.includes("Scenario ID")
    );
    if (start === -1) return generated;

    let end = start;
    while (end < lines.length && lines[end].trim().startsWith("|")) end++;

    const table = generated.split("\n").filter((l) => l.trim().startsWith("|"));

    return [...lines.slice(0, start), ...table, ...lines.slice(end)].join("\n");
  }

  public static updateStatus(
    content: string,
    reqId: string,
    newStatus: string
  ): { content: string; updated: number } {
    const lines = content.split("\n");
    let updated = 0;
    const out = lines.map((line) => {
      if (!line.startsWith("|")) return line;
      if (line.includes("---")) return line;
      if (line.includes("| Requirement | Scenario ID |")) return line;
      if (line.includes("| Feature | Scenario |")) return line;

      const cells = line.split("|");
      if (cells.length < 4) return line;
      const reqCell = (cells[1] || "").trim();
      if (reqCell !== reqId) return line;

      const statusIdx = cells.length - 2;
      cells[statusIdx] = ` ${newStatus} `;
      updated++;
      return cells.join("|");
    });
    return { content: out.join("\n"), updated };
  }

  public static nextReqId(rows: any[]): string {
    let max = 0;
    for (const r of rows) {
      const m = (r.requirement || "").match(/^REQ-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `REQ-${String(max + 1).padStart(3, "0")}`;
  }

  public static nextScenarioId(rows: any[]): string {
    let max = 0;
    for (const r of rows) {
      const m = (r.scenarioId || "").match(/^SCN-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `SCN-${String(max + 1).padStart(3, "0")}`;
  }

  public static buildRow(fields: any): string {
    const cell = (v: any) => {
      const s = (v == null ? "" : String(v)).trim();
      return s === "" ? "-" : s;
    };
    const ordered = [
      fields.requirement,
      fields.scenarioId,
      fields.featureFile,
      fields.useCase,
      fields.command,
      fields.aggregate,
      fields.event,
      fields.technicalArtifact,
      fields.testArtifact,
      fields.status || "Draft",
    ];
    return `| ${ordered.map(cell).join(" | ")} |`;
  }

  public static appendRequirement(
    content: string,
    fields: any,
    parsedRows: any[]
  ): { content: string; reqId: string; scenarioId: string } {
    const reqId = fields.requirement || this.nextReqId(parsedRows);
    const scenarioId = fields.scenarioId || this.nextScenarioId(parsedRows);
    const row = this.buildRow({ ...fields, requirement: reqId, scenarioId });

    let out = content.trimEnd();
    if (!content.includes("| Requirement | Scenario ID |")) {
      const RICH_HEADER =
        "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
      const RICH_SEP = "|---|---|---|---|---|---|---|---|---|---|";
      out += `\n\n${RICH_HEADER}\n${RICH_SEP}`;
    }
    out += `\n${row}\n`;
    return { content: out, reqId, scenarioId };
  }

  public static updateRequirementFields(
    content: string,
    reqId: string,
    fields: Record<string, any>,
    columnMap: Record<string, number>
  ): { content: string; updated: number } {
    const keys = Object.keys(fields).filter((k) => k in columnMap && fields[k] != null);
    if (keys.length === 0) return { content, updated: 0 };

    let updated = 0;
    const out = content.split("\n").map((line) => {
      if (
        !line.startsWith("|") ||
        line.includes("---") ||
        line.includes("| Requirement | Scenario ID |")
      )
        return line;
      const cells = line.split("|");
      if (cells.length < 12) return line;
      if ((cells[columnMap.requirement] || "").trim() !== reqId) return line;
      for (const k of keys) {
        cells[columnMap[k]] = ` ${String(fields[k]).trim()} `;
      }
      updated++;
      return cells.join("|");
    });
    return { content: out.join("\n"), updated };
  }
}
