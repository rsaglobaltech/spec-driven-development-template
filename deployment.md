# Deployment

This page documents how `create-spec-driven-app`'s public surfaces are deployed.

## GitHub Pages site

The `pages.yml` workflow deploys two artifacts to the `gh-pages` branch on
every push to `main` that touches `docs/`, `packs/`, `packages/pack-registry/`,
`schemas/`, or `README.md`:

1. The contents of `docs/` are copied to the site root.
2. The pack-registry generator runs and writes to `/packs/` inside the deployment.

After a successful run, you can reach:

- **Docs landing page** — `https://<user>.github.io/<repo>/`
- **ROI calculator** — `/roi.html`
- **Comparisons matrix** — `/comparisons.md`
- **Pack registry** — `/packs/index.html`
- **Pack manifest (JSON)** — `/packs/manifest.json`

## Custom domain (`packs.spec-driven.dev` or similar)

To serve the registry from a custom domain such as `packs.spec-driven.dev`:

1. **Add a repository variable** named `SITE_CNAME` set to your domain
   (Settings → Secrets and variables → Actions → Variables → `New repository variable`).
   The workflow only writes a `CNAME` file when this variable is present, so
   the deployment is safe even before the domain is configured.

2. **Point DNS** at GitHub Pages. The full HOWTO is at
   <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>.

3. **Enable HTTPS** in Settings → Pages → "Enforce HTTPS" once the certificate
   has been issued (usually within minutes of DNS propagation).

4. **Re-run the workflow** so the `CNAME` file is published. Click _Actions
   → Deploy Docs + Pack Registry → Run workflow_ on `main`.

## Local preview

```bash
node packages/pack-registry/src/build.js --packs ./packs --out _site/packs
cp -R docs/. _site/
npx serve _site
```

Then open <http://localhost:3000/packs/> in your browser.

## Verifying a deployment

```bash
curl -sI https://<host>/packs/manifest.json | head -1
# expect: HTTP/2 200
curl -s  https://<host>/packs/manifest.json | jq '.packs | length'
# expect: 10  (or whatever your current pack count is)
```
