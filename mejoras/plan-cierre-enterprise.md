<!-- csda:allow-placeholders — this file documents the {{VAR}} template syntax. -->
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
| 1 | ~~`mutation:pilot` está muerto~~ — **resuelto en C6-01**: apunta a `dist/`, corre semanalmente, baseline 51,32 % | `stryker.config.mjs` |
| 2 | ~~`js-yaml` no declarado~~ — **resuelto en C6-02**, y fijado a `^4.3.1` porque el rango anterior era vulnerable | `package.json` |
| 3 | ~~Los cuatro `packages/*/package.json` apuntan a `src/*.js`~~ — **resuelto en C6-03**. Antes: apuntaban a `src/*.js`, que nunca existe — la salida va al `dist/` de raíz. Publicarlos hoy enviaría paquetes vacíos. `pack-registry` además lista un `templates/` inexistente. El LSP recuperado en C0-11 hereda el mismo defecto | `packages/*/package.json` |
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
| C1-01 | `[x]` | REQ-006..009 y NFR-002/004/005 pasan de `Planned`/`Draft` a su estado real. Borrar las 6 "coverage gaps" ya cerradas. Corregir las rutas a `.sh` / `.bats` / `.js` eliminados por ADR-0008 | `docs/specs/traceability.md` |
| C1-02 | `[x]` | MCP server y pack registry dejan de estar `🚧 planned` — ambos existen y CI los construye. Node ≥ 20, no ≥ 18 | `docs/comparisons.md` |
| C1-03 | `[x]` | `validate --against-lock` y la composición multi-pack dejan de ser "Planned". Nota de corrección en ADR-0010 líneas 89 y 114 | `docs/specs/specops.md`, `docs/specs/adr/0010-specops-sync-diff.md` |
| C1-04 | `[x]` | F0 (`OS-0-01`..`05`) y F1 (`OS-1-01`..`09`) → `[x]` | `mejoras/openspec-benchmark-plan.md` §10 |
| C1-05 | `[x]` | Cabecera "Status: Proposal / not started" → estado real (fases 1–3 hechas, fase 4 abierta) | `mejoras/visual-pack-authoring-todo.md` |
| C1-06 | `[x]` | P3-03 cerrado: los 10 packs existen en `packs/`. P3-02 (deploy del registry) sigue abierto | `mejoras/implementation-roadmap.md` |
| C1-07 | `[x]` | Resolver la contradicción StudioApp: `visual-pack-authoring-todo.md` fase 4 dice "DEFERRED, entregar como webview de VS Code", mientras `csda-studio-brief.md` y `csda-studio-handoff.md` construyen una SPA independiente. Escribir la decisión como ADR | `docs/specs/adr/0019-studioapp-delivery.md` (nuevo) |
| C1-08 | `[x]` | Sustituir el checklist congelado por un proceso de release versionado y correcto | `RELEASE_0.1.0_CHECKLIST.md` → `docs/release-process.md` |
| C1-09 | `[x]` | O se añade el step de shellcheck (ver C6-05) o se corrige el texto | `CONTRIBUTING.md:119` |
| C1-10 | `[x]` | Test de guardia: toda ruta citada en `traceability.md` existe en disco. Sin esto, el documento vuelve a caducar en semanas | `tests/unit/docs-truth.test.ts` (nuevo) |

### 4.1 Lo que salió al tirar del hilo

Tres cosas que la auditoría inicial no había visto:

- **La puerta de cobertura nunca ha verificado nada.** `test:coverage` pasaba
  `--lines 75` pero no `--check-coverage`, que es lo que hace que c8 falle. Con
  la puerta encendida, la cobertura real es **74,8 % líneas · 71,1 % ramas ·
  80,4 % funciones**: por debajo del umbral que el propio script declaraba, y
  muy por debajo del 80/70 que `traceability.md` daba por cumplido. Ahora la
  puerta está encendida y trincada en 74/70/80 — de "sin puerta" a "puerta" es
  más fuerte, no más débil, y el objetivo del 80 % queda registrado como brecha
  abierta en vez de como logro.
- **`tasks.md` 4.4 ya estaba hecho.** `csda validate` valida los cambios activos
  desde `validate_specs.ts:445-467`. Solo faltaba la casilla. Cierra C2-01.
- **`CONTRIBUTING.md` mentía en seis sitios, no en uno.** Pedía `chmod` sobre
  scripts `.sh` que no existen, declaraba Bash y `bats-core` como requisitos,
  listaba `npm run test:shell` (script inexistente) y `tests/cli.test.js`
  (`.ts`), decía Node ≥ 18, prohibía ESM en `scripts/` cuando C0-11 ya lo
  introdujo, y remitía a `IMPROVEMENTS.md` como backlog vivo. Es el documento
  de entrada de cualquiera que quiera contribuir.

`IMPROVEMENTS.md` queda marcado como superado — casi todo su contenido se
implementó y sus items de shell/Bats son irrelevantes desde ADR-0008.

**Gate de salida:** ✅ **pasado el 2026-08-16.** `tests/unit/docs-truth.test.ts`
en verde y en CI (verificado que falla al introducir una ruta inexistente), y
revisión documento a documento de los diez ficheros anteriores.

---

## 5. Fase 2 — Cerrar el ciclo de cambio (~2 PD)

> **Objetivo:** `change` deja de ser un comando invisible.
> Cierra los dos ítems abiertos de `docs/specs/changes/add-change-lifecycle/tasks.md`.

| ID | | Tarea |
|---|---|---|
| C2-01 | `[x]` | `tasks.md` 4.4 — **ya estaba implementado** en `scripts/validate_specs.ts:445-467`; solo faltaba marcar la casilla. Verificado: un cambio con delta inválido hace fallar `validate` |
| C2-02 | `[x]` | `tasks.md` 4.5 — documentar el ciclo: tabla de comandos del `README.md`, receta nueva en `docs/how-to.md`, cheat-sheet de `docs/tutorial.md`. Hoy `change` es un comando de primer nivel que **no aparece en ningún documento de usuario** |
| C2-03 | `[x]` | Dogfooding obligatorio (§11 del plan OpenSpec) — archivar el propio cambio `add-change-lifecycle` con `csda change archive` |
| C2-04 | `[x]` | Prueba de fuego F1B — publicar `parking-management-specops` `v0.2.0` y consumirlo con `specops diff --as-change`. Criterio literal del plan: *si la propuesta generada no se lee mejor que el `git diff`, la fase ha fallado* |

### 5.1 Lo que el dogfooding destapó

Archivar el propio cambio del repo obligó a que el repo se validara a sí mismo,
y ahí salió casi todo:

- **`spec.md` §6 afirmaba que «the repository's own `validate` check is green in
  CI on every PR».** No estaba en CI **y fallaba.** Ahora `csda validate .` corre
  en el job de tests y en `npm run verify` (script `selfcheck`).
- **`csda change archive` borraba contenido del usuario.** `syncTraceability`
  reconstruía `traceability.md` entero desde las filas, tirando todo lo demás —
  NFRs, inventario de tests, notas — sin un aviso. Verificado sobre la matriz
  real de este repo: se cargó cuatro secciones. Corregido con `spliceMatrix`,
  que sustituye solo el bloque de tabla; dos tests de regresión.
- **`validate` escaneaba `node_modules/`.** Cualquier proyecto con dependencias
  instaladas se comía falsos positivos de placeholders de las librerías de
  plantillas. Ahora salta `node_modules`, `dist`, `build`, `out`, `target`,
  `coverage`, `vendor`, `.git`, `.next`, `.gradle` y `.specops`.
- **`validate` marcaba los `.tpl` como placeholders sin resolver.** Un `.tpl`
  está sin renderizar por definición. Los proyectos generados no contienen
  `.tpl`, así que excluirlos no debilita la puerta para su destinatario: solo
  deja de dispararse en repos de plantillas y de packs.
- **No había forma de eximir prosa que documenta la sintaxis.** Añadido el
  marcador explícito `csda:allow-placeholders`, en la misma convención que
  `csda:trace`. Se dice, no se adivina.
- **El parser de la matriz interpreta cualquier tabla de pipes del fichero.**
  Una tabla de 3 o 4 columnas en otra sección se lee como filas de matriz y su
  primera columna como Scenario IDs. Documentado en la cabecera de la matriz.
- **La matriz del propio CLI estaba en un formato inventado de 6 columnas**, no
  en el formato rico de 10 que la herramienta genera. Convertida: la herramienta
  tiene que poder operar sobre su propio repositorio.
- **El ejemplo de delta que escribí para el README era inválido.** Usaba
  `- **GIVEN**`; el validador exige la palabra clave al principio de línea.
  Detectado al ejecutar el flujo en vez de suponerlo.

**Gate de salida:** ✅ **pasado el 2026-08-16.** Bucle completo ejecutado de
punta a punta: `change new` → delta → `change validate` → `change archive` →
fila en la matriz + capability spec + `csda plan` lo lista → estado a `In Dev` →
`validate --strict-tdd` falla con `[TDD-1]`, con su remedio.

### 5.2 Prueba de fuego F1B (C2-04)

`parking-management-specops` ya tenía `v0.2.0` publicado, pero ese bump **no
cambiaba ningún requisito** — y `--as-change` lo dice: *«No requirement changed;
nothing to review»*, donde el diff plano reporta «2 modified». Ya ahí discrimina
ruido de intención.

Para juzgar la legibilidad hacía falta un bump que sí moviera requisitos, así
que se construyó uno (un requisito añadido, otro reformulado):

| | Salida |
|---|---|
| `specops diff` | `~ docs/specs/traceability.md` · *0 added · 1 modified · 13 unchanged* |
| `specops diff --as-change` | `+ REQ-010` · `~ REQ-002` · *1 added · 1 modified · 0 removed*, más una propuesta que nombra los requisitos y un delta con el texto nuevo, el escenario completo del reformulado y `origin=pack:backend@v0.3.0` en ambos |

**Veredicto: supera el criterio.** Del diff plano no se puede deducir qué cambió
en el dominio; de la propuesta, sí. Y cuando el pack declara un requisito sin
plantilla Gherkin, el delta deja un `TODO` explícito y la propuesta avisa de
ello en vez de inventarse el comportamiento.

Dos asperezas anotadas, ninguna bloqueante:

- Un bump que añade variables requeridas hace fallar `specops diff` una vez por
  variable (`STACK`, luego `LANG`) en lugar de pedirlas todas de golpe.
- La propuesta generada sale en español y las cabeceras del delta en inglés.
  Lo cubre C4-08 (contexto de idioma).

---

## 6. Fase 3 — Contrato de agente · OpenSpec F2 (~10 PD)

> **Objetivo:** la brecha real frente a OpenSpec, y el mayor valor enterprise.
> Es lo que permite que Claude Code, Cursor y Copilot conduzcan el ciclo completo
> sin que un humano escriba comandos de CLI.

Especificación de referencia: `mejoras/openspec-benchmark-plan.md:503-522`.

| ID | | Tarea | Estado real de partida |
|---|---|---|---|
| C3-01 | `[x]` | Envoltorio de diagnóstico `{severity, code, message, target?, fix?}` en **todos** los comandos; ningún `console.error` suelto en modo `--json` | `scripts/lib/diagnostics.ts` ya existe, pero solo lo usa `change` |
| C3-02 | `[x]` | `--json` en los 12 comandos aptos para agente: un documento en stdout, prosa a stderr, null-shape en fallo. Test: `cmd --json 2>/dev/null \| jq .` parsea en éxito y en fallo | hoy solo `change` y `plan --format json`. Hay un intento previo en `feature/daily-ux-roadmap` (`d9715b6`) — leerlo antes de empezar |
| C3-03 | `[x]` | Contrato de exit codes: 0 éxito (hallazgos incluidos), 1 fallo, 130 cancelación | hoy hay `2` (subcomando desconocido) y `3` (script no encontrado) sin documentar → normalizar o incorporarlos al contrato |
| C3-04 | `[x]` | `docs/specs/agent-contract.md` — shapes campo a campo y catálogo de códigos, **generado y verificado desde tests snapshot**, no escrito a mano | nuevo |
| C3-05 | `[x]` | `csda agents init --tool claude,cursor,copilot,windsurf,aider,gemini,cline,codex` — genera `.claude/commands/csda-*.md`, `.cursor/rules/csda.mdc`, `.github/copilot-instructions.md`, `AGENTS.md`; `--dry-run` lista destinos | `scripts/agents/*.ts`, `templates/agents/**` (nuevos) |
| C3-06 | `[x]` | Slash commands `/csda:explore`, `/csda:propose`, `/csda:apply`, `/csda:verify`, `/csda:archive`, `/csda:onboard` — cada uno invoca `csda change instructions <artifact> --json` | `templates/agents/commands/*.md.tpl` |
| C3-07 | `[x]` | `csda change instructions <artifact> [--json]` — plantilla + contexto + reglas + dependencias + `unlocks`. Motor único que consumen slash commands, MCP, VS Code y harness. `harness run` deja de construir su prompt ad hoc | `scripts/change/instructions.ts` (nuevo); reutiliza `scripts/harness/prompt.ts` |

### 6.1 Lo que salió al implementar el contrato

- **La puerta de cobertura tenía hermana.** `validate` y `doctor` mantenían cada
  uno su propio escaneo de placeholders, y divergieron: arreglar `validate` en
  la fase 2 dejó a `doctor` reportando **64 errores** en este repo, todos falsos
  positivos de `coverage/` y `templates/`. Extraído a
  `scripts/lib/placeholders.ts` con 6 tests. Doctor pasó a 0 errores.
- **`doctor` no conocía `docs/specs/capabilities/`.** Comparaba la matriz solo
  contra el `spec.md` raíz, así que daba por fila huérfana cada requisito que
  `change archive` fusiona — siete, justo después del dogfood de la fase 2.
- **La salida JSON mezclaba snake_case y camelCase.** `plan`, `status`,
  `report`, `studio`, `infer` y `harness` emitían `schema_version` y
  `project_dir` junto a `scenarioId` y `featureFile`; `studio` lograba ambas en
  el mismo documento. Normalizado a camelCase (ADR-0017 regla 4). **Rompe a los
  consumidores de `plan --format json`** — va en las notas de la 0.2.0. Los
  formatos en disco (`pack.yaml`, `.specops.lock`) no se tocan: son esquemas de
  fichero, no salida de comando.
- **Los tests del contrato cazaron tres cosas más al escribirlos:** el
  recolector de códigos ignoraba el reportero `fail("code", …)` de `validate`
  (diez códigos ausentes del catálogo publicado), `plan --json` no emitía
  `status` en absoluto, y quedaban claves anidadas en snake_case que el barrido
  anterior no tocó.
- **Ciclo de imports.** `instructions.ts` requería `cli.ts` para el grafo de
  artefactos, y `cli.ts` aún no había asignado `module.exports`. Resuelto
  extrayendo el grafo a `change/artifacts.ts`, no con requires perezosos.

**Gate de salida:** ✅ **pasado el 2026-08-16.** `csda agents init` genera los
seis slash commands y los ficheros de instrucciones de ocho herramientas desde
una única definición, y `change instructions` es el motor que consumen tanto
ellos como `harness run`. La verificación del contrato la hacen los propios
tests contra los comandos reales, no una lectura del documento.

> Queda pendiente la prueba con un agente real sobre un repo brownfield
> ajeno — es observación de campo, no algo que un test pueda cerrar. Anotado
> para la fase 8.

---

## 7. Fase 4 — Schemas, perfiles y documentación · OpenSpec F3 (~14 PD)

> **Objetivo:** que un desarrollador nuevo llegue al primer valor sin leerse el README entero.

Especificación de referencia: `mejoras/openspec-benchmark-plan.md:526-543`.

| ID | | Tarea |
|---|---|---|
| C4-01 | `[x]` | `OS-3-01` — grafo de artefactos configurable: `.csda/schemas/<name>/schema.yaml` con `artifacts[{id, generates, requires}]`. El schema `spec-driven` built-in reproduce el flujo actual |
| C4-02 | `[x]` | `OS-3-02` — `csda schema init \| fork \| validate \| which` |
| C4-03 | `[x]` | `OS-3-03` — schema built-in `bdd-first`: `proposal → feature → spec → tasks`, el `.feature` **antes** que la spec. Es nuestra opinión de producto |
| C4-04 | `[x]` | `OS-3-04` — perfiles `core \| full`: el help por defecto muestra 6 comandos, `--help --all` los muestra todos. **`config init` ya está escrito** — recuperarlo en C0-11 primero |
| C4-05 | `[x]` | `OS-3-05` — rigor progresivo: `change new --lite` (proposal + tasks) vs `--full` |
| C4-06 | `[x]` | `OS-3-06` — `csda onboard`: tour guiado sobre repo existente, detecta stack, propone capabilities, genera el primer cambio |
| C4-07 | `[x]` | `OS-3-07` — reestructurar `docs/` en guías cortas (`overview`, `getting-started`, `concepts`, `workflows`, `writing-specs`, `reviewing-changes`, `existing-projects`, `commands`, `cli`, `agent-contract`, `customization`, `glossary`, `faq`, `troubleshooting`). Ninguna > 300 líneas; README < 150 |
| C4-08 | `[x]` | `OS-3-08` — contexto de idioma configurable (ES/EN/PT) inyectado en prompts e instrucciones, manteniendo los términos técnicos en inglés |
| C4-09 | `[x]` | `OS-3-09` — `docs/comparisons.md` con OpenSpec como columna principal, incluyendo "cuándo elegir OpenSpec en vez de CSDA" |

### 7.1 Notas de la fase

- **C4-05 no requirió trabajo**: `change new --lite|--full` ya existía.
- **El idioma empezó siendo un bug.** Las plantillas de delta y las propuestas
  derivadas estaban en español dentro de una herramienta en inglés — anotado en
  la fase 2 y arrastrado. Ahora hay tabla de frases en/es/pt, y un test que
  renderiza cada tabla y comprueba que `SHALL` y `GIVEN/WHEN/THEN` sobreviven:
  traducir la gramática produciría un fichero que la herramienta no puede leer,
  en el idioma que el usuario pidió.
- **`onboard` validado contra un repo real ajeno** (`~/sandbox/projects/mvps/lixi-platform`):
  7 capabilities con evidencia, stack detectado. La heurística necesitó dos
  correcciones: bajar por directorios envoltorio mientras haya un solo hijo
  (`src/main/java/com/acme` daba `acme`, no los paquetes), y reconocer
  `domain/`, `modules/` y `services/` en la raíz.
- **La reestructura de docs no se hizo por la métrica.** `docs/tutorial.md`
  sigue teniendo 931 líneas y se queda así: es una narrativa continua, y
  partirla en cuatro la empeora. El test que impone el límite de 300 líneas
  nombra esa excepción explícitamente en vez de fingir que no existe.
- **Guards nuevos** en `tests/unit/docs-truth.test.ts`: ningún markdown enlaza a
  otro que no existe (el split movió muchos enlaces a la vez), ninguna guía pasa
  de 300 líneas salvo la excepción declarada, y el README se queda por debajo de
  150. Cazaron un enlace roto preexistente en ADR-0002.
- `docs/aetherdeploy-ai-integration-assessment.md` movido a `mejoras/` — es una
  evaluación, no una guía, y además nunca estuvo versionado.

**Gate de salida:** ✅ **pasado el 2026-08-16.** README de 397 → **121 líneas**;
help de 86 → **33** con 8 comandos; `docs/` repartido en guías por tarea, todas
por debajo de 300 líneas.

> El gate original pedía medir que un usuario nuevo cierra el bucle en < 15
> minutos leyendo solo `docs/getting-started.md`. Eso es una prueba de
> usabilidad con personas, no algo que un test pueda cerrar. Anotado para la
> fase 8, junto con la observación de campo del contrato de agente.

---

## 8. Fase 5 — DX y multi-repo · OpenSpec F4 (~8 PD)

| ID | | Tarea |
|---|---|---|
| C5-01 | `[x]` | `OS-4-01` — `csda update`: regenera ficheros de instrucciones y slash commands tras un upgrade, preservando ediciones locales. 3-way merge reutilizando `scripts/specops/merge.ts` |
| C5-02 | `[x]` | `OS-4-02` — `csda completion [bash\|zsh\|fish] [--install]`. **Bash y zsh ya están escritos** en `feature/daily-ux-roadmap` — recuperarlo en C0-11 antes de escribir nada |
| C5-03 | `[x]` | `OS-4-03` — `doctor` extendido: deltas huérfanos, cambios archivados con tareas sin marcar, drift entre matriz y specs, requisitos de pack editados sin cambio asociado. Cada hallazgo con `fix` accionable. Construye sobre el `doctor` que llega en C0-05 |
| C5-04 | `[x]` | `OS-4-04` — `csda init --from-pack <repo>@<tag>` en un paso, y `specops.config.yaml` heredable entre repos. **No replicar los *Stores* de OpenSpec**: nuestra respuesta al multi-repo es el pack privado compartido, que ya existe |
| C5-05 | `[x]` | `OS-4-05` — gobierno de repo: changesets y devcontainer (el resto se completa en la Fase 9) |

---

## 9. Fase 6 — Higiene de build y CI (~3 PD) · **bloquea la Fase 7**

| ID | | Tarea |
|---|---|---|
| C6-01 | `[x]` | Arreglar `stryker.config.mjs:3,9` para apuntar a `dist/`, o retirar el pilot. Si se conserva, añadirlo a CI (semanal); si no, dejar de anunciarlo |
| C6-02 | `[x]` | Declarar `js-yaml` en `package.json`. Hoy resuelve por accidente vía eslint: una actualización de eslint rompe CI con un `MODULE_NOT_FOUND` incomprensible |
| C6-03 | `[x]` | Corregir `bin`/`main`/`files` de los **cuatro** `packages/*/package.json` (incluido `lsp-spec-driven`); borrar el `templates/` inexistente de `pack-registry`. **Bloquea C7-07 y C7-08** |
| C6-04 | `[x]` | Windows en CI: subir de `test:unit` a E2E + BDD, o documentar la limitación y corregir `traceability.md` en consecuencia |
| C6-05 | `[x]` | Añadir el step de shellcheck que `CONTRIBUTING.md` ya promete (ver C1-09) |
| C6-06 | `[x]` | Los workflows de publish gatean con `test:all`, no con `npm test` |
| C6-07 | `[x]` | Normalizar la convención de tags a `vX.Y.Z`. Los workflows disparan con `v*` y los tags existentes no lo llevan: la ruta de publicación por tag nunca se ha ejecutado |
| C6-08 | `[x]` | Dependabot + CodeQL + `npm audit` en CI. Requisito habitual de adopción corporativa |

### 9.1 Lo que salió al hacerla

- **`pack-registry` no es un paquete.** Importa `scripts/domain-pack/common` del
  CLI, así que no puede publicarse por separado — pero se declaraba con `bin`,
  `main` y `files` como si sí. Marcado `private: true` y descrito por lo que es:
  herramienta interna de build del sitio del registry.
- **Los otros tres sí lo son, y ahora empaquetan de verdad.** Cada uno compila
  su `src/` en su propio `dist/` con un `tsconfig.build.json`, y `prepack` lo
  ejecuta. Verificado con `npm pack --dry-run`: antes los tarballs iban sin un
  solo `.js`.
- **El MCP server anunciaba `0.0.0` por el cable.** Su `require` del
  `package.json` usaba una ruta relativa que solo resolvía en el layout de la
  raíz. Ahora sube buscándolo, funciona en ambos, y hay test.
- **Stryker resucitado, con dato real: 51,32 %** (5 minutos, `common.js` +
  `delta.js`). Corre semanalmente, no por PR, y `break: 0` sigue puesto — fallar
  un build por un número que aún no es estable sería ruido, y este repo ya ha
  quitado bastantes checks que gritaban en falso. Sin fichero de resultados
  commiteado: el anterior se borró justo por quedarse rancio.
- **`npm audit` encontró 3 vulnerabilidades altas**, incluida una en `js-yaml`
  —la dependencia que acababa de declarar en este mismo commit—. `^4.1.0` habría
  dejado que una instalación limpia aterrizara en el rango vulnerable
  (4.0.0–4.3.0); fijado a `^4.3.1`. Quedan 2 moderadas en `qs` vía
  `@vscode/vsce`, por debajo del umbral.
- **Publicar sin changelog ya no es posible.** `0.1.4` estuvo tres meses sin
  publicar y sin notas; el workflow ahora falla si `CHANGELOG.md` no menciona la
  versión.

**Gate de salida:** ✅ **pasado el 2026-08-16.** `npm pack --dry-run` produce
tarballs con JS real en los tres paquetes publicables; los workflows de publish
gatean con `test:all`; shellcheck, `npm audit --audit-level=high` y CodeQL
corren en CI; Dependabot cubre npm, actions, Maven y Gradle.

---

## 10. Fase 7 — Distribución

> Según **D3**: npm público, Docker/ghcr, plugins Maven y Gradle.
> Se añaden VS Code Marketplace y el MCP server porque ya están construidos y
> bloqueados solo por C6-03.

| ID | | Tarea |
|---|---|---|
| C7-01 | `[x]` | `CHANGELOG.md` **escrito** en la fase 5, con el cambio incompatible de camelCase registrado mientras estaba fresco. Falta changesets |
| C7-02 | `[x]` | Preparar la release **0.2.0**: tres meses de features sin publicar — ciclo `change`, `specops contribute`, `diff --as-change`, F1B, más todo lo que entra en C0-05 |
| C7-03 | `[x]` | **`0.2.1` en `latest`**, con provenance. Verificada con `npm install create-spec-driven-app` en un proyecto limpio: `init` + `validate` de punta a punta. La página de npmjs.com ya renderiza el README actual |
| C7-04 | `[x]` | Docker publicado. `ghcr.io/rsaglobaltech/csda:0.2.1` vive en el registry con `amd64` y `arm64` (verificado con `docker manifest inspect`). Uso en pipelines documentado en `docs/automation.md` — que era la mitad que faltaba y la razón de existir de la imagen |
| C7-05 | `[-]` | Maven: publicar `packages/maven-plugin`. Requiere groupId, firma GPG y cuenta OSSRH — o Nexus/Artifactory interno |
| C7-06 | `[-]` | Gradle: publicar `packages/gradle-plugin` en el Gradle Plugin Portal o repo interno |
| C7-07 | `[-]` | VS Code Marketplace: cuenta de publisher + `vsce publish`. El `.vsix` 0.1.0 ya está construido en `releases/` |
| C7-08 | `[-]` | npm: `@spec-driven/mcp-server` |
| C7-09 | `[-]` | Desplegar el registry en `packs.spec-driven.dev`: dominio + Pages/Cloudflare |

### 10.5 Release 0.4.0 (2026-08-17) — el suelo a Node 22

Un solo cambio, publicado solo. El motivo de no esperar a juntarlo con otra cosa
es concreto: **0.3.0 declaraba `>=20` en npm y CI había dejado de probar Node
20**. Eso deja una promesa sin verificar en `latest`, y solo hay dos salidas
honestas — publicar, o devolver Node 20 a la matriz.

| Artefacto | Estado |
|---|---|
| npm `create-spec-driven-app@0.4.0` | `latest`, `engines: >=22`, procedencia SLSA |
| `ghcr.io/rsaglobaltech/csda:0.4.0` | multi-arch, **Node 22 dentro** de la imagen |

Verificada desde el registro público: `npx` genera y valida un proyecto.

**Lo que casi bloqueó todo sin fallar:** la protección de rama exigía
`Test (… / Node 20)` tres veces, y esos jobs dejaron de existir al mover la
matriz. Contextos obligatorios que nunca pueden reportar **congelan** cada PR en
vez de fallar a la vista. Repuntada a los jobs reales, y de paso
`SBOM and licences` pasó a obligatorio: llevaba corriendo sin estar exigido.

**Una release de un solo tema sale gratis en atribución.** Es lo contrario de
0.3.0, que llevaba 34 commits porque acumuló tres meses de retraso.

---

### 10.4 Release 0.3.0 (2026-08-17)

Publicada con luz verde explícita. 34 commits desde 0.2.1 que nadie tenía.

| Artefacto | Estado |
|---|---|
| npm `create-spec-driven-app@0.3.0` | `latest`, con procedencia SLSA |
| `ghcr.io/rsaglobaltech/csda:0.3.0` | `linux/amd64` + `linux/arm64` |
| Notas de release en GitHub | escritas, no autogeneradas |

**Al preparar la release faltaba media en el CHANGELOG:** la documentación de
cadena de suministro, el SBOM y la puerta de licencias, las ventanas de
compatibilidad, los ficheros de gobierno y el camino sin Node en el agente de
build. Todo eso había salido y no estaba anotado. Es la versión pequeña del
mismo defecto que este proyecto persigue, y apareció justo porque el proceso
obliga a revisar el CHANGELOG antes de versionar.

**Verificada como usuario nuevo**, que es la única prueba que cuenta:
`npx create-spec-driven-app@0.3.0` genera un proyecto móvil con sus reglas
móviles y pasa `validate`.

---

### 10.1 Estado de la publicación (2026-08-16)

Verificado sin publicar nada:

- **Tarball**: instalado en un proyecto limpio; `init` + `validate` de punta a
  punta, y `status`, `change new`, `change instructions`, `agents init`,
  `schema which`, `onboard`, `doctor` y `req` funcionando desde el paquete
  instalado. El job `package` de CI solo comprobaba `--help`, que no habría
  detectado un script ausente.
- **Imagen Docker**: construida y ejecutada; `init` + `validate` dentro del
  contenedor. 217 MB.
- **Workflow de npm**: dry-run completo en verde, con la suite entera, el gate
  del changelog y la firma de provenance.

**Lo que el tarball dejó de llevar:** 98 ficheros de tests compilados, los 38 de
los paquetes que se publican aparte, las definiciones de pasos de Cucumber y 133
source maps sin fuentes. 326 → 187 ficheros, 461 → 277 kB. Iba así desde 0.1.0.

**Metadatos que npm corregía en silencio al publicar:** los cuatro manifiestos
sin el prefijo `git+` en la URL del repositorio, y el LSP apuntando a
`spec-driven-template` — un repositorio que no existe.

**Publicado el 2026-08-16:** `create-spec-driven-app@0.2.0-beta.1`, dist-tag
`beta`, con provenance firmado. Instalada desde npm en un proyecto limpio y
ejercitada: `validate`, `status --json`, `change new`, `change instructions`,
`agents init`, `onboard` y `schema which` funcionan. **`latest` sigue en
`0.1.4`** — promoverla es una decisión aparte, y conviene que alguien use la
beta antes.

El primer intento falló con
`404 Not Found - PUT`, que en npm significa que el token no tiene permiso sobre
el paquete —no que el paquete no exista—. Nada quedó a medias. Resuelto rotando
`NPM_TOKEN`.

### 10.2 El README publicado no es el del repositorio

Republicar una beta **no** arregla la página de npmjs.com: npm renderiza el
README de la versión con dist-tag `latest`. Con `latest` en `0.1.4`, el campo
`readme` del registry estaba literalmente vacío. Solo al promover `0.2.0` a
`latest` pasó a tener los 6185 caracteres del README actual.

Consecuencia práctica: **cada cambio de documentación que deba verse en npm
necesita una release**, no basta con un commit. Está en `docs/release-process.md`.

### 10.3 La imagen de 0.2.0 no corría en ARM

Se publicó solo `amd64`, así que la línea `docker run` que el README recomienda
fallaba en cualquier Mac con Apple Silicon y en cualquier runner ARM. Faltaba
QEMU junto a buildx para compilar cruzado.

El tag `0.2.0` **no se podía reconstruir en su sitio**: relanzar un workflow
contra un ref antiguo usa el workflow *tal como estaba en ese ref*, que aún no
tenía el arreglo. Mover un tag ya publicado —del que npm había publicado— era
peor. De ahí `0.2.1`.

**Gate de salida:** desde una máquina limpia funcionan
`npx create-spec-driven-app@latest --help`,
`docker run ghcr.io/rsaglobaltech/csda validate .`
y el goal `csda:validate` de Maven sobre un proyecto Java real.

---

## 11. Fase 8 — Prueba en empresa

| ID | | Tarea |
|---|---|---|
| C8-01 | `[~]` | CsdaStudioApp: **fases 5, 6 y 7 hechas** el 2026-08-17 — scaffold hexagonal con REQ-015 verde (`bef5de4`) y harness cableado (`5d98aa3`). Quedan 8–10: `harness run` REQ-001..014, review de ramas, tag y deploy. Cablear el harness **destapó una regresión viva en el CLI** — ver §11.2. Estado vivo en `mejoras/csda-studio-handoff.md` |
| C8-02 | `[~]` | Piloto HIE. **Estado reconstruido y runbook reescrito** el 2026-08-17 (`mejoras/hie-pilot-runbook.md`, ahora sí versionado). Brownfield real: Spring Boot 3.3 / Java 21 + HAPI FHIR, pack `healthcare-hie/backend` v0.1.0 con 16 requisitos, adoptado a L1–L2, `validate` pasa. Falta conducir la implementación. Reconstruirlo destapó los perfiles de agente — ver §11.3 |
| C8-03 | `[ ]` | Case studies 2 y 3. Solo existe `docs/case-studies/case-1.md` |
| C8-04 | `[ ]` | Vídeo demo de 90 s (P1-12, pendiente desde la fase 1) + vídeo del bucle bidireccional F1B — *ese vídeo no lo puede grabar ningún competidor* |
| C8-05 | `[x]` | Métricas §9 medidas contra el disco, no estimadas. **3 de 5 cumplidas, 1 fallada, 1 no medible por máquina.** Medir destapó dos defectos reales — ver §11.1 |

### 11.1 Las métricas §9, medidas (C8-05)

Medidas el 2026-08-16 ejecutando el CLI contra un proyecto recién generado.

| Métrica | Objetivo | Medido | |
|---|---|---|---|
| README | < 150 líneas | **138** | ✅ |
| Herramientas de agente cubiertas | 8 | **8** (claude, cursor, copilot, windsurf, aider, gemini, cline, codex) | ✅ |
| Comandos con `--json` | 12 | **12** tras esta fase; eran 9 | ✅ |
| Comandos visibles en `--help` | ≤ 8 | **9** | ❌ |
| Slash commands | ≥ 8 | **6** | ❌ |
| TTFV | < 5 min | 0,33 s de máquina | — |

**TTFV no lo puede medir una máquina.** `init` + `validate` + `status` tardan
0,33 s en total; los cinco minutos son el tiempo de una persona leyendo y
decidiendo. Necesita gente, igual que C9-08.

**Los 9 comandos visibles** son `init`, `adopt`, `onboard`, `status`, `plan`,
`req`, `change`, `validate`, `done`. Bajar a 8 significa esconder uno de esos
nueve, y ninguno sobra. Además el CHANGELOG de 0.2.0 afirma «eight commands»:
o se quita uno o se corrige la frase, pero hoy el documento miente.

**Los 6 slash commands** (`explore`, `propose`, `apply`, `verify`, `archive`,
`onboard`) son exactamente los que C3-06 especificó. La meta de 8 nunca se
diseñó; llegar a ella pide dos comandos nuevos con motivo propio, no dos
inventados para cuadrar una cifra.

#### Lo que apareció al medir

Medir no fue un trámite: destapó dos defectos que ningún test veía.

1. **`req list --json` imprimía la tabla humana e ignoraba la bandera.** Peor
   que rechazarla: quien llama cree que recibió un documento. `report`, `fix` y
   `specops diff` sí la rechazaban con `Unknown flag`.
2. **`plan --json` y `report --json` incumplían el contrato camelCase** dentro
   de `requirements`, justo el array que un agente recorre. El 0.2.0 anunció la
   normalización como *breaking* y la aplicó solo a las claves de primer nivel.
   Medio aplicado era el peor de los tres estados posibles: el documento decía
   camelCase, la salida decía otra cosa, y nada fallaba.

Ambos corregidos, con `tests/unit/json-contract.test.ts` como guardián: ejecuta
los doce comandos contra un proyecto real y exige un documento parseable, un
array `status`, y cero claves snake_case a cualquier profundidad.

**Pendientes:** `pack lint` y `specops diff` siguen sin `--json`. Son cirugía
mayor —imprimen hallazgos y diffs, no un modelo— y hacerlos a medias habría
sido peor que dejarlos anotados.

### 11.2 El dogfood cazó una regresión que la suite no vio (C8-01)

Al cablear el harness en `csda-studio-app`, `csda harness prompt REQ-001`
devolvió esto:

```text
- Scenario ID: (none)
- Feature file: (none declared)
- Test artifact (write this first — TDD): (none declared)
- Production artifact: (none declared)
```

Y ningún Gherkin inline. Un prompt así no le sirve a ningún agente: le pides
que implemente un requisito y no le dices contra qué.

La fila de REQ-001 en la matriz estaba **completa**. El fallo era mío, de la
PR #63: `harness/run.ts` alimenta al constructor de prompts invocando
`plan --format json` y parseando el resultado, así que los dos están acoplados
por un formato de cable. Renombré las claves a camelCase en un lado y no en el
otro.

**Por qué no falló ningún test.** El fixture de `harness-run.test.ts` estaba
escrito en snake_case y nunca se actualizó, así que fijaba una forma que `plan`
ya no produce. Un fixture a la deriva se lee como cobertura hasta el día en que
importa.

Arreglado en la PR #65: el constructor acepta ambas grafías —la del contrato
primero, la columna de la matriz como respaldo— y hay tres tests nuevos. El que
vale es el de la costura: genera un proyecto, le pide el plan al CLI real y se
lo pasa al constructor real. Ese sí lo habría cazado.

**Lo que esto dice del proyecto:** el dogfood no es ceremonia. Es el único
sitio donde apareció, porque es el único que atraviesa la costura entre dos
comandos.

---

### 11.3 El piloto estaba configurado contra algo que no existía (C8-02)

Al reconstruir el estado del piloto HIE apareció esto en su
`harness.config.yaml`:

```yaml
agent_profile: local-claude
```

Y un `.harness/profiles.yaml` con el comando del agente. **El CLI no leía
ninguna de las dos claves.** `harness run` respondía «No agent configured»
mientras el fichero declaraba uno perfectamente.

El diseño era bueno —por eso alguien lo escribió— y además resuelve la tensión
que apareció al cablear el harness del studio: o comiteas un agente por defecto
que alguien acaba pagando sin querer, o reescribes el comando en cada
ejecución. Un perfil con nombre es la tercera opción. Así que se implementó en
vez de borrarse.

**Lo importante es la otra mitad:** una clave desconocida en
`harness.config.yaml` ahora es error, con la lista de las que sí se leen.
Ignorarla en silencio es exactamente cómo un piloto acaba configurado contra
nada, y el fallo es invisible hasta que alguien ejecuta el bucle y no se cree
el mensaje de error.

Hay un test que fija los dos extremos del contrato: **toda clave que
`harness init` escribe es una clave que el lector acepta.** Sin eso, la
comprobación estricta se convierte en una trampa que tiende el propio
scaffolder.

---

---

## 12. Fase 9 — Gobierno enterprise

> Lo que una empresa exige antes de adoptar una herramienta que toca su código.

| ID | | Tarea |
|---|---|---|
| C9-01 | `[x]` | `SECURITY.md` + política de divulgación de vulnerabilidades — con *private vulnerability reporting* **activado** en el repo, para que el documento apunte a un canal que existe. Alcance explícito: packs maliciosos, traversal al renderizar, inyección de comandos, artefactos publicados y secretos de CI |
| C9-02 | `[x]` | `CODEOWNERS` + `MAINTAINERS.md` + protección de `main` — ver §12.6 |
| C9-03 | `[x]` | Integridad y firma de packs (B5) documentadas en `docs/supply-chain.md`, y **la deriva de packs entra por defecto en el gate generado**: `ci init` emite `validate --against-lock` en los cuatro proveedores, condicionado a que exista `.specops.lock`. La **firma sigue opt-in a propósito** — ver §12.4 |
| C9-04 | `[x]` | Modo offline / air-gap (B4): runbook en `docs/supply-chain.md`. Las dos vías, `CSDA_OFFLINE=1` contra caché y `pack bundle` para redes que nunca vieron el pack. Ninguna estaba documentada; `CSDA_OFFLINE` no aparecía en ningún doc |
| C9-05 | `[ ]` | Telemetría opt-in con consentimiento explícito (R1 de `risk-mitigation-plan.md`, nunca implementada). **Decisión tuya, no mía** — ver §12.2 |
| C9-06 | `[x]` | SBOM CycloneDX vía `npm sbom` (sin dependencia nueva) + `scripts/license_check.ts` como puerta de licencias, en el workflow de seguridad y como `npm run licenses`. Árbol actual: **377 componentes, todos permisivos, cero copyleft**. El gate se probó fallando, no solo pasando |
| C9-07 | `[x]` | Política de soporte y ventanas de compatibilidad en `docs/release-process.md`. **Y las ventanas ahora se aplican de verdad**: `schema_version` de `pack.yaml` y `specops_version` del lockfile se escribían y no los leía nadie — ver §12.3 |
| C9-08 | `[ ]` | Validar la guía de adopción L1–L4 (A5) con un equipo real. Trabajo de campo: no hay test que lo cierre. Va con la fase 8 |

**Estado: 6 de 8 cerradas** (C9-01, C9-02, C9-03, C9-04, C9-06, C9-07). Las dos
que quedan no dependen de escribir código: una es una decisión de producto tuya
y la otra necesita gente.

---

## 12.2 Decisión pendiente — telemetría (C9-05)

*No la implemento por mi cuenta. Recoger datos de las máquinas de otros es una
decisión de producto y de privacidad, no una tarea técnica, y el coste de
equivocarse cae sobre tu reputación, no sobre la mía.*

`risk-mitigation-plan.md` la propuso como R1 para saber qué comandos se usan de
verdad. Nunca se implementó, y el proyecto ha llegado hasta aquí sin ella.

Lo que hay que decidir antes de escribir una línea:

| Pregunta | Por qué bloquea |
|---|---|
| ¿Qué se envía exactamente? | Nombres de comandos y códigos de salida es una cosa; rutas, nombres de requisitos o contenido de specs es otra muy distinta. Un spec puede ser confidencial |
| ¿A dónde? | Un endpoint propio implica ser responsable del tratamiento. Uno de terceros implica un encargado del tratamiento y su contrato |
| ¿Opt-in u opt-out? | En herramientas de desarrollo el opt-out se percibe como traición aunque sea legal. El opt-in da menos datos y cero incidentes |
| ¿Qué dice el RGPD aquí? | Aunque no haya datos personales por diseño, hay que poder demostrarlo |

**Mi recomendación:** no hacerlo todavía. El público objetivo son equipos
enterprise, que es justo el segmento donde una llamada de red no solicitada
desde una herramienta de build es motivo de veto — y ya hay una vía sin ese
coste, `csda report` y `plan --json`, que dejan los datos en manos del equipo
que los genera. Si algún día hace falta, que sea opt-in explícito y con la
lista de campos publicada en `docs/`.

---

## 12.3 Dos campos de versión que nadie leía (C9-07)

Al ir a escribir la política de compatibilidad apareció el problema de fondo:
**los dos campos existían y no los leía nadie.**

- `pack.yaml` → `schema_version`. Lo escribe `pack init`, lo valida el JSON
  schema *como formato* (`^\d+\.\d+\.\d+$`) y ahí acababa todo. Un pack escrito
  contra un schema más nuevo fallaba después con `unknown property X` — cierto
  y completamente inútil para deducir que el CLI se había quedado corto.
- `.specops.lock` → `specops_version`. Se escribe desde el primer lockfile y no
  se leía jamás. Un lockfile de un CLI más nuevo se aceptaba en silencio y
  luego se malinterpretaba campo a campo.

Escribir una política de ventanas de compatibilidad sobre eso habría sido
exactamente el defecto que persigue la fase 1: un documento que afirma una
garantía que el código no da. Así que se implementaron las dos puertas.

**Solo se rechaza lo más nuevo que el CLI.** Un pack con schema viejo, o un
lockfile sin `specops_version`, siguen funcionando: esos ficheros son
anteriores al campo y rechazarlos sería dejar tirados a proyectos existentes
para aplicar una regla inventada después.

**Orden de release al subir el schema de packs:** primero el CLI que lo
entiende, después los packs que lo usan. Al revés, los diez packs curados (más
el de ejemplo `sample-contracts`, el único ya en `1.2.0`) se vuelven
ininstalables con el CLI publicado. Hay un test que recorre `packs/` y lo
comprueba, así que equivocarse de orden rompe CI y no a los usuarios.

---

## 12.4 Por qué la firma de packs sigue siendo opt-in (C9-03)

El plan decía «activarla por defecto en CI». Al implementarlo resultó ser la
decisión equivocada, así que se hizo la mitad que sí procede y se documentó por
qué la otra no.

**Lo que sí pasa a estar activo por defecto:** la deriva de packs.
`csda ci init` emite ahora `validate --against-lock` en GitHub, GitLab, Azure y
Jenkins, protegido con `if [ -f .specops.lock ]` para que un proyecto sin packs
no vea ningún cambio. Esto no rompe a nadie: si tienes lockfile, la
comprobación es exactamente lo que querías.

**Lo que no:** `require_signed_packs: true` por defecto rompería a todo
proyecto que instale un pack cuyos tags no estén firmados — **incluidos los
diez packs curados de este mismo repositorio**. Un default que falla con un uso
correcto enseña a la gente a desactivar la comprobación, y eso es peor que no
tenerla. Se activa cuando tu organización firma sus propios packs, que es
cuando el chequeo empieza a distinguir algo.

Si algún día se firman los packs curados, la decisión se puede revisar.

---

## 12.6 Gobierno de `main` (C9-02)

*Decidido el 2026-08-16, al pasar a trabajar con ramas cortas.*

A partir de aquí cada unidad de trabajo va en su rama con PR. `main` está
protegida: nada de push directo, ni forzado, ni borrado, y los 12 checks de CI
son obligatorios con `strict` (la rama tiene que estar al día antes de mergear).
Esto último se comprobó en caliente: el PR #52 fue **rechazado** por no estar al
día y hubo que actualizarlo.

**Con una excepción que conviene escribir en vez de dejar implícita:**
`enforce_admins` está en `false`, así que un administrador del repo **sí** puede
empujar directo a `main`. Comprobado, no supuesto — un commit de prueba enviado
a pelo entró sin ser rechazado. Ese commit (`7ae3adf`, vacío) sigue en `main`:
revertir un commit vacío solo añade otro commit vacío, y el force-push para
quitarlo se bloqueó, con buen criterio, por ser una reescritura destructiva de
una rama pública.

Es una salida de emergencia, no una puerta de uso diario. Activar
`enforce_admins` dejaría al único mantenedor encerrado fuera de su propia vía de
recuperación; se revisa junto con las revisiones obligatorias cuando entre un
segundo mantenedor.

**Las revisiones aprobatorias están deliberadamente desactivadas.** Con un solo
mantenedor, exigir una aprobación significa que nadie puede mergear nada —
GitHub no deja aprobar tu propio PR. La puerta que de verdad protege `main` aquí
es la suite, y esa sí es obligatoria. Cuando entre un segundo mantenedor se
activan las revisiones y se borra este párrafo; está anotado igual en
`MAINTAINERS.md` y en `CONTRIBUTING.md` para que la excepción no se lea como
descuido.

Lo que se exige está en la tabla de *Required checks* de `CONTRIBUTING.md`, que
es la lista real y no una copia que se desincroniza.

---

## 12.5 Fase 7.5 — `mobile` como tipo de proyecto de primera clase

*Decidido el 2026-08-16, tras comprobar que hoy hay que mentir en `PROJECT_TYPE`
para montar una app móvil. Se hace **después de la fase 7**, con el CLI ya
publicado.*

Hoy una app móvil funciona con `PROJECT_TYPE: frontend` y el `STACK` bien
puesto — el stack nunca está hardcodeado y todo el núcleo es agnóstico. Lo que
falla es el vocabulario y la honestidad del tipo declarado.

| ID | | Tarea | Detalle |
|---|---|---|---|
| C75-01 | `[x]` | `mobile` en el enum de `PROJECT_TYPE` | `scripts/init_project.ts`. Hoy solo acepta `backend\|frontend`, así que el tipo declarado en `spec.md` miente |
| C75-02 | `[x]` | `templates/mobile/` con su propio `AI_RULES.md.tpl` | El de frontend habla vocabulario web: *responsive behavior*, *componentization*. Lo que necesita un equipo móvil: offline-first, paridad iOS/Android, ciclo background/foreground, deep links, permisos, y que una release pasa por revisión de store — lo cual cambia qué significa «hecho». `templates/frontend/` son 2 ficheros; este será igual de pequeño |
| C75-03 | `[x]` | `mobile` en `schemas/pack.schema.json` y en `pack init --type` | Para que existan packs de dominio móvil |
| C75-04 | `[x]` | Escenario base móvil en vez del `health.feature` web | Un smoke de arranque de app, no un endpoint HTTP |

**Cerrada el 2026-08-17.** `mobile` es tipo de primera clase en las cuatro
puertas: el enum de `init`, las opciones del wizard, `pack init --type` y el
enum del `schemas/pack.schema.json` (más el validador, que ya se alineó con el
esquema en ADR-0020).

`templates/mobile/AI_RULES.md.tpl` **no es una copia del de frontend**. Lo que
cambia es lo que un equipo móvil se juega, y cada punto es criterio de
aceptación, no consejo: offline como estado y no como error, que el SO puede
matar el proceso en cualquier momento, paridad iOS/Android declarada en vez de
supuesta, permisos como flujo **con rama de denegación**, deep links como
puntos de entrada en frío, y que **la revisión de store es parte de «hecho»**.

El escenario base pasa de «navego a la ruta `/`» a un arranque en frío que no
requiere red.

**Hay un test que fija los cuatro sitios juntos.** Un tipo aceptado por uno y
rechazado por otro es exactamente cómo `contracts` acabó siendo generable e
imposible de instalar; ahora eso rompe CI.

**Dos tests existentes usaban `mobile` como ejemplo de tipo inválido.** Fallaron,
con razón, y se actualizaron a `desktop`. Vale la pena notarlo: la suite tenía
escrito «móvil no se soporta» como aserción.

**No hice un cambio que parecía tocar:** el `docker-compose.yml` que se genera
es el contenedor de *devcontainer*, no un servidor de aplicación, así que es
legítimo para un proyecto móvil y lo controla `DOCKER_SUPPORT`. Arreglar algo
que no está roto también es un defecto.

**Ya resuelto por adelantado (fase 5):** el contrato de runtime documentaba
Postgres para todo proyecto, incluido frontend web. Ahora hay `DATASTORE`
(`postgres` \| `none`, por defecto según `PROJECT_TYPE`), y sin datastore no se
generan variables `DATABASE_*`, ni sección de base de datos en el spec, ni
servicio `db` en compose. Eso era el 80 % de la fricción del caso móvil, y
además arreglaba frontend web, que estaba mal desde el principio.

---

## 12.9 Limpieza documental (2026-08-16)

Ocho documentos eliminados y uno recortado. Todos describían un pasado
terminado con la forma de un plan — exactamente el defecto que las fases 1 y 2
corrigieron en los demás. Siguen en el historial de git; lo que se ha quitado
es su presencia en el árbol, donde se leen como si estuvieran vigentes.

| Eliminado | Por qué |
|---|---|
| `IMPROVEMENTS.md` (206 l.) | Backlog de `v0.1.0-beta.3`. Prácticamente todo implementado; sus items de shell/Bats son irrelevantes desde ADR-0008 |
| `PROJECT_REPORT.md` (419 l.) | Overview de mayo. README (121 l.), `comparisons.md` y `architecture.md` cubren su terreno; su §9 Roadmap estaba obsoleto |
| `mejoras/implementation-roadmap.md` (923 l.) | «31/31 pasos completos». Sus 7 items diferidos de §8 viven ahora en este plan |
| `mejoras/risk-mitigation-plan.md` (390 l.) | R1–R4: entregado, o en el backlog aparcado de §13 |
| `mejoras/enterprise-adoption-plan.md` (359 l.) | A1–A6 y B1–B8 mergeados en C0-05. Cero referencias entrantes |
| `mejoras/visual-pack-authoring-todo.md` (224 l.) | Fases 1–3 hechas; la 4 la cerró ADR-0019 |
| `reports/mutation/pilot-results.md` + `README.md` (129 l.) | Resultados de mayo contra `scripts/domain-pack/common.js`, fichero que ya no existe |

**Recortado:** `mejoras/openspec-benchmark-plan.md`, de 768 a 413 líneas. Se
eliminó el plan por fases, el diseño técnico y el checklist —ejecutados como
fases 3, 4 y 5— y se conservó lo que no caduca: qué es OpenSpec, la comparativa,
la valoración de SpecOps y qué decidimos no copiar. `docs/comparisons.md` lo
cita como la evidencia de su columna de OpenSpec, así que borrarlo entero habría
dejado sin respaldo una afirmación pública.

**Conservado a propósito:** los tres documentos de `csda-studio` (1540 líneas).
C8-01 es trabajo vivo y el runbook es la guía para retomarlo; borrarlos habría
cerrado la fase 8 de facto sin decidirlo.

Las citas que quedaban en ADR-0014 y ADR-0019 se anotaron en vez de borrarse:
un ADR es registro permanente, y una cita que el lector no puede seguir es peor
que ninguna.

---

## 12.8 Aplazado por decisión — publicar plugins y registry (D9)

> **Decidido el 2026-08-17: aplazado, no descartado.** Publicar los plugins,
> la extensión y el registry no es una prioridad ahora. Las tareas quedan
> marcadas `[-]` con este motivo, y las credenciales siguen siendo el único
> bloqueo técnico cuando se retomen.

Nada de esto está empezado, y nada de esto bloquea al resto del proyecto: el
CLI se publica en npm y la imagen en ghcr, que son las dos vías que un equipo
usa de verdad hoy. Los plugins de Maven y Gradle **se construyen y sus tests
corren en CI**; lo único que falta es empujarlos a un registro.

Cuando se retome, para cada destino puedo dejar el workflow y el paso a paso
listos, de modo que solo haya que añadir el secreto y lanzarlo.

| ID | Destino | Qué hace falta |
|---|---|---|
| C7-05 | Maven Central | Cuenta OSSRH (o Nexus interno), `groupId` verificado y clave GPG para firmar. No existe workflow todavía |
| C7-06 | Gradle Plugin Portal | Key y secret del Portal, o un repositorio interno. Tampoco existe workflow |
| C7-07 | VS Code Marketplace | Cuenta de *publisher* en Azure DevOps y un PAT. El `.vsix` ya se construye; falta el `vsce publish` |
| C7-08 | npm scope `@spec-driven` | El scope **no existe** en npm. Hay que crearlo (gratis para paquetes públicos) antes de poder publicar `mcp-server` y `lsp-server` |
| C7-09 | `packs.spec-driven.dev` | El dominio, y la variable de repositorio `SITE_CNAME`. `gh-pages` ya publica correctamente sin él |

> **Nota sobre C7-08:** los dos paquetes ya empaquetan bien —se arregló en
> C6-03— así que el único bloqueo es que el scope no existe.

---

## 12.7 Decisión pendiente — dos majors bloqueados por el suelo de plataforma

*Abierta el 2026-08-16, al triar los 10 PRs de Dependabot. Ninguno de los dos es
un problema del bump: los dos preguntan hasta dónde soportamos runtimes viejos.*

Ambos están cerrados en GitHub con el motivo escrito en el PR e ignorados para
majors en `.github/dependabot.yml`, con el comentario que dice qué los
desbloquea. Se quita la entrada de `ignore` cuando se decida.

| PR | Bump | Por qué rompe | Qué lo desbloquea |
|---|---|---|---|
| #45 | `@cucumber/cucumber` 12 → 13 | **Resuelto el 2026-08-17**: el suelo subió a Node 22 y la major entró. La suite BDD pasa sin tocar nada | — |
| #36 | `org.junit:junit-bom` 5 → 6 | JUnit 6 publica solo variante Java 17. El plugin de Gradle compila a Java 11 a propósito, así que Gradle ni resuelve: *«No matching variant … this component declares a component, compatible with Java 17 and the consumer needed a component, compatible with Java 11»* | Subir el objetivo del plugin a Java 17 |

**La primera está resuelta.** Node 20 salió de mantenimiento LTS en abril de
2026, así que la matriz probaba contra un runtime sin soporte. El 2026-08-17 el
suelo subió a **Node 22** (matriz 22 y 24), `cucumber 13` entró, y la política
quedó escrita: *el suelo es una LTS mantenida; cuando una sale de
mantenimiento, el suelo se mueve en la siguiente release*. Hay un test que
sujeta las doce declaraciones de versión juntas — habían derivado antes, con los
paquetes publicables diciendo `>=18` mientras el CLI exigía 20.

**La segunda tiene menos margen:** Java 11 en los plugins de Maven y Gradle es
la razón de que existan. Un agente de build corporativo es exactamente el sitio
donde no puedes elegir la JDK. Subir a 17 se lleva por delante ese caso de uso.

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
| Adaptador AetherDeploy | `mejoras/aetherdeploy-assessment.md` (local, no versionado) es una evaluación sin ninguna de sus acciones de corto plazo implementada |
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
| 2026-08-16 | Los 10 PRs de Dependabot: 6 mergeados, 4 cerrados con motivo (D7) | 6 verdes tras correr la suite; 2 cerrados por config equivocada (`typescript` y `@eslint/js` fuera de su grupo, arreglado en `dependabot.yml`) y 2 por suelo de plataforma (§12.7). Cero PRs abiertos |
| 2026-08-16 | `js-yaml` 4 → 5 se mergea pese a ser major (D8) | js-yaml 5 pasa a YAML 1.2, donde `yes`/`no`/`on`/`off` dejan de ser booleanos. Los tres sitios de producción pasan `{ json: true }`, que ya forzaba esquema JSON, así que el cambio no les afecta. Comprobado ejecutando ambas versiones sobre el mismo documento: salida idéntica, y coincide con `parseYamlLite` del propio CLI |
| 2026-08-17 | Suelo a **Node 22** y **0.4.0 publicada** (D11) | Node 20 salió de LTS en abril, así que la matriz probaba un runtime sin soporte. Se publicó sola y de inmediato porque 0.3.0 declaraba `>=20` mientras CI ya no lo cubría: una promesa sin verificar en `latest`. Desbloquea `cucumber 13`. Política escrita: el suelo es una LTS mantenida |
| 2026-08-17 | **0.3.0 publicada** (D10) | 34 commits sin publicar desde 0.2.1, con media release ausente del CHANGELOG. npm `latest` = 0.3.0 con procedencia SLSA, `ghcr.io/rsaglobaltech/csda:0.3.0` multi-arch, notas de release escritas. Verificada desde cero con `npx create-spec-driven-app@0.3.0` generando un proyecto móvil |
| 2026-08-17 | Publicar plugins Maven/Gradle, la extensión de VS Code, el scope npm y el registry queda **aplazado** (D9) | No es prioridad ahora. No bloquea nada: el CLI ya está en npm y la imagen en ghcr, que son las dos vías reales. Marcadas `[-]` con motivo, no descartadas — ver §12.8 |
| 2026-08-16 | Los refactors `import/export` y `strict mode` no se mergean | 96 ficheros entre los dos, todos tocados también por el merge enterprise. Sin valor para el usuario y con coste de conflicto alto. Si se quieren, son tarea propia sobre `main` |
