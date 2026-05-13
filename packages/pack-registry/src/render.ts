"use strict";

/**
 * Pure module — renders pack metadata to HTML strings.
 * No fs or DOM dependency.
 */

function escape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_COLORS = {
  pass: "#36b37e",
  warn: "#ffab00",
  fail: "#ff5630",
};

function renderBadge(status) {
  const color = STATUS_COLORS[status] || "#9aa0a6";
  const label = status === "pass" ? "verified" : status;
  return `<span class="badge" style="background:${color}">${escape(label)}</span>`;
}

function renderCard(pack) {
  return `
<article class="card">
  <header class="card-head">
    <h2>${escape(pack.name)}</h2>
    ${renderBadge(pack.lintStatus)}
  </header>
  <p class="meta">
    <code>${escape(pack.id)}</code> · v${escape(pack.version)} ·
    ${escape(pack.project_type)} · ${escape(pack.language)}
  </p>
  <ul class="counts">
    <li><strong>${pack.requirements}</strong> requirements</li>
    <li><strong>${pack.useCases}</strong> use cases</li>
    <li><strong>${pack.aggregates}</strong> aggregates</li>
    <li><strong>${pack.events}</strong> events</li>
    <li><strong>${pack.scenarios}</strong> scenarios</li>
  </ul>
  <pre class="cmd">npx create-spec-driven-app expand --pack-root ./packs --pack ${escape(pack.id)} \\
  --project-dir ./my-project --var PROJECT_NAME="My App" --var PROJECT_SLUG=my-app --var DOMAIN="my domain"</pre>
  ${pack.lintMessages.length > 0 ? `<details><summary>${pack.lintMessages.length} lint message(s)</summary><ul>${pack.lintMessages.map((m) => `<li>${escape(m)}</li>`).join("")}</ul></details>` : ""}
</article>`;
}

function renderIndex(packs, options: any = {}) {
  const title = options.title || "Spec-Driven Pack Registry";
  const generated = options.generated || new Date().toISOString();
  const passed = packs.filter((p) => p.lintStatus === "pass").length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<style>
  :root {
    --bg: #0e1116; --fg: #e4e6eb; --muted: #9aa0a6;
    --accent: #4f9eff; --card: #161b22; --border: #30363d;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--fg); margin: 0; padding: 2rem 1rem; line-height: 1.5;
  }
  .container { max-width: 1080px; margin: 0 auto; }
  h1 {
    font-size: 2rem; margin: 0 0 0.5rem 0;
    background: linear-gradient(90deg, var(--accent), #36b37e);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .summary { color: var(--muted); margin-bottom: 2rem; }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 1.5rem;
  }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;
  }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .card h2 { margin: 0; font-size: 1.1rem; color: var(--accent); }
  .badge {
    display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
    color: #0a0a0a; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .meta { font-size: 0.85rem; color: var(--muted); margin: 0.5rem 0 1rem 0; }
  .meta code { background: var(--bg); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
  .counts { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 0; margin: 0 0 1rem 0; list-style: none; }
  .counts li { font-size: 0.85rem; color: var(--muted); }
  .counts strong { color: var(--fg); }
  .cmd {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.75rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all;
  }
  details { margin-top: 0.75rem; font-size: 0.85rem; color: var(--muted); }
  summary { cursor: pointer; }
  .footer { margin-top: 3rem; color: var(--muted); font-size: 0.85rem; text-align: center; }
  a { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <h1>${escape(title)}</h1>
  <p class="summary">
    ${packs.length} pack(s) · ${passed} verified ·
    generated ${escape(generated)}
  </p>
  <div class="grid">
${packs.map(renderCard).join("\n")}
  </div>
  <div class="footer">
    <p>Powered by <a href="https://github.com/rsaglobaltech/spec-driven-development-template"><code>create-spec-driven-app</code></a></p>
    <p>Submit a pack: open a PR adding <code>packs/&lt;domain&gt;/&lt;type&gt;/pack.yaml</code></p>
  </div>
</div>
</body>
</html>`;
}

module.exports = { renderIndex, renderCard, escape };
