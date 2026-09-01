"use strict";

/**
 * The build-time highlighter.
 *
 * The rules a hand-written tokeniser must not break, in order of how badly they
 * would fail: it must never emit unescaped input, it must never lose
 * characters, and it must degrade to plain escaped text for anything it does
 * not know. Colour is the least important property here.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { highlight, escapeHtml, HIGHLIGHTED } = require("../../scripts/docs/highlight");

/** The tokens stripped back out, to compare against the input. */
const textOf = (html: string) =>
  html
    .replace(/<span class="tok tok--[a-z]+">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

test("nothing is lost: the visible text survives highlighting", () => {
  const samples: Array<[string, string]> = [
    ["bash", 'npx specgate validate . --strict-tdd # the gate\necho "done"'],
    ["json", '{ "schema_version": "1.2.0", "strict": true, "count": 3 }'],
    ["yaml", "# a comment\nprojects:\n  - path: svc-billing\n    strict: true"],
    ["ts", 'import { x } from "./y";\n// note\nconst n = 42;'],
    ["xml", "<plugin><artifactId>specgate</artifactId></plugin>"],
    ["gherkin", "@smoke\nFeature: Login\n  Given a user\n  Then it works"],
  ];
  for (const [lang, source] of samples) {
    assert.equal(textOf(highlight(source, lang)), source, `${lang} lost or changed text`);
  }
});

test("input is always escaped, tokenised or not", () => {
  // The angle brackets may land in different spans — `xml` colours the tag name
  // and the closing bracket separately — so the check is that no raw markup
  // survives and the text round-trips, not that the entities sit side by side.
  const nasty = '<script>alert("x" & 1)</script>';
  for (const lang of [...HIGHLIGHTED, "unknown-language"]) {
    const out = highlight(nasty, lang);
    assert.doesNotMatch(out, /<script/, `${lang}: raw markup survived`);
    assert.doesNotMatch(out, /<\/script/, `${lang}: raw closing tag survived`);
    assert.match(out, /&lt;/, `${lang}: nothing was escaped`);
    assert.equal(textOf(out), nasty, `${lang}: text changed`);
  }
});

test("an unknown language degrades to plain escaped text", () => {
  const source = "a < b && c > d";
  assert.equal(highlight(source, "brainfuck"), escapeHtml(source));
  assert.doesNotMatch(highlight(source, "brainfuck"), /<span/);
});

test("aliases resolve to the language they mean", () => {
  assert.equal(highlight('echo "hi"', "sh"), highlight('echo "hi"', "bash"));
  assert.equal(highlight("const a = 1;", "js"), highlight("const a = 1;", "ts"));
});

test("a flag is coloured but a hyphenated word is not", () => {
  // `your-existing-repo` read as the flag `-existing-repo` and half the word
  // turned blue; the rule is anchored to whitespace now.
  const html = highlight("cd your-existing-repo --force", "bash");
  assert.match(html, /tok--o">--force</, "the real flag lost its colour");
  assert.doesNotMatch(html, /tok--o">-existing/, "a word was split into a flag");
});

test("comments and strings win over keywords inside them", () => {
  const html = highlight("# export is a keyword\nexport A=1", "bash");
  const comment = /<span class="tok tok--c">([^<]*)<\/span>/.exec(html);
  assert.ok(comment && comment[1].includes("export"), "the comment was carved up");
});

test("an empty block is not an infinite loop", () => {
  for (const lang of HIGHLIGHTED) assert.equal(highlight("", lang), "");
});

test("every highlighted language has a token class with a colour", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = require("node:path")
    .resolve(__dirname)
    .split(/[\\/]tests(?:[\\/]|$)/)[0]
    .replace(/[\\/]dist$/, "");
  const css = fs.readFileSync(path.join(root, "docs", "assets", "docs.css"), "utf8");

  const used = new Set<string>();
  const sample = 'a "b" # c\n1 --d @e <f> Given x';
  for (const lang of HIGHLIGHTED) {
    for (const m of highlight(sample, lang).matchAll(/tok--([a-z]+)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 0, "the sample produced no tokens at all");
  for (const cls of used) {
    assert.match(css, new RegExp(`\\.tok--${cls}\\b`), `no colour defined for .tok--${cls}`);
  }
});
