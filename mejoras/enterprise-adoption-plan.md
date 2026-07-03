# Plan de Adopción Enterprise — `create-spec-driven-app`

> **Origen:** feedback directo de usuarios — *"es muy engorroso / difícil de
> integrar en el día a día para proyectos enterprise"*.
>
> **Objetivo:** reducir la fricción de adopción diaria en entornos enterprise
> y demostrar el flujo completo (end-to-end) sobre un proyecto real:
> **Health Information Exchange (HIE) / HIS Hospitalario**
> (`C:\projects\hie-his-platform`).
>
> **Relación con otros documentos:** `IMPROVEMENTS.md` y
> `mejoras/implementation-roadmap.md` cubrían la calidad interna del CLI
> (dogfooding SDD/DDD/BDD/TDD) — **completados**. Este plan ataca un problema
> distinto: la **experiencia de adopción** para equipos enterprise.

---

## 0. Estado de implementación

> Rama: `feature/enterprise-adoption`. Se actualiza en cada commit.

| ID | Mejora | Estado | Notas |
|----|--------|--------|-------|
| A2 | Wizard interactivo `csda init` | ✅ **Hecho** | `scripts/wizard.ts` (sin deps nuevas), `--yes`, `--out` opcional (default cwd), `project.yaml` reproducible guardado en el proyecto generado. 8 tests unitarios + 3 e2e. |
| A6 | Errores con remedio | ⬜ Pendiente | |
| A5 | Docs por niveles L1–L4 | ⬜ Pendiente | |
| A1 | `csda adopt` brownfield | ⬜ Pendiente | |
| A3 | `csda doctor` | ⬜ Pendiente | |
| A4 | Paridad Windows | 🚧 En curso | Detectado: test e2e de harness usa `touch`/`/dev/null` — falla en Windows (confirma F5). |
| B1–B8 | Fase B | ⬜ Pendiente | |
| C1–C5 | Fase C | ⬜ Pendiente | |

---

## 1. Diagnóstico — por qué resulta "engorroso"

Fricciones identificadas revisando el código, la documentación y el flujo real
de uso (cada una con evidencia en el repo):

| # | Fricción | Evidencia | Impacto enterprise |
|---|----------|-----------|--------------------|
| F1 | **Solo greenfield.** `init` genera proyectos nuevos; no existe camino para adoptar SDD en un repo existente. | `scripts/init_project.ts` solo escribe árboles nuevos; no hay comando `adopt`. | La mayoría del trabajo enterprise es brownfield. Hoy la única opción es copiar ficheros a mano. **Es la fricción nº 1.** |
| F2 | **Carga conceptual inicial alta.** Para el "día 1" el usuario debe entender: pack, specops, lockfile, baseline, harness, plan/done, strict-tdd, bootstrap prompt. | `README.md` presenta 14 comandos y 3 repos antes del primer resultado tangible. | Un equipo que solo quiere "specs trazables en CI" abandona antes de llegar al valor. |
| F3 | **Config manual por fichero.** El quickstart empieza con `cp examples/project.yaml.example /tmp/...` y editar a mano. | `README.md` §Quickstart. | Sin wizard interactivo ni valores inferidos, la primera experiencia es "rellena 8 claves en YAML". |
| F4 | **Toolchain Node en equipos Java.** El CLI exige Node ≥ 20; los stacks objetivo son Java (Spring/Quarkus). | `package.json` `engines.node >= 20`. | En muchos entornos enterprise el desarrollador Java no tiene Node aprobado; instalarlo requiere ticket a IT. |
| F5 | **Suposiciones POSIX/macOS.** Rutas `/private/tmp` en smoke tests, scripts de demo en Bash. | `package.json` `smoke:init`, `scripts/demo/*.sh`. | Windows es mayoritario en escritorios enterprise; la experiencia local se degrada. |
| F6 | **CI solo GitHub Actions.** La acción `spec-driven-action` y los workflows asumen GitHub. | `actions/spec-driven-action/action.yml`, `.github/workflows/`. | Enterprise usa GitLab CI, Azure DevOps, Jenkins o Bitbucket. Sin plantillas, cada equipo escribe su gate a mano. |
| F7 | **Requisitos viven en Markdown, no en el ALM.** `traceability.md` es la fuente de verdad, pero los REQ enterprise viven en Jira / Azure Boards / Polarion. | `docs/specs/traceability.md` (plantilla), `scripts/done.ts`. | Doble contabilidad: el PM no mira el repo y el matrix se desincroniza — exactamente el "engorro" reportado. |
| F8 | **Packs solo vía git público / rutas locales.** No hay soporte de registry privado, proxy corporativo ni modo offline. | `scripts/domain-pack/remote.ts` (clone directo). | Entornos air-gapped o con proxy (banca, salud, defensa) no pueden consumir packs. |
| F9 | **Sin gobierno de packs.** Nada de firma, procedencia, ni aprobación de versiones de pack. | No existe verificación en `specops add`/`sync`. | Un pack define requisitos que agentes de IA ejecutan: en enterprise eso exige cadena de suministro verificable. |
| F10 | **Harness acoplado a agentes CLI locales y worktrees.** No hay modo "harness en CI" ni soporte para agentes aprobados vía API interna. | `scripts/harness/run.ts` (spawn local + `git worktree`). | Los equipos enterprise no siempre pueden ejecutar `claude`/`opencode` en el portátil; sí en un runner controlado. |
| F11 | **Sin soporte monorepo / multi-módulo.** Un `spec.md` y un `traceability.md` por raíz de proyecto. | `validate_specs.ts` asume raíz única. | Los proyectos Java enterprise suelen ser Maven multi-módulo o monorepos con varios bounded contexts. |
| F12 | **Sin `doctor` ni diagnóstico.** Cuando `validate` falla, el mensaje exige entender la estructura interna. | `validate_specs.ts` errores por regla. | El coste de depurar el propio tooling se percibe como "engorro" diario. |

**Síntesis:** el producto está optimizado para *demostrar* SDD (greenfield,
GitHub, agente CLI local), no para *convivir* con la realidad enterprise
(brownfield, ALM corporativo, CI heterogéneo, redes restringidas, Windows).

---

## 2. Principio rector — Adopción progresiva por niveles

Reempaquetar la propuesta de valor en **4 niveles**, cada uno útil por sí
mismo y adoptable en < 1 día. La documentación, el CLI y el marketing deben
hablar este lenguaje:

| Nivel | Nombre | Qué obtiene el equipo | Comandos necesarios | Coste de entrada |
|-------|--------|----------------------|---------------------|------------------|
| **L1** | Specs trazables | `spec.md` + `features/` + `traceability.md` en su repo existente | `csda adopt` | ~1 hora |
| **L2** | Gate en CI | `validate --strict-tdd` como check de PR | plantilla CI + `csda validate` | ~1 hora |
| **L3** | Dominio versionado | packs + `specops add/sync/diff` con lockfile | `csda specops …` | ~1 día |
| **L4** | Delivery agéntico | `harness run` con agente aprobado | `csda harness …` | ~1 semana |

Regla: **ningún nivel exige entender los superiores.** Hoy el README obliga a
tragarse L1–L4 de golpe; ese es el origen del feedback.

---

## 3. Plan de mejoras

### Fase A — Eliminar la fricción del día a día (P0, 0–45 días)

| ID | Mejora | Descripción | Ficheros / entregables | Criterio de aceptación |
|----|--------|-------------|------------------------|------------------------|
| A1 | **`csda adopt` (brownfield)** | Nuevo comando que instala SDD sobre un repo existente: detecta stack (pom.xml/build.gradle/package.json), genera `spec.md`, `AI_RULES.md`, `features/`, `traceability.md` sin tocar código; `--from-tests` infiere REQs iniciales desde tests/`@DisplayName` existentes. | `scripts/adopt_project.ts`, `templates/adopt/**`, feature Gherkin propia | Ejecutado sobre `hie-his-platform` produce un proyecto que pasa `validate` sin editar código Java. Ver §5. |
| A2 | **`csda init` interactivo** | Sin `--config`, lanzar wizard (prompts) que rellena PROJECT_NAME/SLUG/STACK/…; `--yes` para CI. Elimina el paso "copia y edita un YAML en /tmp". | `bin/create-spec-driven-app.ts`, `scripts/init_project.ts` | `npx create-spec-driven-app init` sin flags produce proyecto válido en < 2 min. |
| A3 | **`csda doctor`** | Diagnóstico: versión Node, git disponible, estructura del proyecto, lockfile coherente con baseline, features huérfanas, REQs sin escenario. Salida accionable con el fix sugerido por hallazgo. | `scripts/doctor.ts` | Cada regla de `validate` que falla tiene su contraparte "cómo arreglarlo" en `doctor`. |
| A4 | **Paridad Windows** | Smoke tests y demos sin rutas POSIX; usar `os.tmpdir()`; CI matrix `windows-latest` + `ubuntu-latest`. | `package.json`, `.github/workflows/ci.yml`, `scripts/demo/**` | Suite completa verde en Windows runner. |
| A5 | **Docs por nivel de adopción** | Reestructurar README y docs site según §2: "Empieza en L1 en 1 hora". Quickstart brownfield antes que greenfield. | `README.md`, `docs/how-to.md`, `docs/index.html` | Un lector llega a su primer `validate` verde leyendo ≤ 1 pantalla. |
| A6 | **Mensajes de error con remedio** | Todo error de `validate`/`specops` incluye: qué regla, qué fichero:línea, comando o edición que lo arregla. | `scripts/validate_specs.ts`, `scripts/specops/*.ts` | 0 errores "crípticos" en el corpus de tests de error. |

### Fase B — Encajar en la infraestructura enterprise (P0–P1, 45–120 días)

| ID | Mejora | Descripción | Ficheros / entregables | Criterio de aceptación |
|----|--------|-------------|------------------------|------------------------|
| B1 | **Plantillas CI multi-proveedor** | `csda ci init --provider gitlab\|azure\|jenkins\|github` genera el gate `validate --strict-tdd` + `plan --format json` como artefacto. | `templates/ci/{gitlab-ci.yml,azure-pipelines.yml,Jenkinsfile}.tpl`, `scripts/ci_init.ts` | Pipeline de ejemplo verde en los 4 proveedores (repos de prueba). |
| B2 | **Imagen Docker oficial del CLI** | `ghcr.io/rsaglobaltech/csda:<version>` — elimina el requisito de Node local (F4) y habilita runners air-gapped con mirror interno. | `Dockerfile.cli`, workflow de publish | `docker run csda validate /workspace` equivale al CLI local. |
| B3 | **Wrapper Maven/Gradle** | Plugin fino `csda-maven-plugin` (goal `csda:validate`, `csda:plan`) que resuelve el binario vía imagen Docker o Node embebido; los equipos Java lo invocan con su herramienta de siempre. | repo/`packages/maven-plugin` | `mvn csda:validate` falla el build si la trazabilidad rompe. |
| B4 | **Packs desde registries privados + offline** | Soportar `--pack-repo` con auth (token/SSH corporativo), proxy HTTP(S), y `csda pack cache` (tarball local versionado) para air-gapped. | `scripts/domain-pack/remote.ts`, `scripts/specops/*.ts` | `specops add` funciona sin salida a Internet usando cache local. |
| B5 | **Firma y procedencia de packs** | `pack publish` firma el tarball (sigstore/cosign o GPG); `specops add` verifica firma y registra el digest en `.specops.lock`. Política `requireSignedPacks: true` en `specops.config.yaml`. | `scripts/specops/verify.ts`, docs de gobierno | Pack sin firma es rechazado cuando la política lo exige; digest auditable en el lockfile. |
| B6 | **Sincronización con ALM (Jira / Azure Boards)** | `csda alm sync`: cada REQ del matrix se enlaza a un issue (campo `alm_ref` en `pack.yaml`/traceability); `done` puede transicionar el issue; `plan` puede filtrar por sprint. Bidireccional mínimo: estado. | `scripts/alm/{jira,azure}.ts`, `schemas/pack.schema.json` (campo nuevo) | Marcar REQ como `Implemented` mueve el ticket Jira enlazado a "Done" (y a la inversa se detecta drift). |
| B7 | **Harness en CI (modo runner)** | `harness run --ci`: sin worktree local — corre en un job por REQ, agente invocado vía comando configurado en el runner (donde sí hay credenciales aprobadas); publica el branch `harness/REQ-NNN` y abre PR/MR automáticamente. | `scripts/harness/run.ts`, plantillas B1 | Un pipeline nocturno implementa los REQ pendientes y deja PRs listos para revisión humana. |
| B8 | **Soporte multi-módulo / monorepo** | `specops.config.yaml` admite `projects:` con subdirectorios; `validate` agrega resultados; trazabilidad por bounded context con vista consolidada. | `scripts/validate_specs.ts`, `scripts/specops/config.ts` | Repo Maven multi-módulo con 2 contexts valida cada uno y emite matrix global. |

### Fase C — Madurez y escala (P2, 120–210 días)

| ID | Mejora | Descripción |
|----|--------|-------------|
| C1 | **Dashboard de cobertura de specs** | `csda report --html`: % REQ implementados, REQ sin test, drift specops, tendencia — publicable como artefacto CI / GitHub Pages. Es el informe que un jefe de proyecto enterprise enseña en el comité. |
| C2 | **Telemetría opt-in** | Métricas anónimas de comandos/fricción para priorizar con datos, con off por defecto y documentación clara (requisito de compliance). |
| C3 | **Plantillas de compliance por dominio** | Packs "regulatorios" reutilizables: `hipaa-audit-pack`, `gdpr-rights-pack` — requisitos transversales (auditoría, cifrado, retención) que se componen con el pack de dominio. El caso HIE (§5) es el piloto. |
| C4 | **Catálogo interno de packs** | `pack-registry` desplegable on-prem (ya existe el builder) con índice navegable de packs corporativos firmados. |
| C5 | **Perfiles de agente aprobados** | `harness.config.yaml` con perfiles nombrados (`agent_profile: corporate-bedrock`) mantenidos por plataforma, no por cada equipo. |

### Dependencias

```
A1 ──► §5 piloto HIE          B1 ──► B7 (harness CI)
A2, A3, A5, A6  independientes B2 ──► B3 (wrapper usa imagen)
A4  independiente              B4 ──► B5 (firma sobre fetch)
                               B6  independiente
C3 depende de A1 + B5 (packs compuestos y firmados)
```

---

## 4. Métricas de éxito

| Métrica | Hoy (estimado) | Objetivo |
|---------|----------------|----------|
| Tiempo hasta primer `validate` verde en repo **existente** | horas / imposible sin manual | **≤ 1 hora** (L1 con `adopt`) |
| Nº de conceptos a entender para L1–L2 | ~10 (packs, lock, harness…) | **3** (spec, feature, matrix) |
| Proveedores CI con plantilla oficial | 1 (GitHub) | **4** |
| Funciona sin Node local | no | sí (Docker + wrapper Maven) |
| Funciona air-gapped | no | sí (cache de packs) |
| REQ enlazables a Jira/Azure Boards | 0 % | 100 % (campo `alm_ref`) |
| Suite CI en Windows | no | verde en matrix |

---

## 5. Caso end-to-end: HIE/HIS Hospitalario

**Proyecto:** `hie-his-platform` — intercambio de historias clínicas
(hospitales, laboratorios, aseguradoras), HL7 FHIR R4, HIPAA/GDPR, alta
disponibilidad.
**Stack:** Java 21 · Spring Boot 3.3 · HAPI FHIR 7.4 · Apache Camel ·
PostgreSQL · MongoDB · MinIO · Keycloak.
**Estado real:** Fases 1–5 del `PLAN.md` implementadas (núcleo); pendientes
MPI/`$match`, `Subscription`, terminología, Flyway, `Consent`, HA, hardening.

Es el **piloto perfecto para la fricción F1**: proyecto brownfield, dominio
regulado, backlog pendiente bien definido. Se aplica el flujo en 5 pasos.

### 5.1 Paso 1 — Autoría del pack de dominio: `healthcare-hie-specops`

Repo nuevo de pack (stack-agnóstico), autorado por el experto de dominio +
tech lead. Dos packs dentro: `backend` y `contracts`.

Derivación de requisitos directamente de las fases del `PLAN.md`:

| REQ | Fase origen | Use case | Aggregate | Evento de dominio | Estado en repo |
|-----|-------------|----------|-----------|-------------------|----------------|
| REQ-001 | F1 | CRUD + búsqueda de recursos FHIR prioritarios | `Patient`, `Encounter`, `Observation` | `ResourcePersisted` | ✅ implementado |
| REQ-002 | F2 | Acceso por scopes SMART on FHIR | `AccessPolicy` | `AccessDenied`/`AccessGranted` | ✅ implementado |
| REQ-003 | F2 | Scoping por compartimento de paciente | `PatientCompartment` | — | ✅ implementado |
| REQ-004 | F3 | Ingesta ADT^A01 → Patient idempotente | `HL7Message` | `PatientAdmitted` | ✅ implementado |
| REQ-005 | F3 | ORU → Observation, ORM → ServiceRequest (MLLP) | `HL7Message` | `ResultReceived`, `OrderReceived` | ✅ implementado |
| REQ-006 | F4 | Documento clínico → MinIO + `DocumentReference` | `ClinicalDocument` | `DocumentStored` | ✅ implementado |
| REQ-007 | F5 | `AuditEvent` por operación sobre PHI | `AuditTrail` | `PhiAccessed` | ✅ implementado |
| REQ-008 | F6 | `Patient/$everything` (portabilidad) | `PatientCompartment` | — | ✅ implementado |
| REQ-009 | F6 | Bulk `$export` asíncrono | `ExportJob` | `ExportCompleted` | ✅ implementado |
| REQ-010 | F1 | Migraciones de esquema con Flyway | — | — | ⏳ **pendiente** |
| REQ-011 | F2 | Recurso `Consent` + filtrado por consentimiento | `Consent` | `ConsentGranted`/`ConsentRevoked` | ⏳ **pendiente** |
| REQ-012 | F6 | MPI: `$match` y resolución de identidad cross-org | `MasterPatientIndex` | `PatientLinked` | ⏳ **pendiente** |
| REQ-013 | F6 | `Subscription` para notificaciones en tiempo real | `Subscription` | `NotificationSent` | ⏳ **pendiente** |
| REQ-014 | F6 | Terminología: `$validate-code` / `$translate` (LOINC/SNOMED) | `TerminologyService` | — | ⏳ **pendiente** |
| REQ-015 | F5 | Cadena de auditoría inmutable (hash encadenado) | `AuditTrail` | — | ⏳ **pendiente** |
| REQ-016 | F5 | Derechos GDPR: acceso / rectificación / olvido con retención clínica | `DataSubjectRequest` | `ErasureExecuted` | ⏳ **pendiente** |

Ejemplo de escenario Gherkin del pack (estilo stack-neutral obligatorio,
verificable con `pack lint --strict`):

```gherkin
# features/interoperability/mpi_match.feature  (REQ-012)
Feature: Resolución de identidad de pacientes entre organizaciones (MPI)
  Como hospital receptor de una transferencia
  Quiero localizar al paciente por datos demográficos vía $match
  Para no duplicar historias clínicas entre organizaciones

  Scenario: Coincidencia única con alta confianza
    Given existe un Patient con MRN "H1-12345" del hospital "H1"
    And llega una consulta $match con nombre, fecha de nacimiento y sexo coincidentes
    When se ejecuta la operación Patient/$match
    Then la respuesta contiene exactamente 1 candidato
    And la puntuación de coincidencia es >= 0.9

  Scenario: Coincidencia ambigua requiere revisión manual
    Given existen 2 Patients con datos demográficos similares
    When se ejecuta la operación Patient/$match
    Then la respuesta marca los candidatos como "possible-match"
    And ningún enlace de identidad se crea automáticamente
```

Los requisitos transversales de cumplimiento (REQ-007, 015, 016) son el
piloto del pack regulatorio `hipaa-audit-pack` (mejora C3): la matriz de
trazabilidad **es la evidencia de auditoría** — cada control HIPAA
(§164.312 audit controls, §164.312(a) access control) mapea a un REQ, su
escenario Gherkin y su test de integración ejecutado en CI. Eso convierte el
"engorro" en argumento de venta para salud: la trazabilidad ya no es
burocracia, es el artefacto que pide el auditor.

Validación del pack antes de publicar:

```bash
csda pack lint --strict packs/healthcare-hie/backend
csda pack lint --graph packs/healthcare-hie/backend   # grafo REQ→UC→AGG→EVT
git tag v0.1.0 && git push --tags                     # publicar (firmado cuando exista B5)
```

### 5.2 Paso 2 — Adopción brownfield sobre `hie-his-platform` (usa A1)

```bash
cd hie-his-platform
csda adopt --detect                # detecta pom.xml → STACK="Java 21, Spring Boot 3.3, HAPI FHIR 7.4"
csda specops add \
  --pack-repo https://git.interno/salud/healthcare-hie-specops.git \
  --pack-version v0.1.0 --pack backend \
  --var PROJECT_NAME="HIE/HIS Platform" \
  --var PROJECT_SLUG=hie-his-platform \
  --var DOMAIN="intercambio de historias clínicas"
```

Resultado: `spec.md`, `AI_RULES.md` (con las reglas HAPI FHIR/Spring del
proyecto), `features/**`, `docs/specs/traceability.md` y `.specops.lock` —
**sin tocar una línea de Java**.

Retro-trazado del código existente (REQ-001…009 ya implementados): se marcan
con `csda done REQ-00N --check`, que exige que el test de integración
correspondiente exista y pase — los 19 tests de integración actuales se
referencian como `test_artifact` de cada fila. El matrix nace **honesto**, no
aspiracional.

### 5.3 Paso 3 — Gate en CI (usa B1/B3)

```yaml
# .gitlab-ci.yml (o Jenkinsfile / azure-pipelines.yml — plantilla B1)
spec-gate:
  image: ghcr.io/rsaglobaltech/csda:latest      # imagen B2: sin Node en el runner
  script:
    - csda validate --strict-tdd .
    - csda plan --format json > spec-plan.json  # backlog vivo como artefacto
  artifacts: { paths: [spec-plan.json] }
```

Con el wrapper B3, el desarrollador Java local ejecuta lo mismo con
`mvn csda:validate` — cero Node en su máquina.

Regla de PR: ningún merge si un REQ pasa a `Implemented` sin su `.feature` y
su test (`--strict-tdd`). Para salud esto codifica la política "no hay
funcionalidad sobre PHI sin evidencia de prueba".

### 5.4 Paso 4 — Delivery agéntico del backlog pendiente (usa B7)

```yaml
# harness.config.yaml en hie-his-platform
harness_version: 1
agent: 'claude -p < {prompt_file}'          # o perfil corporativo (C5)
test_cmd: "mvn -B test"
max_attempts: 3
prompt_prefix_file: ./.harness/prompt-prefix.md   # límites: nunca tocar PHI real,
                                                  # nunca desactivar el perfil `secure`,
                                                  # datos sintéticos únicamente
```

```bash
csda harness prompt REQ-011      # previsualizar el prompt de Consent antes de gastar tokens
csda harness run --req REQ-011   # Consent + filtrado por consentimiento
csda harness run --req REQ-010   # Flyway
# nocturno en CI (B7): REQ-012..016 → un branch harness/REQ-NNN + PR por requisito
```

Cada intento queda en `.specops/harness-prompts/` — en un dominio regulado
ese registro de "qué se le pidió exactamente a la IA que tocó el código
clínico" se **committea** (evidencia para la auditoría, no opcional).

El humano revisa cada `harness/REQ-NNN`; el harness nunca mergea. Orden
sugerido del backlog: REQ-010 (Flyway, desbloquea prod) → REQ-011 (Consent,
bloquea exposición externa según F2 del PLAN) → REQ-015 (auditoría
inmutable) → REQ-012/013/014 (interoperabilidad F6) → REQ-016 (GDPR).

### 5.5 Paso 5 — Evolución del dominio con `specops sync`

Cuando sanidad regional publique un cambio (p. ej. perfil nacional de
`Patient`, nuevo requisito de consentimiento), el experto de dominio publica
`healthcare-hie-specops v0.2.0` y cada hospital/implementación:

```bash
csda specops diff --pack-version v0.2.0   # previsualizar impacto
csda specops sync --pack-version v0.2.0   # merge a 3 vías preservando ediciones locales
csda plan                                  # los REQ nuevos aparecen como pendientes
```

Mismo pack, múltiples implementaciones (patrón multi-stack del
`architecture.md`): un HIE nacional con N hospitales puede tener
implementaciones Spring y Quarkus consumiendo **el mismo pack versionado** —
la interoperabilidad se especifica una vez y se audita en todas.

### 5.6 Qué demuestra el piloto

| Fricción original | Cómo la resuelve el piloto |
|-------------------|----------------------------|
| F1 brownfield | `adopt` + retro-trazado sobre código Java existente sin modificarlo |
| F2 carga conceptual | El equipo HIE entra por L1–L2 (specs + gate CI); harness llega semanas después |
| F4/F6 toolchain/CI | Imagen Docker + `mvn csda:validate` + plantilla GitLab/Jenkins |
| F7 ALM | REQ-010..016 enlazados a Jira vía `alm_ref` (B6) |
| F8/F9 gobierno | Pack en git interno, firmado (B5), lockfile con digest |
| Valor enterprise | Matriz de trazabilidad = evidencia HIPAA/GDPR auditable en cada PR |

---

## 6. Secuencia de ejecución recomendada

1. **Semana 1–2:** A2 (wizard) + A6 (errores) + A5 (docs por niveles) — victorias rápidas visibles.
2. **Semana 3–6:** A1 (`adopt`) + A3 (`doctor`) + A4 (Windows) — desbloquea brownfield.
3. **Semana 7–10:** B2 (Docker) + B1 (CI multi-proveedor) + arranque del pack `healthcare-hie-specops` (§5.1) en paralelo.
4. **Semana 11–14:** Piloto HIE completo (§5.2–5.4) — primera validación real del feedback; B4 (offline) si el piloto corre en red restringida.
5. **Semana 15+:** B3, B5, B6, B7, B8 priorizados según lo aprendido en el piloto; luego Fase C.

**Criterio de éxito global:** el mismo grupo de usuarios que reportó el
feedback adopta L1–L2 en `hie-his-platform` (o equivalente) en menos de un
día y lo mantiene 4 semanas sin abandonar el gate de CI.
