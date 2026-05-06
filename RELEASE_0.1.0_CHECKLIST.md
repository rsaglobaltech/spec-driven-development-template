# 🚀 Release Checklist - `create-spec-driven-app@0.1.0`

## Goal
Prepare and verify the first publishable npm release without publishing yet.

## 1) Preconditions
- [ ] Node.js `>=18` available
- [ ] npm account ready and authenticated (`npm whoami`)
- [ ] Repository on `develop` branch clean (`git status`)

## 2) Verify package metadata
- [ ] `package.json` name is `create-spec-driven-app`
- [ ] `version` is `0.1.0`
- [ ] `bin` points to `bin/create-spec-driven-app.js`
- [ ] `files` whitelist includes only runtime assets
- [ ] `repository` URL is correct

## 3) Local smoke tests
- [ ] `node bin/create-spec-driven-app.js --help`
- [ ] `node bin/create-spec-driven-app.js --version`
- [ ] `node bin/create-spec-driven-app.js init --config examples/project.config.example --out /tmp --dry-run --no-git --force`

## 4) Packaging validation
- [ ] `NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run`
- [ ] Tarball contains expected files only (no `.local`, no `.git` artifacts)
- [ ] `npm pack` creates `create-spec-driven-app-0.1.0.tgz`

## 5) NPX tarball test
- [ ] `NPM_CONFIG_CACHE=/tmp/npm-cache npx --yes ./create-spec-driven-app-0.1.0.tgz init --config examples/project.config.example --out /tmp --force --no-git`
- [ ] `NPM_CONFIG_CACHE=/tmp/npm-cache npx --yes ./create-spec-driven-app-0.1.0.tgz validate /tmp/acme-energy-hub`

## 6) Docs readiness
- [ ] README includes `npx` quickstart
- [ ] README includes fallback local scripts
- [ ] README includes Node version requirement

## 7) Release branch/merge flow
- [ ] Open PR from `develop` to `main`
- [ ] Confirm CI checks pass
- [ ] Merge PR
- [ ] Tag release commit as `v0.1.0`

## 8) Publish (when approved)
- [ ] `npm publish` (or `npm publish --access public` if scoped)
- [ ] Verify install:
  - `npx create-spec-driven-app@0.1.0 --help`

## 9) Post-release
- [ ] Create GitHub release notes for `v0.1.0`
- [ ] Start next version (e.g. `0.1.1` or `0.2.0`)
