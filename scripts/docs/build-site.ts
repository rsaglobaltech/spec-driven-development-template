#!/usr/bin/env node

/**
 * Render `docs/**.md` into a documentation site.
 *
 * ## Why this exists
 *
 * The site published twenty markdown documents as `text/markdown`, so a reader
 * who followed a link got the source — comment markers, front-matter, the lot.
 * The landing page linked to four of them. The other sixteen existed and were
 * unreachable.
 *
 * ## Why it renders at build time
 *
 * A page that needs JavaScript to show its own text is a page that is slower,
 * unindexable and broken behind a corporate proxy that strips scripts. These
 * are plain HTML documents; the JavaScript that ships alongside adds search,
 * copy buttons and a theme toggle, and the site reads fine without it.
 *
 * `marked` is a devDependency, so none of this reaches the published package —
 * `package.json` still has zero runtime dependencies, which is what lets the
 * CLI run through `npx` on someone else's machine.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { marked } from "marked";

import { NAV, navEntry, neighbours } from "./nav";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DOCS = path.join(ROOT, "docs");
const REPO = "https://github.com/rsaglobaltech/spec-driven-development-template";

/** Assets copied through untouched. */
// `roi.html` used to be here. A calculator that estimates a saving is a sales
// artefact, not documentation, and it was the only page on the site written in
// a different voice.
const VERBATIM = ["styles.css", "app.js", "index.html", "assets"];

interface Page {
  /** `harness`, `case-studies/case-1` — the path without extension. */
  slug: string;
  title: string;
  html: string;
  headings: Array<{ id: string; text: string; level: number }>;
  /** Plain text, for the search index. */
  text: string;
}

// ── Markdown → HTML ──────────────────────────────────────────────────────────

/** `The harness` → `the-harness`. Stable, because anchors end up in links. */
function slugifyHeading(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rewrite a link the way the site serves it.
 *
 * `./harness.md` becomes `harness.html`, because that is what is published.
 * Leaving them pointing at `.md` was half of why the old site was unreadable:
 * every internal link dropped the reader back into raw source.
 */
function rewriteLink(href: string, slug: string): string {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("//")) return href;
  const [target, hash] = href.split("#");
  if (!target) return href;

  // A link that climbs out of `docs/` points at a repository file — README,
  // CONTRIBUTING, a pack's yaml — which is not published here. Sending it to
  // GitHub is the honest destination; rewriting `../SECURITY.md` to
  // `../SECURITY.html` invented a page that has never existed.
  const depth = slug.split("/").length - 1;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(slug), target));
  if (resolved.startsWith("..")) {
    const inRepo = path.posix.normalize(path.posix.join("docs", path.posix.dirname(slug), target));
    return `${REPO}/blob/main/${inRepo}${hash ? `#${hash}` : ""}`;
  }
  void depth;

  if (!target.endsWith(".md")) return href;
  const html = `${target.slice(0, -3)}.html`;
  return hash ? `${html}#${hash}` : html;
}

/**
 * A heading's plain text, for the anchor id and the contents list.
 *
 * Repeated until it stops changing: one pass of `/<[^>]+>/g` leaves a nested or
 * malformed tag behind — `<<b>i>` becomes `<i>` — which CodeQL reports as
 * `js/incomplete-multi-character-sanitization`. Nothing here reaches a browser
 * as markup, but a half-stripped heading would still produce a wrong anchor.
 */
function stripTags(html: string): string {
  let out = String(html);
  let previous;
  do {
    previous = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== previous);
  return out.trim();
}

function renderMarkdown(
  source: string,
  currentSlug: string
): Pick<Page, "html" | "headings" | "title"> {
  const headings: Page["headings"] = [];
  const taken = new Set<string>();
  let title = "";

  const renderer = new marked.Renderer();

  renderer.heading = ({ tokens, depth }: any) => {
    const text = renderer.parser.parseInline(tokens);
    const plain = stripTags(text);
    if (depth === 1 && !title) title = plain;
    const id = slugifyHeading(plain, taken);
    if (depth >= 2 && depth <= 3) headings.push({ id, text: plain, level: depth });
    return (
      `<h${depth} id="${id}">${text}` +
      `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`
    );
  };

  renderer.link = ({ href, title: linkTitle, tokens }: any) => {
    const text = renderer.parser.parseInline(tokens);
    const target = rewriteLink(String(href || ""), currentSlug);
    const external = /^https?:/i.test(target);
    const attrs = [
      `href="${escapeHtml(target)}"`,
      linkTitle ? `title="${escapeHtml(linkTitle)}"` : "",
      external ? 'target="_blank" rel="noreferrer"' : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<a ${attrs}>${text}</a>`;
  };

  renderer.code = ({ text, lang }: any) => {
    const language = String(lang || "").split(/\s+/)[0] || "text";
    return (
      `<figure class="code" data-lang="${escapeHtml(language)}">` +
      `<button class="code__copy" type="button" aria-label="Copy to clipboard">Copy</button>` +
      `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>` +
      `</figure>\n`
    );
  };

  renderer.table = ({ header, rows }: any) => {
    const head = header
      .map((cell: any) => `<th>${renderer.parser.parseInline(cell.tokens)}</th>`)
      .join("");
    const body = rows
      .map(
        (row: any) =>
          `<tr>${row
            .map((cell: any) => `<td>${renderer.parser.parseInline(cell.tokens)}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
  };

  const html = marked.parse(source, { renderer, gfm: true, breaks: false }) as string;
  return { html, headings, title };
}

// ── The page shell ───────────────────────────────────────────────────────────

function sidebar(currentSlug: string): string {
  const sections = NAV.map((section) => {
    const items = section.entries
      .map((entry) => {
        const active = entry.slug === currentSlug ? ' class="is-active" aria-current="page"' : "";
        return `<li><a href="${entry.slug}.html"${active}>${escapeHtml(entry.label)}</a></li>`;
      })
      .join("");
    return `<div class="side__group"><h2>${escapeHtml(section.title)}</h2><ul>${items}</ul></div>`;
  }).join("");
  return sections;
}

function onThisPage(headings: Page["headings"]): string {
  if (headings.length < 2) return "";
  const items = headings
    .map((h) => `<li class="toc__l${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join("");
  return `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ul>${items}</ul></nav>`;
}

function pageShell(page: Page, version: string): string {
  const entry = navEntry(page.slug);
  const { prev, next } = neighbours(page.slug);
  const depth = page.slug.split("/").length - 1;
  const up = "../".repeat(depth);
  const link = (slug: string) => `${up}${slug}.html`;

  const pager = [
    prev
      ? `<a class="pager__prev" href="${link(prev.slug)}"><span>Previous</span>${escapeHtml(prev.label)}</a>`
      : "<span></span>",
    next
      ? `<a class="pager__next" href="${link(next.slug)}"><span>Next</span>${escapeHtml(next.label)}</a>`
      : "<span></span>",
  ].join("");

  return `<!doctype html>
<html lang="en" data-slug="${escapeHtml(page.slug)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} — create-spec-driven-app</title>
<meta name="description" content="${escapeHtml(entry?.blurb || page.title)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}assets/docs.css">
<script>
  // Applied before paint so the page never flashes the wrong theme.
  (function () {
    var t = localStorage.getItem("csda-theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  })();
</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>

<header class="top">
  <button class="top__menu" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>
  <a class="top__brand" href="${up}index.html"><span aria-hidden="true">⬡</span> create-spec-driven-app</a>
  <span class="top__version">v${escapeHtml(version)}</span>
  <div class="top__search">
    <input type="search" id="search" placeholder="Search the docs…" autocomplete="off"
           aria-label="Search documentation">
    <div class="top__results" id="results" hidden></div>
  </div>
  <nav class="top__links">
    <a href="${up}packs/">Packs</a>
    <a href="${REPO}" target="_blank" rel="noreferrer">GitHub</a>
    <a href="https://www.npmjs.com/package/create-spec-driven-app" target="_blank" rel="noreferrer">npm</a>
  </nav>
  <button class="top__theme" type="button" aria-label="Switch theme">◐</button>
</header>

<div class="shell">
  <aside class="side" id="side">${sidebar(page.slug)}</aside>

  <main class="content" id="content">
    <article class="prose">
${page.html}
    </article>
    <nav class="pager" aria-label="Neighbouring pages">${pager}</nav>
    <footer class="page-foot">
      <a href="${REPO}/edit/main/docs/${escapeHtml(page.slug)}.md" target="_blank" rel="noreferrer">Edit this page</a>
      <span>·</span>
      <a href="${REPO}/issues/new" target="_blank" rel="noreferrer">Something wrong? Open an issue</a>
    </footer>
  </main>

  ${onThisPage(page.headings)}
</div>

<script src="${up}assets/docs.js" defer></script>
</body>
</html>
`;
}

// ── Walking the source ───────────────────────────────────────────────────────

function markdownFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...markdownFiles(full, rel));
    } else if (entry.name.endsWith(".md")) {
      out.push(rel.slice(0, -3));
    }
  }
  return out.sort();
}

function copyVerbatim(outDir: string): void {
  for (const name of VERBATIM) {
    const from = path.join(DOCS, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(outDir, name), { recursive: true });
  }
}

/**
 * The documentation home — every section, every page, one line each.
 *
 * The site had no such page. `index.html` is the marketing landing, so a reader
 * who wanted the documentation had nowhere to land and no way to see what
 * existed. Generated rather than hand-written, so a page added to `NAV` appears
 * here without anybody remembering to add it twice.
 */
function docsHome(version: string): string {
  const cards = NAV.map((section) => {
    const items = section.entries
      .map(
        (entry) =>
          `<li><a href="${entry.slug}.html"><strong>${escapeHtml(entry.label)}</strong>` +
          `<span>${escapeHtml(entry.blurb)}</span></a></li>`
      )
      .join("");
    return (
      `<section class="home__group">` +
      `<h2>${escapeHtml(section.title)}</h2>` +
      `<p class="home__summary">${escapeHtml(section.summary)}</p>` +
      `<ul class="home__list">${items}</ul></section>`
    );
  }).join("");

  const page: Page = {
    slug: "docs",
    title: "Documentation",
    headings: [],
    text: "",
    html:
      `<h1>Documentation</h1>` +
      `<p class="home__lede">Specifications that are checked, not admired. Start with ` +
      `<a href="getting-started.html">Getting started</a> if the folder is empty, or ` +
      `<a href="quickstart.html">You cloned a repo</a> if somebody handed you one.</p>` +
      `<figure class="code" data-lang="bash">` +
      `<button class="code__copy" type="button" aria-label="Copy to clipboard">Copy</button>` +
      `<pre><code class="language-bash">npx create-spec-driven-app@latest init</code></pre>` +
      `</figure>` +
      `<div class="home">${cards}</div>`,
  };
  return pageShell(page, version);
}

export function buildSite(outDir: string): { pages: number; orphans: string[] } {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const slugs = markdownFiles(DOCS);
  const index: Array<{ slug: string; title: string; text: string }> = [];

  for (const slug of slugs) {
    const source = fs.readFileSync(path.join(DOCS, `${slug}.md`), "utf8");
    // The marker is ours and means nothing to a reader.
    const cleaned = source.replace(/^<!--\s*csda:allow-placeholders[^>]*-->\s*\n?/gm, "");
    const { html, headings, title } = renderMarkdown(cleaned, slug);

    const page: Page = {
      slug,
      title: title || navEntry(slug)?.label || slug,
      html,
      headings,
      text: cleaned
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[#*`>|_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500),
    };

    const target = path.join(outDir, `${slug}.html`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, pageShell(page, version), "utf8");
    index.push({ slug, title: page.title, text: page.text });
  }

  fs.writeFileSync(path.join(outDir, "docs.html"), docsHome(version), "utf8");

  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "assets", "search-index.json"), JSON.stringify(index), "utf8");
  copyVerbatim(outDir);
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");

  const orphans = slugs.filter((slug) => !navEntry(slug) && !slug.includes("/"));
  return { pages: slugs.length, orphans };
}

if (require.main === module) {
  const at = process.argv.indexOf("--out");
  const outDir = at !== -1 ? process.argv[at + 1] : path.join(ROOT, "_site");
  const { pages, orphans } = buildSite(path.resolve(outDir));
  process.stdout.write(`ℹ️  [docs] rendered ${pages} page(s) into ${outDir}\n`);
  if (orphans.length > 0) {
    process.stdout.write(
      `⚠️  [docs] not in the sidebar, so nobody can navigate to them: ${orphans.join(", ")}\n`
    );
  }
}
