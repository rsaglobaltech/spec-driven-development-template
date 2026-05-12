# VS Code Extension — Pre-Built Releases

This directory holds pre-built `.vsix` archives of the
`vscode-spec-driven` extension, ready to install without going through
the VS Code Marketplace.

## Why this exists

The extension is **not yet published** to the VS Code Marketplace (P2-10
of the implementation roadmap calls this out as an operational
follow-up). Pre-building the `.vsix` here lets early adopters install
the extension by URL or by downloading the file directly.

## Installing

### Option A — from a downloaded file

1. Download the latest `vscode-spec-driven-<version>.vsix` from this directory.
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   and run **`Extensions: Install from VSIX...`**.
3. Select the downloaded file.

### Option B — from the command line

```bash
code --install-extension releases/vscode-spec-driven/vscode-spec-driven-0.1.0.vsix
```

## Verifying

After install, the extension should appear in the Extensions sidebar
under "INSTALLED" as **"Spec-Driven Development"**.

Open any `pack.yaml` to see schema squigglies. Place the cursor on a
`REQ-NNN` identifier in any file and run the command
**`Spec-Driven: Reveal in Traceability Matrix`**.

## Rebuilding from source

```bash
cd packages/vscode-spec-driven
npm install
npx @vscode/vsce package --no-dependencies
mv vscode-spec-driven-*.vsix ../../releases/vscode-spec-driven/
```

The build is reproducible: same source, same `package.json`, same `.vsix`.

## Publishing to the Marketplace

This is the operational follow-up. Once the publisher account is set up:

```bash
cd packages/vscode-spec-driven
npx @vscode/vsce login <publisher>
npx @vscode/vsce publish
```

Publishing requires a Personal Access Token from
<https://dev.azure.com/<publisher>/_usersSettings/tokens>.

## Versioning

Bump `packages/vscode-spec-driven/package.json` `version` field on every
publishable change and rebuild. Follow SemVer.
