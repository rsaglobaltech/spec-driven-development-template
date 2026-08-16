# Plan de cierre — de `create-spec-driven-app` a herramienta enterprise

> **Creado:** 2026-08-16
> **Estado del proyecto al crear este fichero:** v0.1.4, rama `feat/change-lifecycle`
> **Este fichero es el punto de partida de toda sesión de trabajo en este repo.**

---

## 0. Cómo usar este fichero

1. **Se lee al abrir sesión.** Antes de tocar nada, se localiza la primera tarea sin
   marcar y se continúa por ahí. No se improvisa un orden distinto sin anotarlo en el
   registro de decisiones (§12).
2. **Se marca al cerrar.** Una tarea se marca `[x]` en la **misma sesión** en que se
   termina, junto con el commit que la cierra. Nunca "lo marco luego".
3. **Una fase no se cierra sin pasar su gate.** El gate es una comprobación ejecutable,
   no una opinión. Si el gate no pasa, la fase sigue abierta aunque todas sus tareas
   estén marcadas.
4. **Los IDs (`C0-01`, `C3-04`…) se citan en los commits.** Ejemplo:
   `fix(ci): declarar js-yaml como dependencia directa (C6-02)`.
5. **Nada se borra.** Lo que se descarta se marca `[-]` con el motivo, o se mueve al
   backlog aparcado (§11).

**Leyenda:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[-]` descartado

---

## 1. Decisiones de alcance ya tomadas

| # | Decisión | Fecha |
|---|---|---|
| D1 | `feature/enterprise-adoption` (19 commits) se **rebasa y mergea**, no se reimplementa | 2026-08-16 |
| D2 | `feat/agent-cli` y `feat/csda-agent` quedan **fuera de alcance** — se archivan | 2026-08-16 |
| D3 | Distribución objetivo: **npm público + imagen Docker/ghcr + plugins Maven y Gradle** | 2026-08-16 |

---

## 2. Foto verificada del estado actual

Comprobado contra el disco y el árbol de git el 2026-08-16. No repetir este análisis.

### 2.1 Ramas — **resuelto en la fase 0**

Estado final tras C0-07: el remoto tiene **`main` y `feature/daily-ux-roadmap`**, y
nada más. Todo lo demás está en `main` o preservado en un tag `archive/*`.

| Tag de archivo | Qué preserva | Motivo |
|---|---|---|
| `archive/agent-cli` | REPL agéntico, F1 + F2 | Fuera de alcance (D2) |
| `archive/csda-agent` | Agente acotado a `csda`, multi-proveedor | Fuera de alcance (D2) |
| `archive/runtime-env` | Scaffolding de runtime pre-TypeScript | Se porta como C0-09 (D6) |
| `archive/specops-remote-packs` | `specops sync`/`diff` inicial (M2) | Superseded por `scripts/specops/` |
| `archive/demo-video` | Primer vídeo de demo | Superseded por `scripts/demo/` |
| `archive/gh-pages-legacy` | Rama `gh-pages` local, nunca en el remoto | El sitio vive en `docs/` y despliega vía `pages.yml` |

**Remoto final: solo `main`.** `feature/daily-ux-roadmap` quedó archivada como
`archive/daily-ux` tras recuperar lo aprobado (C0-11).

**Merge verificado con `git merge-tree`:**
`main` + `enterprise-adoption` = **limpio**.
`HEAD` + `enterprise-adoption` = **un solo conflicto**, `bin/create-spec-driven-app.ts`
(tabla de dispatch + `usage()`).

La rama enterprise aporta 65 ficheros / +6816 líneas:

- Comandos nuevos: `adopt` (A1), `doctor` (A3), `alm` (B6, Jira/Azure Boards), `ci` (B1), `report` (C1, dashboard HTML)
- `Dockerfile.cli` + `.github/workflows/publish-docker.yml` (B2)
- `packages/maven-plugin/` — Java, 4 mojos (B3)
- `packages/gradle-plugin/` — Java, 7 tasks (P4)
- Firma e integridad de packs (B5), modo offline / air-gap (B4), modo monorepo (B8), CI mode del harness (B7), wizard interactivo de `init` (A2), paridad Windows (A4), guía de adopción L1–L4 (A5), remedios accionables en `validate` (A6)

### 2.2 Lo que ya está hecho (aunque algún documento diga lo contrario)

OpenSpec **F0** (ADRs 0015–0018 + parser) y **F1** completos — el ciclo `change` entero
(`new`/`list`/`show`/`status`/`validate`/`archive`) está en `scripts/change/`.
OpenSpec **F1B** completo — `specops diff --as-change`, `specops contribute`,
`validate --against-lock`, procedencia en `csda:trace`, packs que distribuyen cambios.
Los **10 packs curados** existen en `packs/`. MCP server, pack registry, extensión
VS Code, `pack lint --graph`, `pack infer`, matriz CI ubuntu+macos × Node 20/22.

### 2.3 Lo que falta de verdad

OpenSpec **F2** (10 PD) · **F3** (14 PD) · **F4** (8 PD) · toda la distribución ·
el gobierno enterprise · el dogfood de CsdaStudioApp (fases 5–10, parado desde 2026-05-15).

### 2.4 Deuda técnica concreta

Ninguna es un `TODO` de código — el grep salió limpio. Todas son fallos de
configuración o de sincronía tras la migración a TypeScript.

| # | Hallazgo | Ficheros |
|---|---|---|
| 1 | `mutation:pilot` está muerto: apunta a `.js` que ya no existen. CI no lo detecta porque no lo ejecuta | `stryker.config.mjs:3,9` |
| 2 | `js-yaml` se usa pero **no está declarado**; resuelve por hoist transitivo de eslint | `packages/vscode-spec-driven/src/{pack-validator,pack-graph}.ts`, `package.json` |
| 3 | Los **cuatro** `packages/*/package.json` apuntan `bin`/`main`/`files` a `src/*.js`, que nunca existe — la salida va al `dist/` de raíz. Publicarlos hoy enviaría paquetes vacíos. `pack-registry` además lista un `templates/` inexistente. El LSP recuperado en C0-11 hereda el mismo defecto | `packages/*/package.json` |
| 4 | Afirma que shellcheck corre en CI; no existe tal step | `CONTRIBUTING.md:119` |
| 5 | Los workflows de publish disparan con tags `v*`, pero los tags existentes son `0.1.4` y `0.1.0-beta.1` (sin `v`) → **nunca han disparado** | `.github/workflows/publish-*.yml` |
| 6 | Los workflows de publish gatean con `npm test` (37 tests E2E), no con `test:all` | idem |
| 7 | No existe `CHANGELOG.md`. `RELEASE_0.1.0_CHECKLIST.md` está congelado en 0.1.0, todo sin marcar, y dice Node ≥18 cuando el paquete exige ≥20 | raíz |
| 8 | ~~Windows en CI solo corre `test:unit`~~ — **resuelto**: el merge enterprise (A4) subió el job de Windows a la suite completa. Sigue pendiente corregir `traceability.md` (C1-01) | `.github/workflows/ci.yml` |
| 9 | ~~La landing está rota~~ — **resuelto en C0-02** | `docs/index.html`, `docs/app.js` |
| 10 | ~~Árbol local sucio~~ — **resuelto en C0-01 y C0-06** | working tree |
| 11 | ~~`dist/` sin `scripts/change/`~~ — **resuelto en C0-06** | working tree |
| 12 | El job de Gradle fallaba: `validatePlugins` de Gradle 9 exige que todo task type se pronuncie sobre cacheado. **Resuelto** con `@UntrackedTask` en los cuatro | `packages/gradle-plugin/src/**` |
| 13 | `pages.yml` ejecutaba `packages/pack-registry/src/build.js`, ruta inexistente desde la migración a TypeScript. **Resuelto**: compila antes y usa `dist/`. Misma causa que el punto 3 | `.github/workflows/pages.yml` |

---

## 3. Fase 0 — Consolidar el árbol (~2 PD)

> **Objetivo:** una sola línea de trabajo, verde, sin residuos.

| ID | | Tarea | Detalle |
|---|---|---|---|
| C0-01 | `[x]` | Limpiar residuo local **antes** de mergear | `packages/gradle-plugin/` local resultó ser solo directorios vacíos de build (0 B, nada versionado). Borrado; `.gradle/`, `build/`, `target/` e `.idea/` ignorados. Commit `f356698` |
| C0-02 | `[x]` | Arreglar la landing | `docs/app.js` restaurado — implementa los botones «copiar» de `docs/index.html:393`. Era un borrado accidental |
| C0-03 | `[x]` | Confirmar el borrado de `mejoras/agent-cli-plan.md` | Coherente con D2. Commit `b366dcc` |
| C0-04 | `[x]` | `feat/change-lifecycle` → `main` | Fast-forward de 4 commits |
| C0-05 | `[x]` | `feature/enterprise-adoption` → `main` | Commit `75e45b9`. Dos conflictos, ambos triviales (`bin/create-spec-driven-app.ts` CORE COMMANDS y `.gitignore`), resueltos por unión. **La rama traía dos defectos reales**: ver §3.1 |
| C0-06 | `[x]` | Reconstruir limpio | `rm -rf dist coverage && npm run build` |
| C0-07 | `[x]` | Podar y archivar ramas | 14 ramas remotas borradas, 6 tags `archive/*` creados y pusheados. El remoto queda con `main` y `feature/daily-ux-roadmap` |
| C0-08 | `[x]` | Decidir `develop` | Eliminada (D5). `ci.yml` ya no la filtra y `CONTRIBUTING.md` §7 describe las pre-releases vía `workflow_dispatch` |
| C0-09 | `[x]` | **Portar el scaffolding de runtime a TypeScript** | Resultó ser mucho menor de lo previsto: 15 de los 16 ficheros del commit archivado ya estaban en `main` (y mejorados, con el split `.env.*.infra`/`.app` de P1-08). Ver §3.2 |
| C0-10 | `[x]` | **Triar `feature/daily-ux-roadmap`** | Triaje completo en §3.3. Resultado: 6 comandos y 2 paquetes se recuperan; los dos refactors masivos y las dos implementaciones duplicadas se descartan |
| C0-11 | `[x]` | **Recuperar lo aprobado de `daily-ux-roadmap`** | 6 comandos + servidor LSP + scaffold IntelliJ + quickstart, sin un solo conflicto. 24 tests nuevos. Ver §3.4 |

### 3.1 Defectos que llegaron con la rama enterprise

Su CI nunca corrió en verde. Ambos arreglados dentro del merge `75e45b9`:

- `tests/unit/report.test.ts:27` — `extra = {}` se infería como `{}`, así que
  `extra.files` no tipaba y **rompía el build entero**.
- `tests/cli.test.ts:908` — el fixture de `--pr-cmd` envolvía la ruta del log en
  backticks de `String.raw`. El harness ejecuta `--pr-cmd` a través de una shell, que
  leía esos backticks como sustitución de comandos: la ruta se ejecutaba como comando
  y la aserción del propio test no podía cumplirse nunca. La ruta pasa ahora por `argv`.

### 3.2 Qué faltaba de verdad del scaffolding de runtime (C0-09)

Compose, devcontainer, `.dockerignore` y los `.env.*` ya se generaban. Faltaban
dos cosas, y una era un bug:

- **`docs/specs/runtime-environments.md` no se generaba.** Es el contrato
  normativo que pide `IMPROVEMENTS.md` §2.4: catálogo de entornos, URLs por
  entorno e invariantes (una base por entorno, cero credenciales en el repo,
  cero configuración hardcodeada). Añadido como
  `templates/base/docs/specs/runtime-environments.md.tpl`.
- **Bug: `DOCKER_SUPPORT=false` dejaba un devcontainer huérfano.**
  `applyRuntimeSupportFlags` borraba `docker-compose.yml` y volvía antes de
  limpiar `.devcontainer/`, así que el proyecto generado conservaba un
  `devcontainer.json` apuntando a `../docker-compose.yml` — un fichero que
  acababa de borrar. Reproducido, corregido y cubierto con tests.
- **Cobertura cero.** No había un solo test sobre el scaffolding de runtime.
  Añadidos 4 en `tests/cli.test.ts`: contrato completo por defecto, la ruta sin
  Docker, y las dos validaciones de configuración (`DEVCONTAINER_SUPPORT` sin
  Docker, y un `DATABASE_ENGINE` no soportado).

El renderizador solo sustituye `{{VAR}}` y no tiene condicionales, así que la
mitad Docker del spec se calcula en `runtimeDockerSection()` — de otro modo un
proyecto sin Docker documentaría un compose inexistente.

### 3.3 Triaje de `feature/daily-ux-roadmap` (C0-10)

La rama sale de la **misma base que la enterprise** (`15d277e`), así que las dos
resolvieron problemas solapados sin saberlo. Un merge directo da 9 conflictos,
dos de ellos irreconciliables por diseño: `scripts/doctor.ts` y el wizard de
`init` están implementados **dos veces**.

Su diagnóstico de partida sigue vigente y no lo cubre ninguna otra fase: *editar
a mano la tabla de 10 columnas de `traceability.md` es la queja número uno*.

**Descubrimiento clave:** los ficheros nuevos no compilan contra `main` porque
dependen del refactor `import/export` de la rama. Pero la dependencia es
mínima — 2 o 3 imports locales por fichero. Verificado: `scripts/req.ts`
compila contra `main` cambiando exactamente 2 líneas. **No hace falta traerse el
refactor de 64 ficheros para recuperar el valor.**

#### Se recupera (C0-11)

Ninguno de estos ficheros existe en `main`, así que entran sin conflicto.

| Qué | Ficheros | Encaje en el plan |
|---|---|---|
| `csda req` — añadir, enlazar y cerrar requisitos sin tocar la tabla a mano | `scripts/req.ts` + tests (815 líneas) | **Nuevo.** Ataca la queja número uno; no estaba en ninguna fase |
| `csda status` — panel diario: totales por estado, features huérfanas, versiones de pack y el siguiente comando sugerido | `scripts/status.ts` | **Nuevo** |
| `csda fix` — remedios automáticos de `validate` | `scripts/fix.ts` | **Nuevo.** Complementa los remedios accionables de A6 |
| `csda config init` | `scripts/config_init.ts` | C4-04 (perfiles) — **ya escrito**, cero imports que tocar |
| `csda completion [bash\|zsh]` | `scripts/completion.ts` | **C5-02 / OS-4-02 — ya escrito**, cero imports que tocar |
| `csda studio` — visor local de solo lectura | `scripts/studio.ts` | Entra en la decisión C1-07 sobre StudioApp: es la tercera variante en liza |
| Servidor LSP para artefactos de spec | `packages/lsp-spec-driven/` | **Nuevo**, no estaba en el plan |
| Plugin IntelliJ (cliente LSP fino, Kotlin) | `packages/intellij-spec-driven/` | **Nuevo**, no estaba en el plan |
| Quickstart de una página | `docs/quickstart.md` | C4-07 |

#### Se descarta

| Qué | Motivo |
|---|---|
| `561d956` refactor `import/export` (64 ficheros) | Chocaría con todo lo que trajo el merge enterprise. Cero valor para el usuario. Rehacerlo como tarea propia si se quiere |
| `950c88f` modo estricto de TypeScript (32 ficheros) | Igual. Merece su propia tarea, no un merge |
| `doctor` de la rama | Duplicado. Gana el de la rama enterprise (A3), que ya está en `main` con un `fix` por hallazgo |
| Wizard interactivo de `init` | Duplicado. Gana el de la rama enterprise (A2) |
| `d9715b6` `--json` global | Se escribió contra una superficie sin `change`, `specops contribute` ni `report`. Se usa como referencia al abordar C3-02, no se mergea |

### 3.4 Recuperación de `daily-ux-roadmap` (C0-11)

Ejecutada sin un solo conflicto: ninguno de los ficheros existía en `main`.
La CLI pasa de 14 a 20 comandos de primer nivel.

El puente entre estilos costó **11 líneas**. Los ficheros nuevos usan `export`
de ESM y son coherentes entre sí; solo los imports que cruzan hacia módulos
CommonJS ya existentes de `main` (`./plan`, `./lib/project-root`,
`./specops/lock`) se reescribieron a `require()`. El refactor de 64 ficheros
que la rama había hecho para unificar el estilo sigue descartado: la mezcla es
una inconsistencia cosmética, no un problema funcional — `tsc` con
`module: commonjs` compila `export` a `exports.x`.

Tres cosas que la rama traía mal y se corrigieron al recuperarlas:

- **`completion` anunciaba una superficie obsoleta.** Se escribió antes de
  `change`, `adopt`, `alm`, `ci`, `report` y `studio`. Una completion que
  ofrece comandos inexistentes es peor que no tenerla, así que ahora hay un
  test (`tests/unit/setup-commands.test.ts`) que compara la lista contra la
  tabla de dispatch de `bin/` y falla si divergen en cualquier dirección.
- **`docs/quickstart.md` documentaba `csda validate --fix`**, un flag que no
  existe ni existió nunca — ni en la rama. El roadmap lo listaba junto a
  `csda fix`, y solo se implementó el segundo. Corregido a `csda fix --dry-run`.
- **El quickstart estaba huérfano**, sin enlazar desde ningún sitio. Enlazado
  desde el índice de documentación del README.

`packages/intellij-spec-driven/` entra como **scaffold declarado**: su propio
README ya avisa de que necesita JDK 17 y Gradle y de que este CI no lo
construye. No se le añade job.

**Gate de salida:** ✅ **pasado el 2026-08-16**

```bash
npm run verify        # exit 0
npm run test:all      # 567 tests: 38 E2E · 428 unit · 22 escenarios BDD · 42 vscode · 23 mcp · 10 registry · 4 snapshot
git status --porcelain    # vacío
node bin/create-spec-driven-app.js --help   # 14 comandos de primer nivel, 22 entradas con subcomandos
node bin/create-spec-driven-app.js change list --project-dir .   # responde (no exit 3)
```

> C0-09 y C0-10 quedan abiertos: aparecieron durante la ejecución de la fase y no
> bloquean el gate, pero **C0-10 debe cerrarse antes de empezar la fase 3**.

---

## 4. Fase 1 — Sanear la verdad documental (~3 PD)

> **Objetivo:** ningún documento afirma algo falso.
> Bloqueante para uso enterprise: un equipo que adopte esto lee estos ficheros
> como contrato, y hoy varios mienten en ambas direcciones.

| ID | | Tarea | Fichero |
|---|---|---|---|
| C1-01 | `[ ]` | REQ-006..009 y NFR-002/004/005 pasan de `Planned`/`Draft` a su estado real. Borrar las 6 "coverage gaps" ya cerradas. Corregir las rutas a `.sh` / `.bats` / `.js` eliminados por ADR-0008 | `docs/specs/traceability.md` |
| C1-02 | `[ ]` | MCP server y pack registry dejan de estar `🚧 planned` — ambos existen y CI los construye. Node ≥ 20, no ≥ 18 | `docs/comparisons.md` |
| C1-03 | `[ ]` | `validate --against-lock` y la composición multi-pack dejan de ser "Planned". Nota de corrección en ADR-0010 líneas 89 y 114 | `docs/specs/specops.md`, `docs/specs/adr/0010-specops-sync-diff.md` |
| C1-04 | `[ ]` | F0 (`OS-0-01`..`05`) y F1 (`OS-1-01`..`09`) → `[x]` | `mejoras/openspec-benchmark-plan.md` §10 |
| C1-05 | `[ ]` | Cabecera "Status: Proposal / not started" → estado real (fases 1–3 hechas, fase 4 abierta) | `mejoras/visual-pack-authoring-todo.md` |
| C1-06 | `[ ]` | P3-03 cerrado: los 10 packs existen en `packs/`. P3-02 (deploy del registry) sigue abierto | `mejoras/implementation-roadmap.md` |
| C1-07 | `[ ]` | Resolver la contradicción StudioApp: `visual-pack-authoring-todo.md` fase 4 dice "DEFERRED, entregar como webview de VS Code", mientras `csda-studio-brief.md` y `csda-studio-handoff.md` construyen una SPA independiente. Escribir la decisión como ADR | `docs/specs/adr/0019-studioapp-delivery.md` (nuevo) |
| C1-08 | `[ ]` | Sustituir el checklist congelado por un proceso de release versionado y correcto | `RELEASE_0.1.0_CHECKLIST.md` → `docs/release-process.md` |
| C1-09 | `[ ]` | O se añade el step de shellcheck (ver C6-05) o se corrige el texto | `CONTRIBUTING.md:119` |
| C1-10 | `[ ]` | Test de guardia: toda ruta citada en `traceability.md` existe en disco. Sin esto, el documento vuelve a caducar en semanas | `tests/unit/docs-truth.test.ts` (nuevo) |

**Gate de salida:** C1-10 en verde dentro de CI, y revisión doc a doc de los ocho
ficheros anteriores.

---

## 5. Fase 2 — Cerrar el ciclo de cambio (~2 PD)

> **Objetivo:** `change` deja de ser un comando invisible.
> Cierra los dos ítems abiertos de `docs/specs/changes/add-change-lifecycle/tasks.md`.

| ID | | Tarea |
|---|---|---|
| C2-01 | `[ ]` | `tasks.md` 4.4 — integrar la validación de cambios en `csda validate` |
| C2-02 | `[ ]` | `tasks.md` 4.5 — documentar el ciclo: tabla de comandos del `README.md`, receta nueva en `docs/how-to.md`, cheat-sheet de `docs/tutorial.md`. Hoy `change` es un comando de primer nivel que **no aparece en ningún documento de usuario** |
| C2-03 | `[ ]` | Dogfooding obligatorio (§11 del plan OpenSpec) — archivar el propio cambio `add-change-lifecycle` con `csda change archive` |
| C2-04 | `[ ]` | Prueba de fuego F1B — publicar `parking-management-specops` `v0.2.0` y consumirlo con `specops diff --as-change`. Criterio literal del plan: *si la propuesta generada no se lee mejor que el `git diff`, la fase ha fallado* |

**Gate de salida:** demo end-to-end grabada — `change new` → `archive` →
`validate --strict-tdd` falla con `[TDD-1]`.

---

## 6. Fase 3 — Contrato de agente · OpenSpec F2 (~10 PD)

> **Objetivo:** la brecha real frente a OpenSpec, y el mayor valor enterprise.
> Es lo que permite que Claude Code, Cursor y Copilot conduzcan el ciclo completo
> sin que un humano escriba comandos de CLI.

Especificación de referencia: `mejoras/openspec-benchmark-plan.md:503-522`.

| ID | | Tarea | Estado real de partida |
|---|---|---|---|
| C3-01 | `[ ]` | Envoltorio de diagnóstico `{severity, code, message, target?, fix?}` en **todos** los comandos; ningún `console.error` suelto en modo `--json` | `scripts/lib/diagnostics.ts` ya existe, pero solo lo usa `change` |
| C3-02 | `[ ]` | `--json` en los 12 comandos aptos para agente: un documento en stdout, prosa a stderr, null-shape en fallo. Test: `cmd --json 2>/dev/null \| jq .` parsea en éxito y en fallo | hoy solo `change` y `plan --format json`. Hay un intento previo en `feature/daily-ux-roadmap` (`d9715b6`) — leerlo antes de empezar |
| C3-03 | `[ ]` | Contrato de exit codes: 0 éxito (hallazgos incluidos), 1 fallo, 130 cancelación | hoy hay `2` (subcomando desconocido) y `3` (script no encontrado) sin documentar → normalizar o incorporarlos al contrato |
| C3-04 | `[ ]` | `docs/specs/agent-contract.md` — shapes campo a campo y catálogo de códigos, **generado y verificado desde tests snapshot**, no escrito a mano | nuevo |
| C3-05 | `[ ]` | `csda agents init --tool claude,cursor,copilot,windsurf,aider,gemini,cline,codex` — genera `.claude/commands/csda-*.md`, `.cursor/rules/csda.mdc`, `.github/copilot-instructions.md`, `AGENTS.md`; `--dry-run` lista destinos | `scripts/agents/*.ts`, `templates/agents/**` (nuevos) |
| C3-06 | `[ ]` | Slash commands `/csda:explore`, `/csda:propose`, `/csda:apply`, `/csda:verify`, `/csda:archive`, `/csda:onboard` — cada uno invoca `csda change instructions <artifact> --json` | `templates/agents/commands/*.md.tpl` |
| C3-07 | `[ ]` | `csda change instructions <artifact> [--json]` — plantilla + contexto + reglas + dependencias + `unlocks`. Motor único que consumen slash commands, MCP, VS Code y harness. `harness run` deja de construir su prompt ad hoc | `scripts/change/instructions.ts` (nuevo); reutiliza `scripts/harness/prompt.ts` |

**Gate de salida:** Claude Code, Cursor y Copilot completan el ciclo sobre un repo
brownfield real usando **solo** comandos slash generados.

---

## 7. Fase 4 — Schemas, perfiles y documentación · OpenSpec F3 (~14 PD)

> **Objetivo:** que un desarrollador nuevo llegue al primer valor sin leerse el README entero.

Especificación de referencia: `mejoras/openspec-benchmark-plan.md:526-543`.

| ID | | Tarea |
|---|---|---|
| C4-01 | `[ ]` | `OS-3-01` — grafo de artefactos configurable: `.csda/schemas/<name>/schema.yaml` con `artifacts[{id, generates, requires}]`. El schema `spec-driven` built-in reproduce el flujo actual |
| C4-02 | `[ ]` | `OS-3-02` — `csda schema init \| fork \| validate \| which` |
| C4-03 | `[ ]` | `OS-3-03` — schema built-in `bdd-first`: `proposal → feature → spec → tasks`, el `.feature` **antes** que la spec. Es nuestra opinión de producto |
| C4-04 | `[ ]` | `OS-3-04` — perfiles `core \| full`: el help por defecto muestra 6 comandos, `--help --all` los muestra todos. **`config init` ya está escrito** — recuperarlo en C0-11 primero |
| C4-05 | `[ ]` | `OS-3-05` — rigor progresivo: `change new --lite` (proposal + tasks) vs `--full` |
| C4-06 | `[ ]` | `OS-3-06` — `csda onboard`: tour guiado sobre repo existente, detecta stack, propone capabilities, genera el primer cambio |
| C4-07 | `[ ]` | `OS-3-07` — reestructurar `docs/` en guías cortas (`overview`, `getting-started`, `concepts`, `workflows`, `writing-specs`, `reviewing-changes`, `existing-projects`, `commands`, `cli`, `agent-contract`, `customization`, `glossary`, `faq`, `troubleshooting`). Ninguna > 300 líneas; README < 150 |
| C4-08 | `[ ]` | `OS-3-08` — contexto de idioma configurable (ES/EN/PT) inyectado en prompts e instrucciones, manteniendo los términos técnicos en inglés |
| C4-09 | `[ ]` | `OS-3-09` — `docs/comparisons.md` con OpenSpec como columna principal, incluyendo "cuándo elegir OpenSpec en vez de CSDA" |

**Gate de salida:** un usuario nuevo cierra el bucle en < 15 minutos leyendo solo
`docs/getting-started.md`.

---

## 8. Fase 5 — DX y multi-repo · OpenSpec F4 (~8 PD)

| ID | | Tarea |
|---|---|---|
| C5-01 | `[ ]` | `OS-4-01` — `csda update`: regenera ficheros de instrucciones y slash commands tras un upgrade, preservando ediciones locales. 3-way merge reutilizando `scripts/specops/merge.ts` |
| C5-02 | `[ ]` | `OS-4-02` — `csda completion [bash\|zsh\|fish] [--install]`. **Bash y zsh ya están escritos** en `feature/daily-ux-roadmap` — recuperarlo en C0-11 antes de escribir nada |
| C5-03 | `[ ]` | `OS-4-03` — `doctor` extendido: deltas huérfanos, cambios archivados con tareas sin marcar, drift entre matriz y specs, requisitos de pack editados sin cambio asociado. Cada hallazgo con `fix` accionable. Construye sobre el `doctor` que llega en C0-05 |
| C5-04 | `[ ]` | `OS-4-04` — `csda init --from-pack <repo>@<tag>` en un paso, y `specops.config.yaml` heredable entre repos. **No replicar los *Stores* de OpenSpec**: nuestra respuesta al multi-repo es el pack privado compartido, que ya existe |
| C5-05 | `[ ]` | `OS-4-05` — gobierno de repo: changesets y devcontainer (el resto se completa en la Fase 9) |

---

## 9. Fase 6 — Higiene de build y CI (~3 PD) · **bloquea la Fase 7**

| ID | | Tarea |
|---|---|---|
| C6-01 | `[ ]` | Arreglar `stryker.config.mjs:3,9` para apuntar a `dist/`, o retirar el pilot. Si se conserva, añadirlo a CI (semanal); si no, dejar de anunciarlo |
| C6-02 | `[ ]` | Declarar `js-yaml` en `package.json`. Hoy resuelve por accidente vía eslint: una actualización de eslint rompe CI con un `MODULE_NOT_FOUND` incomprensible |
| C6-03 | `[ ]` | Corregir `bin`/`main`/`files` de los **cuatro** `packages/*/package.json` (incluido `lsp-spec-driven`); borrar el `templates/` inexistente de `pack-registry`. **Bloquea C7-07 y C7-08** |
| C6-04 | `[ ]` | Windows en CI: subir de `test:unit` a E2E + BDD, o documentar la limitación y corregir `traceability.md` en consecuencia |
| C6-05 | `[ ]` | Añadir el step de shellcheck que `CONTRIBUTING.md` ya promete (ver C1-09) |
| C6-06 | `[ ]` | Los workflows de publish gatean con `test:all`, no con `npm test` |
| C6-07 | `[ ]` | Normalizar la convención de tags a `vX.Y.Z`. Los workflows disparan con `v*` y los tags existentes no lo llevan: la ruta de publicación por tag nunca se ha ejecutado |
| C6-08 | `[ ]` | Dependabot + CodeQL + `npm audit` en CI. Requisito habitual de adopción corporativa |

**Gate de salida:** un push del tag `v0.2.0-rc.1` dispara la cadena completa y llega
hasta publish en dry-run sin fallar.

---

## 10. Fase 7 — Distribución

> Según **D3**: npm público, Docker/ghcr, plugins Maven y Gradle.
> Se añaden VS Code Marketplace y el MCP server porque ya están construidos y
> bloqueados solo por C6-03.

| ID | | Tarea |
|---|---|---|
| C7-01 | `[ ]` | `CHANGELOG.md` + changesets. Hoy no existe ninguno |
| C7-02 | `[ ]` | Preparar la release **0.2.0**: tres meses de features sin publicar — ciclo `change`, `specops contribute`, `diff --as-change`, F1B, más todo lo que entra en C0-05 |
| C7-03 | `[ ]` | npm público vía `publish-npm.yml` con tag `v0.2.0`. `--provenance` e `id-token: write` ya están configurados |
| C7-04 | `[ ]` | Docker: primer push a ghcr.io con `Dockerfile.cli` + `publish-docker.yml` (llegan en C0-05). Documentar el uso en pipelines de cliente |
| C7-05 | `[ ]` | Maven: publicar `packages/maven-plugin`. Requiere groupId, firma GPG y cuenta OSSRH — o Nexus/Artifactory interno |
| C7-06 | `[ ]` | Gradle: publicar `packages/gradle-plugin` en el Gradle Plugin Portal o repo interno |
| C7-07 | `[ ]` | VS Code Marketplace: cuenta de publisher + `vsce publish`. El `.vsix` 0.1.0 ya está construido en `releases/` |
| C7-08 | `[ ]` | npm: `@spec-driven/mcp-server` |
| C7-09 | `[ ]` | Desplegar el registry en `packs.spec-driven.dev`: dominio + Pages/Cloudflare |

**Gate de salida:** desde una máquina limpia funcionan
`npx create-spec-driven-app@latest --help`,
`docker run ghcr.io/rsaglobaltech/csda validate .`
y el goal `csda:validate` de Maven sobre un proyecto Java real.

---

## 11. Fase 8 — Prueba en empresa

| ID | | Tarea |
|---|---|---|
| C8-01 | `[ ]` | CsdaStudioApp fases 5–10 (`mejoras/csda-studio-handoff.md`): bootstrap fase 1 + REQ-015 verde, `harness run` para REQ-001..014, review y merge de las 14 ramas, tag y deploy. Parado desde 2026-05-15 |
| C8-02 | `[ ]` | Piloto HIE (`mejoras/hie-pilot-runbook.md`; los repos viven en `~/sandbox/projects/`, fuera de este árbol) |
| C8-03 | `[ ]` | Case studies 2 y 3. Solo existe `docs/case-studies/case-1.md` |
| C8-04 | `[ ]` | Vídeo demo de 90 s (P1-12, pendiente desde la fase 1) + vídeo del bucle bidireccional F1B — *ese vídeo no lo puede grabar ningún competidor* |
| C8-05 | `[ ]` | Medir las métricas §9 del plan OpenSpec: TTFV < 5 min (hoy 25), comandos visibles ≤ 8 (hoy 25), `--json` en 12 comandos (hoy 1), ≥ 8 slash commands (hoy 0), README < 150 líneas (hoy 264) |

---

## 12. Fase 9 — Gobierno enterprise

> Lo que una empresa exige antes de adoptar una herramienta que toca su código.

| ID | | Tarea |
|---|---|---|
| C9-01 | `[ ]` | `SECURITY.md` + política de divulgación de vulnerabilidades |
| C9-02 | `[ ]` | `CODEOWNERS` + `MAINTAINERS.md` |
| C9-03 | `[ ]` | Integridad y firma de packs (B5, llega en C0-05): documentar la política y activarla por defecto en CI |
| C9-04 | `[ ]` | Modo offline / air-gap (B4, llega en C0-05): runbook operativo para redes cerradas |
| C9-05 | `[ ]` | Telemetría opt-in con consentimiento explícito (R1 de `risk-mitigation-plan.md`, nunca implementada) |
| C9-06 | `[ ]` | Matriz de licencias de dependencias + SBOM |
| C9-07 | `[ ]` | Política de soporte y versionado: LTS, y ventana de compatibilidad del `schemaVersion` de los packs |
| C9-08 | `[ ]` | Validar la guía de adopción L1–L4 (A5, llega en C0-05) con un equipo real |

---

## 13. Backlog aparcado

Nada de esto se pierde; simplemente no entra en el cierre. Cada línea lleva el motivo.

| Ítem | Motivo |
|---|---|
| `csda agent` / agent-cli y `csda-agent` | Fuera de alcance por D2. El propio ADR de la rama concluye que el enfoque de permisos de F2 es un callejón sin salida |
| Watch mode y `validate --watch --serve` | Nunca llegó a ningún checklist desde `risk-mitigation-plan.md` §7.2 |
| `pack publish` | Depende de C7-09 (registry desplegado) |
| Plantillas GitLab CI y Azure DevOps | El generador multi-proveedor (B1) llega en C0-05; estas plantillas concretas no |
| Workshop decks (`docs/workshops/*.md`) | Material comercial, no producto |
| `docs/retros/phase-N.md` | Los gates de decisión de 90/180/365 días nunca se ejecutaron |
| Distribución como binario único | Marcado "optional" ya en el plan original |
| `pack lint --graph-out` y `--export eraser` | La redirección de shell cubre el primero; el segundo esperaba a que un usuario lo pidiera |
| `pack infer --llm` | Diferido explícitamente en ADR-0014 |
| Adaptador AetherDeploy | `docs/aetherdeploy-ai-integration-assessment.md` es una evaluación sin ninguna de sus acciones de corto plazo implementada |
| Stretch goals de StudioApp | Declarados no-objetivos de v0.1.0 en `csda-studio-brief.md` §4 |

---

## 14. Registro de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-08-16 | `feature/enterprise-adoption` se rebasa y mergea (D1) | 19 commits de trabajo enterprise ya escrito, en TypeScript, con base de merge = `main` y un solo conflicto trivial |
| 2026-08-16 | agent-cli y csda-agent fuera de alcance (D2) | No aportan al objetivo de uso enterprise; se archivan como tags |
| 2026-08-16 | Distribución: npm público + Docker/ghcr + Maven/Gradle (D3) | Cubre las dos audiencias reales: equipos Node y equipos Java |
| 2026-08-16 | Se crea este fichero como punto de partida único | El trabajo estaba repartido en seis documentos con marcadores contradictorios |
| 2026-08-16 | `main` es la única línea de integración; `develop` eliminada (D5) | Llevaba 136 commits de retraso y su único commit propio era el de la rama codex. El repo ya trabajaba con ramas `feature/*` directas a `main` |
| 2026-08-16 | El scaffolding de runtime se porta a TypeScript, no se mergea (D6) | El commit original es pre-ADR-0008: toca `tests/cli.test.js` y scripts `.sh` que ya no existen. Preservado en `archive/runtime-env` |
| 2026-08-16 | Las ramas muertas se archivan como tags `archive/*` antes de borrarlas | Deja el remoto legible sin perder historia. 6 tags creados |
| 2026-08-16 | `feature/daily-ux-roadmap` triada (C0-10) | Se recuperan 6 comandos y 2 paquetes; se descartan los dos refactors masivos y las dos implementaciones duplicadas. Detalle en §3.3 |
| 2026-08-16 | La recuperación (C0-11) puentea estilos en vez de unificarlos | 11 líneas de `require()` en la frontera contra un refactor de 64 ficheros. La mezcla ESM/CommonJS es cosmética: `tsc` con `module: commonjs` compila ambas |
| 2026-08-16 | Los refactors `import/export` y `strict mode` no se mergean | 96 ficheros entre los dos, todos tocados también por el merge enterprise. Sin valor para el usuario y con coste de conflicto alto. Si se quieren, son tarea propia sobre `main` |
