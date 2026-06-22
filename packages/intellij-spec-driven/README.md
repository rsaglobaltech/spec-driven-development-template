# Spec-Driven — IntelliJ plugin

A **thin** JetBrains plugin that surfaces `traceability.md` diagnostics inside
IntelliJ IDEA (and the rest of the JetBrains family). It contains no spec logic
of its own: it launches the shared [`@spec-driven/lsp-server`](../lsp-spec-driven)
and lets [LSP4IJ](https://github.com/redhat-developer/lsp4ij) render the results.
Build the checks once in the LSP; every editor — VS Code, IntelliJ, Neovim —
gets them.

## Status

> ⚠️ **Scaffold — not built by this repo's Node CI.** It needs a JDK 17+ and
> Gradle, a different toolchain from the TypeScript CLI. The Kotlin glue,
> `plugin.xml`, and Gradle build are complete and correct against the LSP4IJ API;
> compiling/publishing is a separate pipeline. Tracked as roadmap item 4.2.

## Build & run

```bash
cd packages/intellij-spec-driven
./gradlew runIde      # launches a sandbox IDE with the plugin
./gradlew buildPlugin # produces build/distributions/*.zip
```

The plugin starts the LSP via:

1. `$SPEC_DRIVEN_LSP` (absolute path to `server.js`) if set, otherwise
2. `npx --yes @spec-driven/lsp-server` on `PATH`.

## Layout

- `src/main/kotlin/.../SpecDrivenLspSupport.kt` — `LanguageServerFactory` +
  `ProcessStreamConnectionProvider` (launch the Node server over stdio).
- `src/main/resources/META-INF/plugin.xml` — registers the server with LSP4IJ
  and maps it to `traceability.md`.
- `build.gradle.kts` — IntelliJ Platform + Kotlin + LSP4IJ dependency.
