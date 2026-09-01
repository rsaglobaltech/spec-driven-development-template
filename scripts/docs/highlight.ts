/**
 * Build-time syntax highlighting.
 *
 * ## Why not a library
 *
 * Prism and Shiki both do this better than 150 lines can. They would also be a
 * new dependency in a repository that ships an SBOM, runs a licence allow-list
 * over it (`npm run licences`) and puts "0 runtime dependencies" on its own
 * landing page. The cost of a highlighter is not the download — it is that
 * every future audit has to account for it.
 *
 * So: a deliberately conservative tokeniser. It knows strings, comments,
 * numbers and a keyword list per language, and nothing else. It will not
 * colour a nested template literal correctly and does not try.
 *
 * ## Why it cannot break a page
 *
 * The scanner only ever *wraps* text it has already escaped, and any input it
 * does not recognise falls through as escaped literal. A language with no rules
 * returns the same escaped source the old renderer produced, so an unknown
 * fence is a plain block rather than a broken one.
 *
 * ## Why build time
 *
 * Highlighting in the browser means shipping a parser to every reader and
 * repainting after first paint. These are static documents; the colours can be
 * baked in and cost nothing at runtime.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Rule {
  readonly cls: string;
  readonly re: string;
}

/** Shared shapes. Order matters: whatever matches first at a position wins. */
const STRING = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\``;
const NUMBER = String.raw`\b\d+(?:\.\d+)?\b`;

function keywords(...words: string[]): string {
  return String.raw`\b(?:${words.join("|")})\b`;
}

const LANGS: Record<string, readonly Rule[]> = {
  bash: [
    { cls: "c", re: String.raw`#[^\n]*` },
    { cls: "s", re: STRING },
    { cls: "v", re: String.raw`\$\{?[A-Za-z_][\w]*\}?` },
    {
      cls: "k",
      re: keywords(
        "if",
        "then",
        "else",
        "fi",
        "for",
        "in",
        "do",
        "done",
        "while",
        "case",
        "esac",
        "function",
        "return",
        "export",
        "local",
        "set",
        "cd",
        "echo",
        "exit"
      ),
    },
    { cls: "f", re: String.raw`(?<=^|\||&&|;|\n)\s*[a-z][\w-]*` },
    // Anchored to whitespace: without it `your-existing-repo` reads as the
    // flag `-existing-repo` and half the word turns blue.
    { cls: "o", re: String.raw`(?<=^|\s)--?[A-Za-z][\w-]*` },
    { cls: "n", re: NUMBER },
  ],
  json: [
    { cls: "a", re: String.raw`"(?:[^"\\]|\\.)*"(?=\s*:)` },
    { cls: "s", re: String.raw`"(?:[^"\\]|\\.)*"` },
    { cls: "k", re: keywords("true", "false", "null") },
    { cls: "n", re: NUMBER },
  ],
  yaml: [
    { cls: "c", re: String.raw`#[^\n]*` },
    { cls: "a", re: String.raw`(?<=^|\n)\s*[-\w.]+(?=\s*:)` },
    { cls: "s", re: STRING },
    { cls: "k", re: keywords("true", "false", "null", "yes", "no", "on", "off") },
    { cls: "n", re: NUMBER },
  ],
  ts: [
    { cls: "c", re: String.raw`//[^\n]*|/\*[\s\S]*?\*/` },
    { cls: "s", re: STRING },
    {
      cls: "k",
      re: keywords(
        "import",
        "export",
        "from",
        "const",
        "let",
        "var",
        "function",
        "return",
        "if",
        "else",
        "for",
        "of",
        "while",
        "class",
        "extends",
        "implements",
        "interface",
        "type",
        "new",
        "await",
        "async",
        "try",
        "catch",
        "finally",
        "throw",
        "typeof",
        "instanceof",
        "readonly",
        "public",
        "private",
        "static",
        "true",
        "false",
        "null",
        "undefined",
        "this"
      ),
    },
    { cls: "n", re: NUMBER },
  ],
  java: [
    { cls: "c", re: String.raw`//[^\n]*|/\*[\s\S]*?\*/` },
    { cls: "s", re: STRING },
    { cls: "an", re: String.raw`@[A-Za-z]\w*` },
    {
      cls: "k",
      re: keywords(
        "package",
        "import",
        "public",
        "private",
        "protected",
        "class",
        "interface",
        "extends",
        "implements",
        "static",
        "final",
        "void",
        "new",
        "return",
        "if",
        "else",
        "for",
        "while",
        "try",
        "catch",
        "throws",
        "record",
        "var",
        "true",
        "false",
        "null"
      ),
    },
    { cls: "n", re: NUMBER },
  ],
  xml: [
    { cls: "c", re: String.raw`<!--[\s\S]*?-->` },
    { cls: "s", re: String.raw`"(?:[^"\\]|\\.)*"` },
    { cls: "t", re: String.raw`</?[A-Za-z][\w:.-]*|/?>` },
  ],
  gherkin: [
    { cls: "c", re: String.raw`#[^\n]*` },
    {
      cls: "k",
      re: String.raw`(?<=^|\n)\s*(?:Feature|Background|Scenario Outline|Scenario|Examples|Rule)(?=:)`,
    },
    { cls: "g", re: String.raw`(?<=^|\n)\s*(?:Given|When|Then|And|But)\b` },
    { cls: "an", re: String.raw`@[\w-]+` },
    { cls: "s", re: String.raw`<[^>\n]+>` },
  ],
  groovy: [
    { cls: "c", re: String.raw`//[^\n]*|/\*[\s\S]*?\*/` },
    { cls: "s", re: STRING },
    {
      cls: "k",
      re: keywords(
        "pipeline",
        "agent",
        "stages",
        "stage",
        "steps",
        "sh",
        "def",
        "if",
        "else",
        "return",
        "docker",
        "image",
        "any",
        "true",
        "false",
        "null"
      ),
    },
    { cls: "n", re: NUMBER },
  ],
};

/** Fences whose language is really another one. */
const ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  console: "bash",
  javascript: "ts",
  js: "ts",
  typescript: "ts",
  jsonc: "json",
  yml: "yaml",
  html: "xml",
  svg: "xml",
  feature: "gherkin",
  kotlin: "java",
  kts: "java",
  groovy: "groovy",
  jenkinsfile: "groovy",
};

const compiled = new Map<string, RegExp>();

function scanner(lang: string): RegExp | null {
  if (compiled.has(lang)) return compiled.get(lang)!;
  const rules = LANGS[lang];
  if (!rules) return null;
  // One alternation, groups in rule order, so priority is positional.
  const re = new RegExp(rules.map((r) => `(${r.re})`).join("|"), "gm");
  compiled.set(lang, re);
  return re;
}

/**
 * Escaped HTML for one code block, with `<span class="tok tok--X">` wrappers.
 *
 * Returns plain escaped text when the language is unknown, which is the same
 * output the site produced before highlighting existed.
 */
export function highlight(code: string, language: string): string {
  const lang = ALIASES[language.toLowerCase()] || language.toLowerCase();
  const rules = LANGS[lang];
  const re = scanner(lang);
  if (!rules || !re) return escapeHtml(code);

  let out = "";
  let last = 0;
  re.lastIndex = 0;

  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    // A zero-width match would spin forever; step past it.
    if (m[0] === "") {
      re.lastIndex += 1;
      continue;
    }
    out += escapeHtml(code.slice(last, m.index));
    const which = m.slice(1).findIndex((g) => g !== undefined);
    const cls = which === -1 ? "" : rules[which].cls;
    out += cls ? `<span class="tok tok--${cls}">${escapeHtml(m[0])}</span>` : escapeHtml(m[0]);
    last = m.index + m[0].length;
  }

  return out + escapeHtml(code.slice(last));
}

/** Languages that actually get colour, for the tests and for documentation. */
export const HIGHLIGHTED = Object.keys(LANGS);
