/**
 * Taking a requirement back out (Fase 4.1).
 *
 * `req add` had no counterpart. When the matrix got into a state somebody
 * wanted to undo, two of three cold adoptions repaired it by hand with a
 * script, because nothing supported it: *"There is no `req rm`/renumber, so I
 * repaired it with a script."*
 *
 * The trigger for that was a defect — `req add` reissuing an id that `adopt`
 * had already seeded — and that defect is fixed. The gap is not: a matrix a
 * team cannot delete a row from is not a document a team can maintain.
 *
 * ## Why there is no `req renumber`
 *
 * It was the other half of what they asked for, and it is deliberately not
 * here. A requirement id is not only a cell in this table: it appears in
 * `@REQ-014` Gherkin tags, in test names, in commit messages, in branch names
 * the harness created, and in whatever a team wrote in their own tracker.
 * Renumbering the two files this tool owns while every other mention keeps the
 * old id would leave a project in a worse state than the one it was trying to
 * fix, and a rename that silently covers 60% of the occurrences is exactly the
 * kind of half-promise this repository keeps finding in itself.
 *
 * Deleting is honest because it is complete: the row and the prose go, and the
 * caller is told what it did *not* touch.
 */

export interface RemovalPlan {
  /** Matrix lines that would go. More than one means the id was duplicated. */
  rows: string[];
  /** Statuses of the rows being removed, for the "this was delivered" guard. */
  statuses: string[];
  /** Feature files the removed rows declared, which nothing will delete. */
  orphanedFeatures: string[];
  /** True when `spec.md` carries prose for this requirement. */
  hasProse: boolean;
}

const DRAFT = "Draft";

/** Statuses that mean somebody recorded this requirement as delivered. */
export function isDelivered(status: string): boolean {
  const s = String(status || "").trim();
  return s !== "" && s !== DRAFT;
}

function cells(line: string): string[] {
  return line.split("|").map((c) => c.trim());
}

/**
 * What removing `reqId` would take out of the matrix.
 *
 * `otherRowsUseFeature` decides whether a declared feature file becomes an
 * orphan: a feature still referenced by another row is nobody's problem.
 */
export function planRemoval(traceContent: string, reqId: string, specContent: string): RemovalPlan {
  const wanted = String(reqId || "").trim();
  const lines = String(traceContent || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const rows: string[] = [];
  const statuses: string[] = [];
  const declaredFeatures: string[] = [];
  const featuresElsewhere = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes("---")) continue;
    const c = cells(trimmed);
    if (c.length < 4) continue;
    const rowId = c[1];
    if (!/^REQ-/.test(rowId)) continue;

    const feature = (c[3] || "").replace(/^`|`$/g, "").split("#")[0].trim();

    if (rowId === wanted) {
      rows.push(line);
      statuses.push(c[c.length - 2] || "");
      if (feature && feature !== "-") declaredFeatures.push(feature);
    } else if (feature && feature !== "-") {
      featuresElsewhere.add(feature);
    }
  }

  return {
    rows,
    statuses,
    orphanedFeatures: [...new Set(declaredFeatures)].filter((f) => !featuresElsewhere.has(f)),
    hasProse: hasProseFor(specContent, wanted),
  };
}

/** Every requirement id a piece of text names. Static: never built from input. */
const REQ_ID = /\bREQ-[A-Za-z0-9.]+\b/g;
const HEADING = /^#{2,4}\s+/;

function namedIds(text: string): string[] {
  return text.match(REQ_ID) || [];
}

/** `| REQ-014 | …` — the id in a table row's first cell, or null. */
function firstCellId(trimmedLine: string): string | null {
  if (!trimmedLine.startsWith("|")) return null;
  const first = trimmedLine.split("|")[1];
  return first === undefined ? null : first.trim();
}

function hasProseFor(specContent: string, reqId: string): boolean {
  if (!reqId) return false;
  for (const line of String(specContent || "")
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const trimmed = line.trim();
    if (HEADING.test(trimmed) && namedIds(trimmed).includes(reqId)) return true;
    if (firstCellId(trimmed) === reqId) return true;
  }
  return false;
}

/** The matrix without `reqId`'s rows. */
export function removeMatrixRows(traceContent: string, reqId: string): string {
  const wanted = String(reqId || "").trim();
  return String(traceContent || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) return true;
      const c = cells(trimmed);
      return c.length < 2 || c[1] !== wanted;
    })
    .join("\n");
}

/**
 * `spec.md` without `reqId`'s section or table row.
 *
 * A section runs until the next heading of the same level or higher, matching
 * how `SpecSections` reads it back — the two have to agree or removal leaves
 * half a section behind.
 */
export function removeSpecProse(specContent: string, reqId: string): string {
  const wanted = String(reqId || "").trim();
  const lines = String(specContent || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const kept: string[] = [];
  let skipUntilLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{1,6})\s+\S/.exec(trimmed);

    if (skipUntilLevel > 0) {
      if (heading && heading[1].length <= skipUntilLevel) skipUntilLevel = 0;
      else continue;
    }

    const reqHeading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (reqHeading && namedIds(reqHeading[2]).includes(wanted)) {
      skipUntilLevel = reqHeading[1].length;
      continue;
    }

    if (firstCellId(trimmed) === wanted) continue;

    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}
