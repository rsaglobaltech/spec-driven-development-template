#!/usr/bin/env node
"use strict";

/**
 * Shared markdown AST for capability specs and delta specs.
 *
 * One parser, two consumers:
 *   - `parseSpec`  — the source of truth under docs/specs/capabilities/<cap>/spec.md
 *   - `parseDelta` — the ADDED / MODIFIED / REMOVED sections inside a change
 *
 * Both shapes are the same underneath: a list of requirements, each with a
 * body and one or more scenarios. Keeping a single AST is what lets `archive`
 * apply a delta to a spec without a second, subtly different parser.
 *
 * Grammar (a superset of the OpenSpec markdown form — the `REQ-NNN` id and the
 * `csda:trace` comment are ours, and both are optional):
 *
 *   # <title>
 *   ## Purpose
 *   <free text>
 *   ## Requirements
 *   ### Requirement: REQ-014 — Dynamic peak pricing
 *   El sistema SHALL ...
 *   #### Scenario: SCN-014a — Recargo en hora punta
 *   - GIVEN una sesión iniciada a las 18:00
 *   - WHEN se calcula la tarifa
 *   - THEN el importe incluye un recargo del 20 %
 *   <!-- csda:trace uc=UC-007 cmd=CMD-011 feature=features/billing/x.feature -->
 */

const RE_H1 = /^#\s+(.+?)\s*$/;
const RE_H2 = /^##\s+(.+?)\s*$/;
const RE_REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/;
const RE_SCENARIO = /^####\s+Scenario:\s*(.+?)\s*$/;
const RE_TRACE_OPEN = /^\s*<!--\s*csda:trace\b/;
const RE_STEP = /^\s*[-*]\s+(.*)$/;

// `REQ-014 — Dynamic peak pricing` → ["REQ-014", "Dynamic peak pricing"].
// The separator may be an em dash, en dash, hyphen or colon; any amount of
// surrounding whitespace is tolerated.
//
// The prefix list is closed on purpose. A permissive `[A-Z]{2,4}-\w+` would
// read "TOTP-based two-factor auth" as an id of "TOTP-based", silently
// mangling every requirement whose name starts with an acronym.
const RE_LABEL_WITH_ID = /^((?:REQ|SCN|UC|CMD|QRY|AGG|EVT)-[A-Za-z0-9.]+)\s*(?:[—–:-]\s*)?(.*)$/;

const REQ_ID = /^REQ-\d+$/;
const SCN_ID = /^SCN-[A-Za-z0-9.-]+$/;

/** Stable key for matching a requirement across a delta and a spec. */
function slug(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitLabel(label) {
  const m = RE_LABEL_WITH_ID.exec(String(label).trim());
  if (m && m[2]) return { id: m[1], name: m[2].trim() };
  if (m && !m[2]) return { id: m[1], name: m[1] };
  return { id: null, name: String(label).trim() };
}

/**
 * The identity of a requirement. Prefer the explicit id; fall back to a slug of
 * the name so pure-markdown specs (no REQ ids) still round-trip.
 */
function requirementKey(req) {
  if (!req) return null;
  return req.id ? req.id.toUpperCase() : `name:${slug(req.name)}`;
}

function parseTraceComment(raw) {
  // `uc=UC-007 cmd=CMD-011 feature=features/a.feature` → object.
  // Values may be quoted to allow spaces.
  const trace = {};
  const body = raw
    .replace(/^\s*<!--\s*csda:trace\b/, "")
    .replace(/-->\s*$/, "")
    .trim();
  const re = /([a-z_]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
    trace[m[1].toLowerCase()] = value;
  }
  return trace;
}

/**
 * Low-level parse. Returns every `##` section with the requirements nested
 * under it, preserving source line numbers so diagnostics can point at them.
 */
function parseMarkdown(source) {
  const lines = String(source == null ? "" : source).split(/\r?\n/);
  const doc: any = { title: null, sections: [], preamble: [] };

  let section: any = null;
  let requirement: any = null;
  let scenario: any = null;
  let traceBuffer: string[] = null;

  const closeScenario = () => {
    scenario = null;
  };
  const closeRequirement = () => {
    closeScenario();
    requirement = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // A multi-line `<!-- csda:trace ... -->` comment attaches to the requirement
    // it sits under, wherever inside it appears.
    if (traceBuffer !== null) {
      traceBuffer.push(line);
      if (/-->/.test(line)) {
        const parsed = parseTraceComment(traceBuffer.join("\n"));
        if (requirement) requirement.trace = { ...requirement.trace, ...parsed };
        traceBuffer = null;
      }
      continue;
    }
    if (RE_TRACE_OPEN.test(line)) {
      if (/-->/.test(line)) {
        const parsed = parseTraceComment(line);
        if (requirement) requirement.trace = { ...requirement.trace, ...parsed };
      } else {
        traceBuffer = [line];
      }
      continue;
    }

    let m;

    if ((m = RE_H1.exec(line)) !== null) {
      if (doc.title === null) doc.title = m[1];
      closeRequirement();
      section = null;
      continue;
    }

    if ((m = RE_H2.exec(line)) !== null) {
      closeRequirement();
      section = {
        heading: m[1],
        line: lineNo,
        body: [],
        requirements: [],
      };
      doc.sections.push(section);
      continue;
    }

    if ((m = RE_REQUIREMENT.exec(line)) !== null) {
      closeRequirement();
      const { id, name } = splitLabel(m[1]);
      requirement = {
        id,
        name,
        heading: m[1],
        line: lineNo,
        text: [],
        scenarios: [],
        trace: {},
      };
      if (!section) {
        // A requirement before any `##` heading still belongs somewhere.
        section = { heading: null, line: lineNo, body: [], requirements: [] };
        doc.sections.push(section);
      }
      section.requirements.push(requirement);
      continue;
    }

    if ((m = RE_SCENARIO.exec(line)) !== null) {
      const { id, name } = splitLabel(m[1]);
      scenario = { id, name, heading: m[1], line: lineNo, steps: [] };
      if (requirement) requirement.scenarios.push(scenario);
      continue;
    }

    if (scenario) {
      const step = RE_STEP.exec(line);
      if (step) {
        scenario.steps.push(step[1].trim());
        continue;
      }
      if (line.trim() === "") continue;
      // Non-list prose after a scenario ends the scenario but stays with the
      // requirement body, so nothing is silently dropped.
      closeScenario();
      if (requirement) requirement.text.push(line);
      continue;
    }

    if (requirement) {
      requirement.text.push(line);
      continue;
    }
    if (section) {
      section.body.push(line);
      continue;
    }
    doc.preamble.push(line);
  }

  // Normalise the collected free text: trim leading/trailing blank lines.
  const trimBlock = (arr) => {
    const out = arr.slice();
    while (out.length && out[0].trim() === "") out.shift();
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    return out.join("\n");
  };

  for (const s of doc.sections) {
    s.body = trimBlock(s.body);
    for (const r of s.requirements) {
      r.text = trimBlock(r.text);
      r.key = requirementKey(r);
    }
  }
  doc.preamble = trimBlock(doc.preamble);

  return doc;
}

function findSection(doc, name) {
  const wanted = String(name).toLowerCase();
  return doc.sections.find((s) => s.heading && s.heading.toLowerCase() === wanted) || null;
}

/**
 * A capability spec: a Purpose plus a flat list of requirements. Requirements
 * are collected from every section so a hand-written spec that omits the
 * `## Requirements` heading still parses.
 */
function parseSpec(source) {
  const doc = parseMarkdown(source);
  const purposeSection = findSection(doc, "Purpose");
  const requirements = [];
  for (const s of doc.sections) {
    for (const r of s.requirements) requirements.push(r);
  }
  return {
    title: doc.title,
    purpose: purposeSection ? purposeSection.body : "",
    requirements,
    sections: doc.sections,
  };
}

const DELTA_SECTIONS = {
  "added requirements": "added",
  "modified requirements": "modified",
  "removed requirements": "removed",
  "renamed requirements": "renamed",
};

/**
 * A delta spec: what this change adds, modifies or removes, relative to the
 * capability's current spec.
 *
 * `unknownSections` is not an error here — `validateDelta` decides what to do
 * with it, so the parser stays a pure reader.
 */
function parseDelta(source) {
  const doc = parseMarkdown(source);
  const delta: any = {
    title: doc.title,
    purpose: "",
    added: [],
    modified: [],
    removed: [],
    renamed: [],
    unknownSections: [],
    sections: doc.sections,
  };

  for (const s of doc.sections) {
    const heading = String(s.heading || "").toLowerCase();
    if (heading === "purpose") {
      delta.purpose = s.body;
      continue;
    }
    const bucket = DELTA_SECTIONS[heading];
    if (!bucket) {
      if (s.requirements.length > 0 || s.heading) {
        delta.unknownSections.push({ heading: s.heading, line: s.line });
      }
      continue;
    }
    for (const r of s.requirements) {
      r.op = bucket;
      delta[bucket].push(r);
    }
  }

  return delta;
}

// ── Serialisation ─────────────────────────────────────────────────────────────
// `archive` rewrites a spec after applying a delta. Rendering goes through the
// same shapes the parser produces, so parse → render → parse is a fixed point.

function renderTrace(trace) {
  const keys = Object.keys(trace || {}).sort();
  if (keys.length === 0) return null;
  const parts = keys.map((k) => {
    const v = String(trace[k]);
    return /\s/.test(v) ? `${k}="${v}"` : `${k}=${v}`;
  });
  return `<!-- csda:trace ${parts.join(" ")} -->`;
}

function renderRequirement(req) {
  const out = [];
  out.push(`### Requirement: ${req.heading || req.name}`);
  out.push("");
  if (req.text && req.text.trim() !== "") {
    out.push(req.text.trim());
    out.push("");
  }
  for (const sc of req.scenarios || []) {
    out.push(`#### Scenario: ${sc.heading || sc.name}`);
    out.push("");
    for (const step of sc.steps || []) out.push(`- ${step}`);
    out.push("");
  }
  const trace = renderTrace(req.trace);
  if (trace) {
    out.push(trace);
    out.push("");
  }
  // Collapse the trailing blank so the caller controls spacing.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function renderSpec(spec) {
  const out = [];
  out.push(`# ${spec.title || "Specification"}`);
  out.push("");
  if (spec.purpose && spec.purpose.trim() !== "") {
    out.push("## Purpose");
    out.push("");
    out.push(spec.purpose.trim());
    out.push("");
  }
  out.push("## Requirements");
  out.push("");
  for (const req of spec.requirements || []) {
    out.push(renderRequirement(req));
    out.push("");
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

module.exports = {
  parseMarkdown,
  parseSpec,
  parseDelta,
  findSection,
  renderSpec,
  renderRequirement,
  requirementKey,
  slug,
  splitLabel,
  parseTraceComment,
  DELTA_SECTIONS,
  REQ_ID,
  SCN_ID,
};
