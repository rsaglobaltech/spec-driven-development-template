"use strict";

/**
 * The documentation site, checked the way the gate checks everything else.
 *
 * ## Why this file exists
 *
 * `https://rsaglobaltech.github.io/spec-driven-development-template/` returned
 * 404 for months: the workflow deployed to `gh-pages` on every push and nobody
 * had ever switched Pages on. Underneath that, the site published twenty
 * markdown documents as `text/markdown`, so a reader who followed a link got
 * the source — and the landing page linked to four of them, leaving sixteen
 * unreachable.
 *
 * None of it was detectable from the repository, because nothing looked. These
 * tests look.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const DOCS = path.join(ROOT, "docs");

const { buildSite } = require("../../scripts/docs/build-site");
const { NAV, navEntry, navSlugs, neighbours } = require("../../scripts/docs/nav");

/** Build the site once; every test reads the same output. */
function site() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-site-"));
  const result = buildSite(dir);
  return { dir, ...result };
}

// ── Navigation ───────────────────────────────────────────────────────────────

test("every shipped document is reachable from the sidebar", () => {
  // A page nobody can navigate to is a page nobody reads. Sixteen were in that
  // state before this test existed.
  const shipped = fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();

  const orphans = shipped.filter((slug) => !navEntry(slug));
  assert.deepEqual(
    orphans,
    [],
    `These documents are published and unreachable. Add them to scripts/docs/nav.ts:\n  ${orphans.join("\n  ")}`
  );
});

test("the sidebar does not promise a page that is not there", () => {
  const missing = navSlugs().filter((slug) => !fs.existsSync(path.join(DOCS, `${slug}.md`)));
  assert.deepEqual(
    missing,
    [],
    `nav.ts links to documents that do not exist: ${missing.join(", ")}`
  );
});

test("every navigation entry carries a label and a blurb", () => {
  // The blurb is what the documentation home shows under each link. An entry
  // without one renders a card that says nothing.
  for (const section of NAV) {
    assert.ok(section.title.trim(), "a section with no title");
    assert.ok(section.summary.trim(), `${section.title}: no summary`);
    for (const entry of section.entries) {
      assert.ok(entry.label.trim(), `${entry.slug}: no label`);
      assert.ok(entry.blurb.trim(), `${entry.slug}: no blurb`);
    }
  }
});

test("reading order has no gaps at either end", () => {
  const slugs = navSlugs();
  assert.equal(neighbours(slugs[0]).prev, null);
  assert.equal(neighbours(slugs[slugs.length - 1]).next, null);
  assert.equal(neighbours(slugs[1]).prev.slug, slugs[0]);
});

// ── Rendering ────────────────────────────────────────────────────────────────

test("every document renders to HTML, not to markdown source", () => {
  const { dir, pages } = site();
  try {
    assert.ok(pages >= 20, `expected the shipped corpus, rendered ${pages}`);

    const harness = fs.readFileSync(path.join(dir, "harness.html"), "utf8");
    assert.match(harness, /<h1 id="[^"]+">/, "no rendered heading");
    assert.match(harness, /<figure class="code"/, "no rendered code block");
    assert.doesNotMatch(
      harness,
      /^# The harness$/m,
      "raw markdown reached the page — this is exactly what the old site served"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("internal links point at pages the site publishes", () => {
  // `[the harness](./harness.md)` has to become `harness.html`. Left alone, every
  // internal link dropped the reader back into raw source.
  const { dir } = site();
  try {
    const html = fs.readFileSync(path.join(dir, "getting-started.html"), "utf8");
    const links = [...html.matchAll(/href="([^"#:][^":]*)"/g)].map((m) => m[1]);
    const local = links.filter((h) => !/^https?:/.test(h) && !h.startsWith("#"));

    const broken = local
      .map((h) => h.split("#")[0])
      .filter(Boolean)
      .filter((h) => !h.endsWith("/"))
      .filter((h) => !fs.existsSync(path.join(dir, h)));

    assert.deepEqual(broken, [], `links to nothing: ${broken.join(", ")}`);
    assert.ok(!local.some((h) => h.endsWith(".md")), "an internal link still points at a .md file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a link that climbs out of docs/ goes to GitHub, not to a page that never existed", () => {
  // `../SECURITY.md` is a repository file. Rewriting it to `../SECURITY.html`
  // invented a page; sending it to GitHub is the honest destination.
  const { dir } = site();
  try {
    const html = fs.readFileSync(path.join(dir, "supply-chain.html"), "utf8");
    assert.match(html, /href="https:\/\/github\.com\/[^"]+\/blob\/main\/SECURITY\.md/);
    assert.doesNotMatch(html, /href="\.\.\/SECURITY\.html"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every page carries the shell: sidebar, search and a way back", () => {
  const { dir } = site();
  try {
    for (const slug of ["harness", "commands", "tutorial"]) {
      const html = fs.readFileSync(path.join(dir, `${slug}.html`), "utf8");
      assert.match(html, /<aside class="side"/, `${slug}: no sidebar`);
      assert.match(html, /id="search"/, `${slug}: no search`);
      assert.match(html, /class="top__brand"/, `${slug}: no way back to the home page`);
      assert.match(html, /Edit this page/, `${slug}: no edit link`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the documentation home lists every section and every page", () => {
  const { dir } = site();
  try {
    const html = fs.readFileSync(path.join(dir, "docs.html"), "utf8");
    for (const section of NAV) {
      assert.ok(html.includes(section.title), `docs home is missing "${section.title}"`);
      for (const entry of section.entries) {
        assert.ok(
          html.includes(`href="${entry.slug}.html"`),
          `docs home does not link to ${entry.slug}`
        );
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the search index covers what the sidebar offers", () => {
  const { dir } = site();
  try {
    const index = JSON.parse(fs.readFileSync(path.join(dir, "assets/search-index.json"), "utf8"));
    const indexed = new Set(index.map((e) => e.slug));
    const missing = navSlugs().filter((slug) => !indexed.has(slug));
    assert.deepEqual(missing, [], `not searchable: ${missing.join(", ")}`);
    assert.ok(
      index.every((e) => e.title && e.text !== undefined),
      "a search entry with no title"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the assets the pages ask for are published", () => {
  const { dir } = site();
  try {
    for (const asset of ["assets/docs.css", "assets/docs.js", "assets/home.css", "index.html"]) {
      assert.ok(fs.existsSync(path.join(dir, asset)), `missing ${asset}`);
    }
    // Jekyll would eat the assets directory and any file starting with an
    // underscore; GitHub Pages needs telling.
    assert.ok(fs.existsSync(path.join(dir, ".nojekyll")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── The landing page ─────────────────────────────────────────────────────────

test("the landing page states the version this repository is on", () => {
  // It said v0.1.0-beta.3 and "178 Tests Passing" while the repository was on
  // 0.7.0. A number nobody updates is worse than no number.
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
  assert.ok(
    html.includes(`v${version}`),
    `the landing page does not mention v${version} — update docs/index.html when cutting a release`
  );
});

test("the landing page routes to the documentation", () => {
  // It linked to four documents out of twenty and had no route to the rest.
  const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
  for (const target of ["./docs.html", "./getting-started.html", "./harness.html"]) {
    assert.ok(html.includes(`href="${target}"`), `the landing page does not link to ${target}`);
  }
});

test("the landing page counts what the repository actually has", () => {
  // Every figure on that page is checkable, so it is checked.
  const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
  // Count what a pack is: a directory carrying a pack.yaml.
  const packsRoot = path.join(ROOT, "packs");
  const packs = fs
    .readdirSync(packsRoot)
    .filter((domain) => fs.statSync(path.join(packsRoot, domain)).isDirectory())
    .flatMap((domain) =>
      fs
        .readdirSync(path.join(packsRoot, domain))
        .filter((type) => fs.existsSync(path.join(packsRoot, domain, type, "pack.yaml")))
    ).length;
  assert.ok(packs >= 10, `expected the curated packs, counted ${packs}`);

  const { SURFACE } = require("../../scripts/lib/surface");
  assert.ok(html.includes(`<dt>${SURFACE.length}</dt>`), `command count is not ${SURFACE.length}`);
  assert.ok(html.includes(`<dt>${packs}</dt>`), `pack count is not ${packs}`);
  assert.ok(html.includes("<dt>0</dt>"), "the zero-runtime-dependencies claim is missing");
});
