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

const DOMAIN_META = {
  "auth":          { icon: "🔐", tagline: "Authentication, JWT, OAuth2, RBAC & MFA" },
  "billing":       { icon: "💳", tagline: "Subscriptions, invoicing & payment processing" },
  "audit-log":     { icon: "📋", tagline: "Immutable event trail, GDPR-compliant queries" },
  "notifications": { icon: "🔔", tagline: "Email, SMS, push & in-app delivery channels" },
  "feature-flags": { icon: "🚩", tagline: "Gradual rollouts, A/B targeting & kill-switches" },
  "multi-tenant":  { icon: "🏢", tagline: "Tenant isolation, row-level security & onboarding" },
  "file-storage":  { icon: "📁", tagline: "Upload pipeline, CDN delivery & virus scanning" },
  "search":        { icon: "🔍", tagline: "Full-text, facets, elasticsearch/pgvector adapters" },
  "reporting":     { icon: "📊", tagline: "Scheduled reports, export formats & dashboards" },
  "webhooks":      { icon: "🪝", tagline: "Event delivery, retry logic & HMAC signing" },
};

const STATUS_CONFIG = {
  pass: { bg: "#14532d", text: "#4ade80", label: "verified" },
  warn: { bg: "#431407", text: "#fb923c", label: "warnings" },
  fail: { bg: "#450a0a", text: "#f87171", label: "failed" },
};

function renderBadge(status) {
  const cfg = STATUS_CONFIG[status] || { bg: "#1e293b", text: "#94a3b8", label: status };
  return `<span class="badge" style="background:${cfg.bg};color:${cfg.text}">${escape(cfg.label)}</span>`;
}

function renderStat(label, value, color) {
  return `<div class="stat" style="--stat-color:${color}"><span class="stat__val">${escape(String(value))}</span><span class="stat__label">${escape(label)}</span></div>`;
}

function shortName(fullName) {
  return fullName
    .replace(/\s+Backend Domain Pack$/i, "")
    .replace(/\s+Domain Pack$/i, "")
    .trim();
}

function renderCard(pack) {
  const dm = DOMAIN_META[pack.domain] || { icon: "📦", tagline: pack.description || "" };
  const tagline = dm.tagline || pack.description || "";
  const expandCmd = `npx create-spec-driven-app expand \\
  --pack-root ./packs --pack ${escape(pack.id)} \\
  --project-dir ./my-project \\
  --var PROJECT_NAME="My App" \\
  --var PROJECT_SLUG=my-app \\
  --var DOMAIN="${escape(pack.domain)}"`;

  const lintSection = pack.lintMessages.length > 0
    ? `<details class="lint-details"><summary>${pack.lintMessages.length} lint message(s)</summary><ul class="lint-list">${pack.lintMessages.map((m) => `<li>${escape(m)}</li>`).join("")}</ul></details>`
    : "";

  return `
<article class="card" data-name="${escape(shortName(pack.name).toLowerCase())}" data-id="${escape(pack.id.toLowerCase())}">
  <div class="card__head">
    <span class="card__icon">${dm.icon}</span>
    <div class="card__title-block">
      <h2 class="card__name">${escape(shortName(pack.name))}</h2>
      <span class="card__id">${escape(pack.id)}</span>
    </div>
    ${renderBadge(pack.lintStatus)}
  </div>
  <p class="card__tagline">${escape(tagline)}</p>
  <div class="card__stats">
    ${renderStat("req", pack.requirements, "#818cf8")}
    ${renderStat("use cases", pack.useCases, "#34d399")}
    ${renderStat("aggregates", pack.aggregates, "#f472b6")}
    ${renderStat("events", pack.events, "#fb923c")}
    ${renderStat("scenarios", pack.scenarios, "#60a5fa")}
  </div>
  <div class="card__cmd-wrap">
    <pre class="card__cmd" id="cmd-${escape(pack.id.replace("/", "-"))}">${expandCmd}</pre>
    <button class="card__copy" data-target="cmd-${escape(pack.id.replace("/", "-"))}" aria-label="Copy expand command">Copy</button>
  </div>
  <div class="card__foot">
    <span class="card__ver">v${escape(pack.version)}</span>
    <span class="card__lang">${escape(pack.language.toUpperCase())}</span>
    <span class="card__type">${escape(pack.project_type)}</span>
  </div>
  ${lintSection}
</article>`;
}

function renderIndex(packs, options: any = {}) {
  const title = options.title || "Spec-Driven Pack Registry";
  const generated = options.generated || new Date().toISOString();
  const passed = packs.filter((p) => p.lintStatus === "pass").length;
  const totalReqs = packs.reduce((s, p) => s + p.requirements, 0);
  const totalScenarios = packs.reduce((s, p) => s + p.scenarios, 0);

  const cards = packs.map(renderCard).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<meta name="description" content="Browse ${packs.length} curated domain packs for create-spec-driven-app. Each pack ships requirements, use cases, DDD aggregates, events, and Gherkin scenarios.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:      #0b0f17;
    --surface: #111827;
    --card:    #161d2e;
    --border:  #1e2d45;
    --border2: #263552;
    --fg:      #e2e8f0;
    --muted:   #64748b;
    --accent:  #6366f1;
    --accent2: #06b6d4;
    --green:   #10b981;
    --shadow:  0 4px 24px rgba(0,0,0,0.4);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--fg);
    min-height: 100vh;
    line-height: 1.6;
  }

  /* ── Sticky nav ── */
  .topbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(11,15,23,0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 0.7rem 0;
  }
  .topbar__inner {
    max-width: 1180px; margin: 0 auto; padding: 0 1.5rem;
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  }
  .topbar__back {
    color: var(--muted); text-decoration: none; font-size: 0.82rem; font-weight: 600;
    display: flex; align-items: center; gap: 0.35rem;
    transition: color 0.2s; flex-shrink: 0;
  }
  .topbar__back:hover { color: var(--fg); }
  .topbar__title {
    font-weight: 700; font-size: 0.95rem;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    flex-shrink: 0;
  }
  .topbar__search {
    margin-left: auto;
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    min-width: 220px;
  }
  .topbar__search svg { color: var(--muted); flex-shrink: 0; }
  .topbar__search input {
    background: none; border: none; outline: none;
    color: var(--fg); font-family: inherit; font-size: 0.9rem; width: 100%;
  }
  .topbar__search input::placeholder { color: var(--muted); }

  /* ── Hero / stats bar ── */
  .hero {
    background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1));
    border-bottom: 1px solid var(--border);
    padding: 2.5rem 1.5rem 2rem;
  }
  .hero__inner { max-width: 1180px; margin: 0 auto; }
  .hero h1 {
    font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 700; line-height: 1.1;
    background: linear-gradient(90deg, #a5b4fc, var(--accent2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    margin-bottom: 0.4rem;
  }
  .hero__sub { color: var(--muted); font-size: 0.95rem; margin-bottom: 1.5rem; }
  .hero__kpis {
    display: flex; gap: 1.5rem; flex-wrap: wrap;
  }
  .kpi {
    background: var(--card);
    border: 1px solid var(--border2);
    border-radius: 12px;
    padding: 0.7rem 1.2rem;
    display: flex; flex-direction: column; align-items: center;
  }
  .kpi__val { font-size: 1.7rem; font-weight: 700; line-height: 1; }
  .kpi__label { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; text-transform: uppercase; letter-spacing: 0.06em; }

  /* ── Main grid ── */
  .main { max-width: 1180px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
  .grid-header {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    margin-bottom: 1.2rem; flex-wrap: wrap;
  }
  .grid-header h2 { font-size: 1rem; font-weight: 600; color: var(--muted); }
  .count-badge {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.8rem; font-weight: 700;
    color: var(--accent2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.2rem;
  }

  /* ── Pack card ── */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.25rem;
    display: flex; flex-direction: column; gap: 0.75rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: var(--shadow);
  }
  .card:hover { border-color: var(--border2); box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .card.hidden { display: none; }

  .card__head {
    display: flex; align-items: flex-start; gap: 0.8rem;
  }
  .card__icon { font-size: 2rem; line-height: 1; flex-shrink: 0; }
  .card__title-block { flex: 1; min-width: 0; }
  .card__name {
    font-size: 1.05rem; font-weight: 700; color: var(--fg); line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .card__id {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--muted);
    display: block; margin-top: 0.1rem;
  }
  .badge {
    flex-shrink: 0; border-radius: 999px; padding: 0.2rem 0.6rem;
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  }
  .card__tagline { font-size: 0.85rem; color: var(--muted); line-height: 1.5; }

  .card__stats {
    display: flex; gap: 0.6rem; flex-wrap: wrap;
  }
  .stat {
    display: flex; flex-direction: column; align-items: center;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.35rem 0.7rem; min-width: 54px;
  }
  .stat__val {
    font-size: 1.05rem; font-weight: 700; color: var(--stat-color, var(--fg)); line-height: 1;
  }
  .stat__label { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }

  .card__cmd-wrap { position: relative; }
  .card__cmd {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.75rem 0.9rem;
    font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem;
    color: #94a3b8; white-space: pre-wrap; word-break: break-all; line-height: 1.6;
    overflow-x: auto;
  }
  .card__copy {
    position: absolute; top: 0.5rem; right: 0.5rem;
    background: var(--accent); color: #fff; border: none; border-radius: 6px;
    padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight: 700; cursor: pointer;
    transition: background 0.2s; font-family: inherit;
  }
  .card__copy:hover { background: #4f46e5; }
  .card__copy.copied { background: var(--green); }

  .card__foot {
    display: flex; gap: 0.5rem; align-items: center; padding-top: 0.25rem;
    border-top: 1px solid var(--border);
  }
  .card__ver, .card__lang, .card__type {
    font-size: 0.72rem; color: var(--muted);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 6px; padding: 0.12rem 0.45rem;
    font-family: 'IBM Plex Mono', monospace;
  }

  .lint-details { font-size: 0.8rem; color: var(--muted); }
  .lint-details summary { cursor: pointer; }
  .lint-list { padding-left: 1.2rem; margin-top: 0.4rem; }
  .lint-list li { margin-bottom: 0.2rem; }

  /* ── No results ── */
  .no-results {
    display: none; grid-column: 1 / -1; text-align: center;
    padding: 3rem; color: var(--muted); font-size: 1rem;
  }
  .no-results.visible { display: block; }

  /* ── Footer ── */
  .footer {
    border-top: 1px solid var(--border); padding: 2rem 1.5rem;
    text-align: center; color: var(--muted); font-size: 0.82rem;
  }
  .footer a { color: var(--accent2); text-decoration: none; }
  .footer a:hover { text-decoration: underline; }

  @media (max-width: 600px) {
    .topbar__search { min-width: 160px; }
    .hero h1 { font-size: 1.6rem; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<nav class="topbar">
  <div class="topbar__inner">
    <a class="topbar__back" href="../">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
      Docs home
    </a>
    <span class="topbar__title">Pack Registry</span>
    <div class="topbar__search">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input id="search" type="search" placeholder="Search packs…" aria-label="Search packs" autocomplete="off">
    </div>
  </div>
</nav>

<header class="hero">
  <div class="hero__inner">
    <h1>${escape(title)}</h1>
    <p class="hero__sub">
      Curated domain packs for <code style="font-family:'IBM Plex Mono',monospace;font-size:0.85rem;color:#94a3b8">create-spec-driven-app</code> —
      each ships requirements, DDD aggregates, events, and Gherkin scenarios ready to expand into any project.
    </p>
    <div class="hero__kpis">
      <div class="kpi"><span class="kpi__val" style="color:#818cf8">${packs.length}</span><span class="kpi__label">Packs</span></div>
      <div class="kpi"><span class="kpi__val" style="color:#4ade80">${passed}</span><span class="kpi__label">Verified</span></div>
      <div class="kpi"><span class="kpi__val" style="color:#818cf8">${totalReqs}</span><span class="kpi__label">Requirements</span></div>
      <div class="kpi"><span class="kpi__val" style="color:#60a5fa">${totalScenarios}</span><span class="kpi__label">Scenarios</span></div>
    </div>
  </div>
</header>

<main class="main">
  <div class="grid-header">
    <h2>All packs</h2>
    <span class="count-badge" id="visible-count">${packs.length} shown</span>
  </div>
  <div class="grid" id="pack-grid">
${cards}
    <p class="no-results" id="no-results">No packs match your search.</p>
  </div>
</main>

<footer class="footer">
  <p>Powered by <a href="https://github.com/rsaglobaltech/spec-driven-development-template">create-spec-driven-app</a> &nbsp;·&nbsp;
     Generated ${escape(generated)} &nbsp;·&nbsp;
     <a href="./manifest.json">manifest.json</a>
  </p>
  <p style="margin-top:0.5rem">Submit a pack: open a PR adding <code style="font-size:0.8rem">packs/&lt;domain&gt;/&lt;type&gt;/pack.yaml</code></p>
</footer>

<script>
(function () {
  const input = document.getElementById('search');
  const grid  = document.getElementById('pack-grid');
  const cards = Array.from(grid.querySelectorAll('.card'));
  const noRes = document.getElementById('no-results');
  const countEl = document.getElementById('visible-count');

  function filterCards(q) {
    const term = q.trim().toLowerCase();
    let visible = 0;
    cards.forEach(function (card) {
      const match = !term
        || card.dataset.name.includes(term)
        || card.dataset.id.includes(term);
      card.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    countEl.textContent = visible + ' shown';
    noRes.classList.toggle('visible', visible === 0);
  }

  input.addEventListener('input', function () { filterCards(input.value); });

  // Copy-to-clipboard
  grid.addEventListener('click', function (e) {
    const btn = e.target.closest('.card__copy');
    if (!btn) return;
    const pre = document.getElementById(btn.dataset.target);
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(function () {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1500);
    }).catch(function () {
      btn.textContent = 'Copy manually';
    });
  });
})();
</script>
</body>
</html>`;
}

module.exports = { renderIndex, renderCard, escape };
