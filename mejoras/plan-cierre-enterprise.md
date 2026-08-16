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

### 2.1 Ramas

| Rama | Commits únicos vs `main` | Acción |
|---|---|---|
| `feat/change-lifecycle` (HEAD) | 4 | mergear — `main` es ancestro, fast-forward |
| `origin/feature/enterprise-adoption` | 19 | mergear — base de merge = `main`, ya es TypeScript |
| `origin/feat/csda-agent` | 4 | archivar (D2) |
| `origin/feat/agent-cli` | 3 | archivar (D2) |
| `origin/codex/runtime-env-docker-devcontainer` | 1 | evaluar o archivar |
| `feature/typescript-migration` · `feature/sdd-ddd-lite-evolution` · `feat/specops-conflict-detection` | 0 | podar, ya están en `main` |
| `origin/develop` | 1 único, 136 detrás | resincronizar desde `main` o eliminar |

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
| 3 | Los tres `packages/*/package.json` apuntan `bin`/`main`/`files` a `src/*.js`, que nunca existe — la salida va al `dist/` de raíz. Publicarlos hoy enviaría paquetes vacíos. `pack-registry` además lista un `templates/` inexistente | `packages/*/package.json` |
| 4 | Afirma que shellcheck corre en CI; no existe tal step | `CONTRIBUTING.md:119` |
| 5 | Los workflows de publish disparan con tags `v*`, pero los tags existentes son `0.1.4` y `0.1.0-beta.1` (sin `v`) → **nunca han disparado** | `.github/workflows/publish-*.yml` |
| 6 | Los workflows de publish gatean con `npm test` (37 tests E2E), no con `test:all` | idem |
| 7 | No existe `CHANGELOG.md`. `RELEASE_0.1.0_CHECKLIST.md` está congelado en 0.1.0, todo sin marcar, y dice Node ≥18 cuando el paquete exige ≥20 | raíz |
| 8 | Windows en CI solo corre `test:unit` — la "cross-OS matrix" que `traceability.md` da por cerrada lo está a medias | `.github/workflows/ci.yml` |
| 9 | **La landing está rota:** `docs/index.html:393` carga `./app.js`, borrado sin commit | `docs/index.html`, `docs/app.js` |
| 10 | Árbol local sucio: `packages/gradle-plugin/{.gradle,build,gradle}` sin versionar (colisiona con el árbol de la rama enterprise), `dist/packages/csda-agent/` con salida huérfana de código ya borrado, `coverage/` con informes pre-migración | working tree |
| 11 | `dist/` no tiene `scripts/change/` → `csda change` falla con exit 3 hasta reconstruir | working tree |

---

## 3. Fase 0 — Consolidar el árbol (~2 PD)

> **Objetivo:** una sola línea de trabajo, verde, sin residuos.

| ID | | Tarea | Detalle |
|---|---|---|---|
| C0-01 | `[ ]` | Limpiar residuo local **antes** de mergear | `packages/gradle-plugin/{.gradle,build,gradle}` sin versionar colisiona con el árbol de la rama enterprise. Borrar y añadir `.gradle/` y `build/` al `.gitignore` |
| C0-02 | `[ ]` | Arreglar la landing | `docs/app.js` está borrado sin commit pero `docs/index.html:393` lo carga. Restaurar el fichero (`git checkout -- docs/app.js`) o quitar el `<script>`. La landing está publicada en Pages: es un bug en producción |
| C0-03 | `[ ]` | Confirmar el borrado de `mejoras/agent-cli-plan.md` | Coherente con D2. Commitear el borrado |
| C0-04 | `[ ]` | `feat/change-lifecycle` → `main` | Fast-forward, 4 commits |
| C0-05 | `[ ]` | `feature/enterprise-adoption` → `main` | Conflicto único conocido: `bin/create-spec-driven-app.ts`. Fusionar ambas tablas de dispatch y ambos `usage()`: los 9 comandos actuales + `adopt`, `doctor`, `alm`, `ci`, `report` |
| C0-06 | `[ ]` | Reconstruir limpio | `rm -rf dist coverage && npm ci && npm run build` |
| C0-07 | `[ ]` | Podar y archivar ramas | Ver §2.1. Archivar `feat/agent-cli` y `feat/csda-agent` como tags `archive/agent-cli` y `archive/csda-agent` **antes** de borrar las ramas |
| C0-08 | `[ ]` | Decidir `develop` | Está 136 commits detrás de `main` con 1 commit único. O se resincroniza, o se elimina y `main` pasa a ser la única línea. Anotar la decisión en §12 |

**Gate de salida:**

```bash
npm run verify && npm run test:all      # verde sobre main
git status --porcelain                  # vacío
node bin/create-spec-driven-app.js --help | grep -c .   # 14 comandos listados
node bin/create-spec-driven-app.js change list          # responde, no exit 3
```

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
| C3-02 | `[ ]` | `--json` en los 12 comandos aptos para agente: un documento en stdout, prosa a stderr, null-shape en fallo. Test: `cmd --json 2>/dev/null \| jq .` parsea en éxito y en fallo | hoy solo `change` y `plan --format json` |
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
| C4-04 | `[ ]` | `OS-3-04` — perfiles `core \| full`: el help por defecto muestra 6 comandos, `--help --all` los muestra todos |
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
| C5-02 | `[ ]` | `OS-4-02` — `csda completion [bash\|zsh\|fish] [--install]` |
| C5-03 | `[ ]` | `OS-4-03` — `doctor` extendido: deltas huérfanos, cambios archivados con tareas sin marcar, drift entre matriz y specs, requisitos de pack editados sin cambio asociado. Cada hallazgo con `fix` accionable. Construye sobre el `doctor` que llega en C0-05 |
| C5-04 | `[ ]` | `OS-4-04` — `csda init --from-pack <repo>@<tag>` en un paso, y `specops.config.yaml` heredable entre repos. **No replicar los *Stores* de OpenSpec**: nuestra respuesta al multi-repo es el pack privado compartido, que ya existe |
| C5-05 | `[ ]` | `OS-4-05` — gobierno de repo: changesets y devcontainer (el resto se completa en la Fase 9) |

---

## 9. Fase 6 — Higiene de build y CI (~3 PD) · **bloquea la Fase 7**

| ID | | Tarea |
|---|---|---|
| C6-01 | `[ ]` | Arreglar `stryker.config.mjs:3,9` para apuntar a `dist/`, o retirar el pilot. Si se conserva, añadirlo a CI (semanal); si no, dejar de anunciarlo |
| C6-02 | `[ ]` | Declarar `js-yaml` en `package.json`. Hoy resuelve por accidente vía eslint: una actualización de eslint rompe CI con un `MODULE_NOT_FOUND` incomprensible |
| C6-03 | `[ ]` | Corregir `bin`/`main`/`files` de los tres `packages/*/package.json`; borrar el `templates/` inexistente de `pack-registry`. **Bloquea C7-07 y C7-08** |
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
