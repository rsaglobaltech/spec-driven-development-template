# Benchmark OpenSpec → Plan de evolución de `create-spec-driven-app`

> **Fecha:** 2026-08-14
> **Autor:** análisis técnico sobre [openspec.dev](https://openspec.dev) y
> [`Fission-AI/OpenSpec`](https://github.com/Fission-AI/OpenSpec) (docs `main`,
> auditoría de contrato de agente fechada 2026-06-11).
> **Objetivo:** valorar OpenSpec con honestidad y definir un plan ejecutable
> para que **CSDA** (`create-spec-driven-app` v0.1.4) alcance —y en varios ejes
> supere— su nivel, sin renunciar a lo que ya nos diferencia.

---

## 0. Resumen ejecutivo

**Veredicto sobre OpenSpec.** Es el mejor exponente actual de la categoría
"capa de planificación universal para agentes de código". No es superior a CSDA
en profundidad de ingeniería (no tiene trazabilidad ejecutable, ni DDD, ni
gates de CI, ni packs reutilizables). Es superior en **tres cosas que hoy
deciden la adopción**:

1. **Modelo de ciclo de vida del cambio** (`change` → `delta` → `archive`) que
   convierte la especificación en un documento vivo y hace del *brownfield* el
   caso normal, no la excepción.
2. **Superficie nativa de agente**: comandos slash generados para 30+
   herramientas, más un **contrato JSON estable y documentado** que hace que un
   agente pueda pilotar el CLI sin heurísticas.
3. **Coste conceptual bajísimo**: `npm i -g` + `openspec init` + un comando
   slash, y ya estás produciendo valor. Todo lo demás es opcional.

**Veredicto sobre CSDA.** Tenemos más músculo (packs versionados con JSON
Schema, matriz de trazabilidad con gate de CI, Gherkin ejecutable, DDD-lite,
harness de agentes en worktrees aislados, MCP, extensión VS Code, registry
on-prem, ALM sync). Pero **falta la columna vertebral del ciclo de cambio** y
**la ergonomía de agente**. Hoy CSDA es un *scaffolder con gobierno*; OpenSpec
es un *bucle de trabajo*. El plan consiste en añadirle a CSDA el bucle sin
perder el gobierno.

**Tesis de posicionamiento objetivo (dos ejes):**

> **Eje 1 — la spec no solo se archiva: se ejecuta.**
> Delta specs y `archive` que, al fusionarse, **actualizan la matriz de
> trazabilidad y generan/actualizan el `.feature` correspondiente**, quedando
> bajo el gate `validate --strict-tdd`.
>
> **Eje 2 — la spec no solo vive: se distribuye y se versiona.**
> **SpecOps** es gestión de dependencias para conocimiento de dominio. OpenSpec
> tiene el bucle; nosotros tenemos el bucle *y* el registro de paquetes. Ver la
> valoración completa en **§2.5** — es la pieza que ellos no pueden alcanzar
> sin reescribir su modelo de datos.

**Esfuerzo total estimado:** ~69 person-days (PD) repartidos en 6 fases.
El 65 % del valor está en **F1** y **F1B** (~25 PD) — el ciclo de cambio y su
fusión con SpecOps.

---

## 1. Qué es OpenSpec exactamente (modelo mental)

### 1.1 Filosofía declarada

```
fluid not rigid         — sin phase gates, trabajas en lo que tenga sentido
iterative not waterfall — aprendes construyendo, refinas sobre la marcha
easy not complex        — setup mínimo, ceremonia mínima
brownfield-first        — pensado para código existente, no solo greenfield
```

Y una regla operativa clave: **"dependencies are enablers, not gates"**. El
grafo de artefactos indica *qué es posible crear ahora*, no *qué es obligatorio
crear a continuación*.

### 1.2 Arquitectura de directorios

```
openspec/
├── project.md                  # contexto del proyecto (legacy/opcional)
├── config.yaml                 # schema por defecto, perfil, idioma, tools
├── specs/                      # ← FUENTE DE VERDAD: cómo se comporta HOY
│   └── <capability>/spec.md
├── changes/                    # ← propuestas en curso (una carpeta = un cambio)
│   └── <change-id>/
│       ├── proposal.md         # por qué + alcance + enfoque
│       ├── design.md           # cómo (decisiones técnicas)
│       ├── tasks.md            # checklist de implementación
│       ├── .openspec.yaml      # metadata: schema, skip_specs, retire_capabilities
│       └── specs/<cap>/spec.md # DELTA specs
│           └── changes/archive/YYYY-MM-DD-<change-id>/   # histórico
└── schemas/<name>/schema.yaml  # grafo de artefactos personalizable
```

### 1.3 El formato: markdown plano, cero sintaxis propietaria

**Spec (fuente de verdad):**

```markdown
## Purpose
Authentication and session management.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
```

**Delta spec (el truco central):**

```markdown
## ADDED Requirements
### Requirement: Two-Factor Authentication
...

## MODIFIED Requirements
### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes. (Previously: 30 minutes)

## REMOVED Requirements
### Requirement: Remember Me
(Deprecated in favor of 2FA.)
```

| Sección | Significado | Qué pasa al archivar |
|---|---|---|
| `## ADDED Requirements` | comportamiento nuevo | se anexa a la spec principal |
| `## MODIFIED Requirements` | comportamiento cambiado | reemplaza el requisito existente |
| `## REMOVED Requirements` | comportamiento retirado | se borra; si era el último requisito y el cambio declara `retire_capabilities: true`, se elimina el fichero de spec |
| `## Purpose` | propósito de una capability nueva | siembra el `Purpose` de la spec creada |

**Por qué deltas y no specs completas** (su argumento, que es correcto):
claridad de revisión (ves el cambio, no el contexto), ausencia de conflictos
(dos cambios tocan la misma spec sin colisionar si tocan requisitos
distintos), y encaje natural con brownfield.

### 1.4 Superficie de comandos

**Comandos slash (lo que usa el humano dentro del agente):**

| Comando | Función |
|---|---|
| `/opsx:explore` | modo "compañero de pensamiento": lee el código y da forma al plan antes de escribir nada |
| `/opsx:propose` | ruta rápida: crea la carpeta de cambio con proposal + specs + design + tasks |
| `/opsx:new` | crea el cambio vacío (workflow expandido) |
| `/opsx:continue` / `/opsx:ff` | crea el siguiente artefacto / todos en cadena |
| `/opsx:apply` | implementa las tareas, marcándolas |
| `/opsx:update` | actualiza un cambio existente cuando cambia el entendimiento |
| `/opsx:verify` | comprueba que la implementación cumple las specs |
| `/opsx:sync` | sincroniza delta specs con lo realmente implementado |
| `/opsx:archive` / `/opsx:bulk-archive` | fusiona deltas y archiva |
| `/opsx:onboard` | tour guiado sobre un repo existente |

**CLI (lo que usan agente y CI):** `init`, `update`, `list`, `view`, `show`,
`validate`, `archive`, `new change`, `status`, `instructions`,
`instructions apply|archive`, `templates`, `schemas`, `schema
init|fork|validate|which`, `config`, `doctor`, `context`, `store
setup|register|unregister|remove|list|doctor`, `completion`, `feedback`.

Distinguen explícitamente **comandos humanos** de **comandos aptos para
agente**, y documentan cuáles son cuáles.

### 1.5 El contrato de agente (lo más infravalorado)

`docs/agent-contract.md` es una auditoría de 142 líneas que fija:

- **Un único documento JSON por invocación** en `--json`, en stdout;
  prosa/spinners/banners a stderr.
- **Envoltorio de diagnóstico único**:
  `{ severity, code, message, target?, fix? }` — donde `fix` es *una frase o
  comando accionable*.
- **Shapes por comando** documentadas campo a campo (`status`, `instructions`,
  `validate`, `archive`, `doctor`, `context`…).
- **Contrato de exit codes**: 0 éxito (incluidos hallazgos de salud), 1 fallo
  con documento JSON de "null-shape" + `status`, 130 cancelación de prompt.
- **Catálogo de códigos de diagnóstico** (~90 códigos con nombre estable).
- Una sección de **"Known inconsistencies"** donde admiten sus propias
  incoherencias (snake_case vs camelCase, etc.).

Esto es lo que convierte al CLI en una API para agentes. Nosotros hoy tenemos
`plan --format json` y poco más.

### 1.6 Extras relevantes

- **Schemas personalizables**: el grafo de artefactos (`requires:`) es
  configurable; `schema fork spec-driven research-first` y a correr. Existe la
  noción de *community schemas*.
- **Progressive rigor**: "Lite spec" por defecto, "Full spec" solo para cambios
  de alto riesgo (contratos, migraciones, seguridad, cross-repo).
- **Stores (beta)**: un `openspec/` compartido en un repo dedicado, referenciado
  por varios repos vía git — planificación multi-repo sin monorepo.
- **Multi-idioma**: contexto de idioma configurable para que los artefactos se
  redacten en el idioma del equipo.
- **Telemetría anónima activada por defecto** (opt-out). *Nosotros la tenemos
  opt-in: mantenerlo, es un argumento comercial en enterprise.*
- **No toca git**: regla explícita. Nosotros sí (harness crea worktrees y
  commitea) — es una diferencia de ambición, no un defecto, pero debe estar
  documentada y ser opcional.

---

## 2. Comparativa honesta CSDA vs OpenSpec

| Eje | CSDA v0.1.4 | OpenSpec | Veredicto |
|---|---|---|---|
| Ciclo de vida del cambio (propuesta → revisión → archivo) | ❌ inexistente | ✅ núcleo del producto | **Brecha crítica** |
| Delta specs (ADDED/MODIFIED/REMOVED) | ❌ | ✅ | **Brecha crítica** |
| Spec como documento vivo tras el merge | ⚠️ solo estado en `traceability.md` | ✅ merge real en `specs/` | **Brecha crítica** |
| Comandos slash generados para N herramientas | ❌ (solo `AI_RULES.md` / `AGENTS.md`) | ✅ 30+ tools | **Brecha alta** |
| Contrato JSON documentado para agentes | ⚠️ parcial (`plan --format json`) | ✅ exhaustivo + códigos + exit codes | **Brecha alta** |
| Grafo de artefactos configurable (schemas) | ❌ flujo fijo | ✅ `schema init/fork/validate/which` | **Brecha media** |
| Coste de entrada (time-to-first-value) | ⚠️ alto: config, packs, lock, sync | ✅ 2 comandos | **Brecha media** |
| Documentación como producto | ⚠️ README gigante + 3 guías | ✅ 17 guías cortas + glosario + FAQ | **Brecha media** |
| `update` post-upgrade / shell completion | ❌ / ❌ | ✅ / ✅ | Brecha baja |
| Planificación multi-repo | ❌ | ⚠️ Stores (beta) | Empate (ambos verdes) |
| **Trazabilidad REQ→Escenario→UC→Agregado→Test con gate de CI** | ✅ único | ❌ | **Ventaja nuestra** |
| **Gherkin ejecutable como criterio de aceptación** | ✅ `--strict-tdd` | ❌ escenarios solo en prosa | **Ventaja nuestra** |
| **Packs de dominio reutilizables + JSON Schema 2020-12 + lockfile + 3-way merge** | ✅ único | ❌ | **Ventaja nuestra** |
| **DDD-lite (UC, comandos, agregados, eventos) y grafo del pack** | ✅ | ❌ | **Ventaja nuestra** |
| **Harness de ejecución autónoma (worktrees, retries, gate verde)** | ✅ | ❌ | **Ventaja nuestra** |
| MCP server + extensión VS Code | ✅ | ❌ (no requiere MCP por diseño) | Ventaja nuestra |
| Registry on-prem, bundles air-gapped, ALM sync (Jira/Azure) | ✅ | ❌ | Ventaja nuestra (enterprise) |
| Telemetría | ✅ opt-in, local | ⚠️ opt-out | Ventaja nuestra |

**Lectura:** no vamos por detrás en capacidad. Vamos por detrás en **modelo de
trabajo** y en **ergonomía para agentes**. Son exactamente las dos cosas que un
usuario evalúa en los primeros 10 minutos.

---

## 2.5 Valoración del concepto **SpecOps** (activo estratégico nº 1)

> Esta sección es previa a cualquier decisión de implementación. SpecOps no es
> una feature del CLI: es la tesis de producto. Todo lo que se añada debe
> reforzarla, nunca competir con ella.

### 2.5.1 Qué es SpecOps, en una frase

**Gestión de dependencias aplicada al conocimiento de dominio.** Un pack es un
paquete versionado de requisitos, casos de uso, agregados, eventos y escenarios
Gherkin; un proyecto lo consume por tag, exactamente como una dependencia npm,
y puede actualizarlo preservando sus ediciones locales.

```text
create-spec-driven-app     → la herramienta      (npm / cargo)
parking-management-specops → el paquete          (la librería)
smart-parking              → la implementación   (tu aplicación)
```

Tres repos, tres ciclos de vida independientes. Ese desacoplamiento es el
concepto, y es correcto.

### 2.5.2 Lo que ya está resuelto (y es difícil)

Auditado sobre `scripts/specops/` (~1.100 líneas) y `docs/specs/specops.md`:

| Pieza | Estado | Por qué es difícil |
|---|---|---|
| `.specops.lock` | ✅ estable | Pin por `(repo, pack_id)` con commit SHA resuelto, `vars` memorizadas, orden determinista para diffs limpios. Es un lockfile de verdad, no una nota. |
| `.specops/manifest.json` + `baseline/` | ✅ estable | **Es el ancestro común.** Sin baseline no hay merge de tres vías, solo sobrescritura. Esta es la pieza que casi todo el mundo se salta. |
| `specops sync` con merge de 3 vías | ✅ estable (M3) | Clasificación por fichero: `added / unchanged / updated / kept / merged / CONFLICT`. Con `--force` y `--abort-on-conflict` como políticas explícitas, y exit code no-cero en conflicto para que CI y harness lo detecten. |
| `specops diff` | ✅ estable | Previsualización de un bump sin escribir. Ignora ficheros no generados por el pack (tu código nunca se reporta). |
| Caché por `sha256(repo)[:16]/<version>` | ✅ | Sin colisiones entre repos con el mismo tag; reutiliza clon sin red. |
| `specops.config.yaml` | ✅ | Composición declarativa multi-pack sin escribir el lockfile a mano. |

**Valoración:** la maquinaria más cara ya está construida y probada. El coste
hundido está en la parte correcta del problema.

### 2.5.3 Por qué OpenSpec no puede replicarlo barato

OpenSpec tiene *un* `openspec/` por repo (o compartido vía *Stores*, en beta).
Su modelo de datos no contempla:

1. **Versionado semántico del conocimiento.** No hay "spec de auth v2.1.0". La
   spec es lo que hay en `main` hoy.
2. **Ancestro común.** Sin baseline no pueden ofrecer upgrade preservando
   ediciones locales; su *Stores* resuelve *compartir*, no *versionar y
   fusionar*.
3. **Reutilización entre organizaciones.** Un pack de `billing` sirve a 20
   proyectos distintos. Un *Store* de OpenSpec sirve a los repos de un equipo.

*Stores* y SpecOps parecen lo mismo y no lo son: **Stores es un directorio
compartido; SpecOps es un gestor de paquetes.** La diferencia es la misma que
entre una carpeta de red con librerías y npm.

### 2.5.4 Dónde SpecOps está infra-explotado (el diagnóstico honesto)

| # | Problema | Consecuencia |
|---|---|---|
| **S1** | **`diff` habla de ficheros, no de intención.** Un bump reporta `~ docs/specs/traceability.md`. El usuario no sabe *qué requisito cambió*. | Revisar un upgrade de pack es arqueología. Es exactamente el problema que OpenSpec resuelve con delta specs. |
| **S2** | **El flujo es unidireccional.** El conocimiento baja del pack al proyecto; nunca sube. Si en la implementación descubres que falta un escenario, lo editas local y `sync` lo marca `kept` — se queda huérfano para siempre. | El pack se degrada. Nadie contribuye de vuelta porque no hay camino. |
| **S3** | **Sin gate de drift.** `validate --against-lock` está en el roadmap y sin construir. | Un proyecto puede divergir del pack durante meses sin que CI lo note. |
| **S4** | **SpecOps es la puerta de entrada, y es una puerta pesada.** Para probar CSDA hay que entender packs, vars, lock y baseline. | Time-to-first-value alto. La feature más potente actúa de barrera. |
| **S5** | **Un pack solo distribuye scaffolding**, no evolución. No hay forma de decir "v0.2.0 *añade* REQ-014 y *modifica* REQ-007". | El versionado es opaco: la semántica del bump no está en ningún sitio legible. |
| **S6** | Ediciones locales conservadas (`kept`) no tienen registro de *por qué*. | Al siguiente conflicto nadie sabe si la edición local era deliberada o accidental. |

### 2.5.5 La síntesis: el ciclo de cambio **es** el lenguaje que le falta a SpecOps

Esta es la conclusión que reordena todo el plan:

> **Delta specs no compiten con SpecOps: son su formato de transporte.**

Con delta specs, cada problema de §2.5.4 se resuelve con la misma pieza:

| Problema | Solución con deltas |
|---|---|
| S1 — diff opaco | `specops diff --as-change` genera un **cambio propuesto** con delta specs derivadas de comparar los requisitos del pack `v0.1.0` vs `v0.2.0`. Revisas *intención*, no ficheros. |
| S2 — unidireccional | `specops contribute` empaqueta un cambio local que toca requisitos del pack como delta spec y abre PR contra el repo del pack. **El bucle se cierra.** |
| S3 — sin gate | `validate --against-lock` deja de ser un diff binario: reporta *qué requisitos* han divergido, con `fix` accionable. |
| S5 — versionado opaco | El pack publica `changes/archive/` como su changelog semántico. `v0.2.0` = estos deltas. Un `CHANGELOG.md` de requisitos, generado, no escrito. |
| S6 — ediciones sin motivo | Una edición local nace como cambio (`csda change new`), no como edición suelta. `kept` pasa a tener una propuesta detrás. |
| S4 — barrera de entrada | El ciclo de cambio funciona **sin packs**. SpecOps deja de ser la puerta y pasa a ser el siguiente paso natural. |

### 2.5.6 Reglas de diseño que SpecOps impone al resto del plan

1. **No inventar un segundo motor de merge.** El `archive` de F1 reutiliza
   `scripts/specops/merge.ts` y el modelo de baseline. Un solo motor, dos
   consumidores.
2. **El ciclo de cambio debe ser independiente de los packs**, pero
   *pack-aware*: si un requisito viene de un pack, el cambio lo sabe y lo marca
   (`origin: pack:parking-management/backend@v0.1.0`).
3. **Nada de lo que se añada puede degradar `sync`.** Los nuevos directorios
   (`docs/specs/changes/`) son territorio del proyecto: el pack nunca los
   sobrescribe, salvo los cambios que él mismo distribuye (§F1B).
4. **SpecOps se mantiene como el diferenciador de la comparativa comercial.**
   En `docs/comparisons.md`, la fila que decide es "¿puedes versionar,
   distribuir y actualizar tu dominio entre 20 proyectos?" — no "¿tienes
   comandos slash?".

### 2.5.7 Veredicto

SpecOps es el activo más valioso y más infra-comunicado del proyecto. No hay
nada equivalente en el mercado de SDD. El plan **no lo toca para reducirlo**:
lo dota del lenguaje que le faltaba (deltas), le cierra el bucle
(`contribute`), le pone gate (`--against-lock`) y le quita el peso de ser la
puerta de entrada. Si hubiera que elegir una sola cosa que construir de todo
este documento, sería la **fase F1B**.

---

## 3. Diagnóstico: las 9 brechas

| ID | Brecha | Impacto | Fase |
|---|---|---|---|
| **G1** | No existe el objeto "cambio" ni el formato delta ni `archive` | Crítico | F1 |
| **G2** | La spec no evoluciona: `traceability.md` guarda estado, no historia de intención | Crítico | F1 |
| **G3** | Sin superficie nativa de agente (slash commands por herramienta) | Alto | F2 |
| **G4** | Sin contrato JSON estable ni catálogo de diagnósticos con `fix` | Alto | F2 |
| **G5** | Flujo de artefactos rígido y no configurable | Medio | F3 |
| **G6** | Time-to-first-value alto; superficie del CLI abrumadora (25+ comandos en el help) | Medio | F3 |
| **G7** | Documentación monolítica; no hay glosario, FAQ ni troubleshooting | Medio | F3 |
| **G8** | Sin `update`, sin `completion`, `doctor` no cubre el nuevo modelo | Bajo | F4 |
| **G9** | Sin planificación multi-repo ni schemas de comunidad | Bajo | F4 |
| **S1–S6** | SpecOps infra-explotado: diff opaco, flujo unidireccional, sin gate de drift, barrera de entrada (§2.5.4) | **Crítico** | **F1B** |

---

## 4. Estrategia: absorber, no copiar

Tres reglas de diseño para todo el plan:

1. **El cambio (`change`) se convierte en el objeto de primera clase de CSDA.**
   Packs, harness, trazabilidad y validación se re-expresan *alrededor* de él.
   Un pack pasa a poder distribuir *cambios*, no solo scaffolding.
2. **Todo lo nuevo es aditivo y opcional.** Un proyecto CSDA existente sigue
   funcionando sin `docs/specs/changes/`. `validate` no falla por su ausencia.
3. **Nuestra diferenciación se aplica en el punto de fusión.** Donde OpenSpec
   archiva markdown, nosotros archivamos markdown **y** actualizamos la matriz
   **y** materializamos/actualizamos el `.feature` **y** dejamos el REQ bajo el
   gate TDD. El `archive` de CSDA es un acto de ingeniería, no de documentación.
4. **El delta es el formato de transporte de SpecOps** (§2.5.5). Un solo motor
   de merge (`scripts/specops/merge.ts`) sirve a `sync` y a `archive`. Un solo
   formato (delta spec) sirve a la propuesta local, al diff de un bump de pack
   y a la contribución de vuelta. Si una decisión de diseño obliga a duplicar
   motor o formato, está mal planteada.

---

## 5. Plan por fases

Notación: **`OS-{fase}-{n}`**. Esfuerzo en PD de un ingeniero senior.
Cada paso lista ficheros concretos y criterio de aceptación.

### F0 — Decisiones y cimientos (3 PD)

| Paso | Descripción | Entregable | PD |
|---|---|---|---|
| **OS-0-01** | ADR `0015-change-lifecycle.md`: adoptar el modelo change/delta/archive; justificar ubicación `docs/specs/changes/` frente a `openspec/`-style raíz | `docs/specs/adr/0015-change-lifecycle.md` | 0.5 |
| **OS-0-02** | ADR `0016-delta-spec-format.md`: gramática exacta de las secciones ADDED/MODIFIED/REMOVED y su extensión con IDs `REQ-NNN`/`SCN-NNN` | ADR | 0.5 |
| **OS-0-03** | ADR `0017-agent-json-contract.md`: un documento JSON por invocación, stdout/stderr, envoltorio de diagnóstico, exit codes | ADR | 0.5 |
| **OS-0-04** | ADR `0018-artifact-schemas.md`: grafo de artefactos configurable, "enablers not gates" | ADR | 0.5 |
| **OS-0-05** | Spike: parser markdown de requisitos/escenarios reutilizable (specs y deltas comparten AST) | `scripts/change/parser.ts` (prototipo) + tests | 1.0 |

**Gate de salida F0:** los 4 ADRs aceptados y el parser prototipo capaz de
leer un `spec.md` de ejemplo y devolver `{purpose, requirements[{id, text,
scenarios[]}]}`.

---

### F1 — Ciclo de vida del cambio (18 PD) · **la fase que más importa**

Cubre **G1** y **G2**.

#### Estructura de directorios propuesta (en el proyecto generado)

```
docs/specs/
├── capabilities/<cap>/spec.md      # fuente de verdad por capability (nuevo, opcional)
├── changes/
│   ├── <change-id>/
│   │   ├── proposal.md
│   │   ├── design.md               # opcional
│   │   ├── tasks.md
│   │   ├── change.yaml             # schema, skip_specs, retire_capabilities, req_range
│   │   ├── specs/<cap>/spec.md     # DELTA
│   │   └── features/**/*.feature   # Gherkin propuesto (¡nuestra extensión!)
│   └── archive/YYYY-MM-DD-<change-id>/
├── traceability.md                 # existente — ahora lo actualiza `archive`
└── (resto de artefactos DDD existentes, intactos)
```

#### Formato delta de CSDA (superconjunto del de OpenSpec)

```markdown
# Delta — pricing

## ADDED Requirements

### Requirement: REQ-014 — Dynamic peak pricing
El sistema SHALL aplicar un recargo del 20 % en horas punta.

#### Scenario: SCN-014a — Recargo en hora punta
- GIVEN una sesión iniciada a las 18:00
- WHEN se calcula la tarifa
- THEN el importe incluye un recargo del 20 %

<!-- csda:trace uc=UC-007 cmd=CMD-011 agg=AGG-Pricing evt=EVT-PriceApplied
     feature=features/billing/dynamic_pricing.feature -->
```

El comentario `csda:trace` es el puente entre el mundo OpenSpec (markdown
plano, legible) y el nuestro (matriz DDD). Es opcional: sin él, el delta sigue
siendo válido y el REQ se archiva con columnas `-`.

#### Pasos

| Paso | Descripción | Ficheros | Criterio de aceptación | PD |
|---|---|---|---|---|
| **OS-1-01** | `csda change new <id>` — crea la carpeta, `change.yaml`, plantillas vacías según schema | `scripts/change/new.ts`, `templates/change/*.tpl` | `csda change new add-dynamic-pricing` crea la estructura y sale 0; re-ejecutar falla con código `change_exists` | 2 |
| **OS-1-02** | `csda change list [--json]` — cambios activos, tareas completadas/total, estado | `scripts/change/list.ts` | Muestra `no-tasks \| in-progress \| complete` por cambio | 1 |
| **OS-1-03** | `csda change show <id> [--json]` — proposal, deltas, conteos | `scripts/change/show.ts` | Devuelve `{id,title,deltaCount,deltas[]}` | 1 |
| **OS-1-04** | Parser + validador de deltas: secciones válidas, requisito con ≥1 escenario, ID único, MODIFIED/REMOVED referencian requisitos existentes | `scripts/change/delta.ts`, `scripts/change/validate.ts` | Suite de 20 fixtures buenos/malos; cada fallo emite `{code, message, fix, line}` | 3 |
| **OS-1-05** | `csda change validate [<id>] [--strict] [--json]` integrado en `csda validate` | `scripts/validate_specs.ts` (extensión) | `validate` de un proyecto sin `changes/` sigue pasando (retrocompatibilidad, test explícito) | 2 |
| **OS-1-06** | **`csda change archive <id>`** — motor de fusión: aplica ADDED/MODIFIED/REMOVED sobre `capabilities/<cap>/spec.md`, mueve a `archive/YYYY-MM-DD-<id>/` | `scripts/change/archive.ts` | Merge idempotente; `--dry-run` imprime el diff; conflicto → exit 1 con `archive_spec_update_failed` | 3 |
| **OS-1-07** | **Diferenciador:** el archive **también** inserta/actualiza filas en `traceability.md` a partir de los `csda:trace`, y copia los `.feature` propuestos a `features/` | `scripts/change/archive.ts` | Tras archivar, `csda plan` lista el nuevo REQ como pendiente, y `validate --strict-tdd` falla en cuanto su estado pasa a `In Dev` sin test | 3 |
| **OS-1-08** | `csda change status [--json]` — qué artefacto toca escribir a continuación según el grafo | `scripts/change/status.ts` | Devuelve `artifacts[]` en orden de dependencia con `done\|ready\|blocked\|skipped` | 2 |
| **OS-1-09** | `retire_capabilities` y `skip_specs` en `change.yaml` (cambios de tooling sin impacto en specs) | `scripts/change/config.ts` | Un cambio con `skip_specs: true` archiva sin deltas y no falla | 1 |

**Gate de salida F1:** demo end-to-end grabada — `change new` →
editar delta a mano → `change validate` → `change archive` → la spec de la
capability contiene el requisito, la matriz tiene la fila (estado `Draft`), el
`.feature` está en `features/`, `csda plan` ya lo lista como pendiente, y en
cuanto el REQ pasa a `In Dev` sin test, `validate --strict-tdd` falla con
`[TDD-1]`. Ese fallo *es* la demo: es lo que OpenSpec no puede enseñar.

> El REQ se archiva en `Draft`, no en `In Dev`: acabar de especificar algo no
> es empezar a construirlo. El gate se arma en el archive y dispara cuando el
> trabajo arranca.

---

### F1B — SpecOps × ciclo de cambio (7 PD) · **la fase que más nos diferencia**

Cubre **S1–S6**. Depende de F1 (necesita el formato delta y el motor de
archive). Es la materialización de §2.5.5.

| Paso | Descripción | Ficheros | Criterio de aceptación | PD |
|---|---|---|---|---|
| **OS-1B-01** | **`specops diff --as-change`** — compara los requisitos del pack entre la versión bloqueada y la nueva, y **materializa un cambio propuesto** en `docs/specs/changes/upgrade-<pack>-<version>/` con `proposal.md` + delta specs (ADDED/MODIFIED/REMOVED) derivadas | `scripts/specops/diff.ts`, `scripts/change/from-pack.ts` | Bump `v0.1.0 → v0.2.0` del pack de parking produce un cambio revisable donde se lee *"ADDED REQ-014 dynamic pricing"*, no *"~ traceability.md"* | 2.5 |
| **OS-1B-02** | **`specops contribute --change <id>`** — empaqueta un cambio local que toca requisitos de origen pack como delta spec en el formato del pack, y prepara la rama/PR contra el repo del pack | `scripts/specops/contribute.ts` | Genera rama + delta + `proposal.md` en un clon del pack; `--dry-run` imprime el árbol. Cierra el bucle S2 | 2 |
| **OS-1B-03** | **`validate --against-lock`** (pendiente en el roadmap de SpecOps desde M3) — falla en CI si el proyecto ha divergido de la versión bloqueada, **reportando requisitos divergentes**, no ficheros | `scripts/validate_specs.ts`, reutiliza `diff.ts` | Exit 1 con `{code: pack_drift, target: REQ-007, fix: "csda specops diff --as-change …"}` | 1 |
| **OS-1B-04** | **Procedencia**: cada requisito archivado registra su origen (`origin=pack:<pack_id>@<version>`) | `scripts/specops/as_change.ts`, `scripts/change/archive.ts` | La procedencia sobrevive al archivado; `doctor` podrá detectar requisitos de pack editados localmente sin cambio asociado (S6) | 1 |

> **Desviación asumida en OS-1B-04.** El plan pedía una columna `Origen` en la
> matriz. Se descartó: `parseTraceabilityRows` identifica una fila por tener
> exactamente 10 celdas, así que una columna 11 rompería a todos los
> consumidores actuales de la matriz por un campo que solo lee el tooling.
> La procedencia va en el comentario `csda:trace`, que ya es el punto de
> extensión y sobrevive al `archive` porque el renderer reescribe el trace
> completo.
| **OS-1B-05** | **Packs que distribuyen cambios**: un pack puede traer `changes/`; `specops sync` los deposita como cambios *propuestos*, nunca aplicados. El `changes/archive/` del pack se convierte en su changelog semántico (S5) | `scripts/specops/sync.ts`, `schemas/pack.schema.json` | Un pack con `changes/` no rompe proyectos con CLI antiguo (campo opcional en el schema) | 0.5 |

**Gate de salida F1B:** grabar el bucle completo bidireccional — el pack
publica `v0.2.0` → el proyecto hace `specops diff --as-change` → revisa la
propuesta → `specops sync` → `change archive` → matriz y `.feature`
actualizados con `origin: pack` → el equipo descubre un escenario que falta →
`csda change new` → `specops contribute` → PR en el repo del pack.
**Ese vídeo no lo puede grabar ningún competidor.**

---

### F2 — Superficie de agente y contrato JSON (10 PD)

Cubre **G3** y **G4**.

| Paso | Descripción | Ficheros | Criterio de aceptación | PD |
|---|---|---|---|---|
| **OS-2-01** | Envoltorio de diagnóstico común `{severity, code, message, target?, fix?}` + helper de fallo JSON-aware | `scripts/lib/diagnostics.ts` | Todo error del CLI pasa por el helper; ningún `console.error` suelto en modo `--json` | 1.5 |
| **OS-2-02** | `--json` en **todos** los comandos aptos para agente: un documento en stdout, prosa a stderr, null-shape en fallo | `bin/create-spec-driven-app.ts`, `scripts/**` | Test: `cmd --json 2>/dev/null \| jq .` parsea en los 12 comandos, éxito y fallo | 2.5 |
| **OS-2-03** | Contrato de exit codes: 0 éxito (incl. hallazgos), 1 fallo, 130 cancelación | idem | Tabla en docs + tests por comando | 0.5 |
| **OS-2-04** | **`docs/specs/agent-contract.md`**: shapes campo a campo, catálogo de códigos, inconsistencias conocidas | doc + tests snapshot que fallan si cambia una shape | El doc se genera/verifica desde tests, no a mano | 2 |
| **OS-2-05** | `csda agents init --tool claude,cursor,copilot,windsurf,aider,gemini,cline,codex,...` — genera ficheros de instrucciones y comandos slash | `scripts/agents/*.ts`, `templates/agents/**` | Genera `.claude/commands/csda-*.md`, `.cursor/rules/csda.mdc`, `.github/copilot-instructions.md`, `AGENTS.md`; `--dry-run` lista destinos | 2 |
| **OS-2-06** | Comandos slash: `/csda:explore`, `/csda:propose`, `/csda:apply`, `/csda:verify`, `/csda:archive`, `/csda:onboard` — cada uno invoca `csda change instructions <artifact> --json` | `templates/agents/commands/*.md.tpl` | Un agente completa el bucle sin que el humano escriba un comando de CLI | 1.5 |
| **OS-2-07** | `csda change instructions <artifact> [--json]` — devuelve plantilla + contexto + reglas + dependencias + `unlocks` | `scripts/change/instructions.ts` | Es la fuente única que consumen slash commands, MCP y harness | incluido |

> **Sinergia:** `harness run` deja de construir su prompt ad-hoc y pasa a
> consumir `change instructions apply --json`. Un solo motor de contexto para
> harness, MCP, VS Code y comandos slash.

**Gate de salida F2:** Claude Code, Cursor y Copilot ejecutan el ciclo
completo sobre un repo brownfield real usando solo comandos slash generados.

---

### F3 — Schemas, perfiles y documentación (14 PD)

Cubre **G5**, **G6**, **G7**.

| Paso | Descripción | Ficheros | Criterio de aceptación | PD |
|---|---|---|---|---|
| **OS-3-01** | Grafo de artefactos configurable: `.csda/schemas/<name>/schema.yaml` con `artifacts[{id, generates, requires}]` | `scripts/schema/*.ts` | Schema `spec-driven` (built-in) reproduce el flujo actual | 2 |
| **OS-3-02** | `csda schema init \| fork \| validate \| which` | idem | `schema fork spec-driven bdd-first` produce un schema válido editable | 1.5 |
| **OS-3-03** | Schema built-in **`bdd-first`**: `proposal → feature → spec → tasks` (el `.feature` *antes* que la spec) — nuestra opinión de producto | `schemas/bdd-first/schema.yaml` | Usable end-to-end; documentado como recomendado para equipos con Cucumber | 1 |
| **OS-3-04** | Perfiles `core \| full` en `csda config`: el help por defecto muestra 6 comandos; `--help --all` muestra los 25 | `bin/create-spec-driven-app.ts` | Time-to-first-value medido < 5 min en usuario nuevo (test de usabilidad con 3 personas) | 1.5 |
| **OS-3-05** | Rigor progresivo: `change new --lite` (proposal + tasks) vs `--full` (todo + design + contratos) | `scripts/change/new.ts` | Documentado con criterio explícito de cuándo usar cada uno | 1 |
| **OS-3-06** | `csda onboard` — tour guiado sobre repo existente: detecta stack, propone capabilities, genera el primer cambio | `scripts/onboard.ts` | Sobre un repo real ajeno produce ≥3 capabilities razonables y 1 cambio | 2 |
| **OS-3-07** | Reestructurar `docs/` al modelo de guías cortas: `overview`, `getting-started`, `concepts`, `workflows`, `writing-specs`, `reviewing-changes`, `existing-projects`, `commands`, `cli`, `agent-contract`, `customization`, `glossary`, `faq`, `troubleshooting` | `docs/**` | Ninguna guía > 300 líneas; README reducido a < 150 líneas con enlaces | 3 |
| **OS-3-08** | Contexto de idioma configurable (specs en ES/EN/PT) inyectado en prompts e instrucciones | `csda config set language` | Un cambio generado en español mantiene términos técnicos en inglés | 1 |
| **OS-3-09** | Actualizar `docs/comparisons.md` con OpenSpec como columna principal, honesto en ambos sentidos | doc | Incluye "cuándo elegir OpenSpec en vez de CSDA" | 1 |

**Gate de salida F3:** un usuario nuevo, sin leer el README completo, completa
el bucle en < 15 minutos siguiendo solo `docs/getting-started.md`.

---

### F4 — Paridad de DX y alcance multi-repo (8 PD)

Cubre **G8** y **G9**.

| Paso | Descripción | PD |
|---|---|---|
| **OS-4-01** | `csda update` — regenera ficheros de instrucciones y comandos slash tras un upgrade de versión, preservando ediciones locales (3-way merge, ya lo sabemos hacer: reutilizar `scripts/specops/merge.ts`) | 2 |
| **OS-4-02** | `csda completion [bash\|zsh\|fish] [--install]` | 1 |
| **OS-4-03** | `csda doctor` extendido: salud del directorio de cambios, deltas huérfanos, cambios archivados con tareas sin marcar, drift entre matriz y specs, requisitos de pack editados sin cambio asociado — **cada hallazgo con `fix` accionable** | 2 |
| **OS-4-04** | Planificación multi-repo: **no replicar *Stores*.** La respuesta de CSDA es un pack privado compartido — ya lo tenemos. Solo falta azúcar: `csda init --from-pack <repo>@<tag>` en un paso, y `specops.config.yaml` heredable entre repos | 2.5 |
| **OS-4-05** | Governance de repo: `SECURITY.md`, `CODEOWNERS`, changesets para releases, devcontainer | 0.5 |

---

## 6. Diseño técnico de las piezas nuevas

### 6.1 Superficie CLI resultante (agrupada por audiencia)

```
# Humano — ruta core
csda init | adopt | onboard | doctor

# Ciclo de cambio — humano y agente
csda change new <id> [--lite|--full] [--schema <name>]
csda change list   [--json]
csda change show <id> [--json]
csda change status [<id>] [--json]
csda change instructions <artifact|apply|archive> [--json]
csda change validate [<id>] [--strict] [--json]
csda change archive <id> [--yes] [--dry-run] [--json]

# Gobierno — CI (ya existente, ahora consciente de cambios)
csda validate [--strict-tdd] [--json]
csda plan | done | report | ci init | alm sync

# SpecOps — existente + nuevo (F1B)
csda pack init|lint|infer|bundle | registry build|serve
csda specops add | remove | sync | diff [--as-change] | contribute --change <id>
csda validate --against-lock

# Automatización — ya existente, ahora sobre `change instructions`
csda harness run | prompt

# DX
csda config | update | completion | agents init | telemetry
```

### 6.2 `change.yaml`

```yaml
csda_change_version: 1
schema: spec-driven          # o bdd-first, o uno propio
created: 2026-08-14
rigor: lite                  # lite | full
skip_specs: false            # cambios de tooling sin impacto en comportamiento
retire_capabilities: false   # permite borrar una spec al eliminar su último requisito
req_range: [REQ-014, REQ-016] # IDs reservados por este cambio (evita colisiones en paralelo)
```

`req_range` es una pieza que OpenSpec no necesita (no tiene IDs) y nosotros sí:
reserva el rango al crear el cambio para que dos cambios en paralelo no
asignen el mismo `REQ-NNN`.

### 6.3 Motor de fusión de `archive` (orden de operaciones)

```
1. validate(change, --strict)          → aborta si hay deltas inválidos
2. resolve(deltas → capabilities)      → detecta colisiones con cambios ya archivados
3. dry-run diff                        → si --dry-run, imprime y termina 0
4. apply ADDED/MODIFIED/REMOVED        → escribe capabilities/<cap>/spec.md
5. sync traceability.md                → upsert de filas desde csda:trace
6. materialize features/**             → copia .feature propuestos (nunca sobrescribe sin --force)
7. move → archive/YYYY-MM-DD-<id>/
8. report                              → { specsUpdated, totals, warnings[] }
```

Los pasos 4–7 son transaccionales: si falla cualquiera, se revierte lo escrito
(escritura en staging + rename atómico).

### 6.4 Retrocompatibilidad

- Proyectos generados con ≤ 0.1.4 no tienen `docs/specs/changes/`. `validate`
  detecta su ausencia y omite las reglas de cambio (no es un warning).
- `docs/specs/capabilities/` es opcional: si no existe, los deltas archivados
  se fusionan contra `spec.md` y `docs/specs/use-cases.md` como hoy.
- Ningún comando existente cambia de firma. Todo lo nuevo va bajo `csda change`
  y `csda agents`.

---

## 7. Lo que NO debemos copiar

| De OpenSpec | Por qué no |
|---|---|
| Telemetría opt-out | Nuestro opt-in es un argumento de venta en entornos regulados. Mantener. |
| "OpenSpec no toca git" como dogma | Nuestro harness aporta valor precisamente porque sí lo hace. Documentarlo como opcional y aislado (worktrees), no eliminarlo. |
| Escenarios solo en prosa | Nuestro Gherkin es ejecutable. La prosa GIVEN/WHEN/THEN del delta debe poder **generar** el `.feature`, no sustituirlo. |
| Abandonar los packs por markdown plano | El pack con JSON Schema es nuestro foso. Lo que sí hacemos es **rebajar la fricción de entrada**: los packs pasan a ser opcionales, no la puerta de entrada. |
| *Stores* (repo de specs compartido) | Es una versión débil de SpecOps: comparte, no versiona ni fusiona (§2.5.3). Construirlo sería regresión conceptual. La respuesta es un pack privado + `init --from-pack`. |
| Su casing inconsistente (snake vs camel) | Fijar `camelCase` en todo el JSON desde el día 1 y documentarlo. Empezamos sin deuda. |

---

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Duplicidad conceptual: `traceability.md` (estado) vs `changes/` (intención) confunde a los usuarios | Doc `concepts.md` con un único diagrama canónico: *cambio = intención en vuelo; matriz = estado consolidado*. `doctor` detecta drift entre ambos. |
| R2 | El motor de merge de deltas es la pieza con más superficie de bug | Property-based testing con `fast-check` (ya está en devDependencies) sobre secuencias aleatorias de ADDED/MODIFIED/REMOVED; invariante: aplicar y revertir es identidad. Mutation testing con Stryker sobre `scripts/change/`. |
| R3 | Crecimiento del CLI a 35+ comandos → percepción de complejidad | Perfiles `core/full` (OS-3-04) y agrupación por audiencia en el help. Métrica: comandos visibles por defecto ≤ 8. |
| R4 | Esfuerzo de mantener plantillas para 30+ herramientas de IA | Una única plantilla canónica + adaptadores por herramienta (path + formato de front-matter). Test que verifica que todos los adaptadores producen el mismo contenido semántico. |
| R5 | OpenSpec se mueve rápido (Stores, workspaces) y volvemos a quedar detrás | No perseguir su roadmap. F4 solo alcanza paridad donde hay demanda real de usuarios nuestros. La ventaja se defiende en ejecución (gates, packs, harness), no en features de planificación. |
| R6 | El derivador de deltas de `specops diff --as-change` (OS-1B-01) produce ruido en vez de intención cuando el pack cambia plantillas sin cambiar requisitos | Derivar deltas del **AST de requisitos** (`pack.yaml` + specs renderizadas), nunca del diff textual de ficheros. Cambios que no alteran ningún requisito se reportan como `chore` sin generar cambio propuesto. Test: bump que solo reformatea → 0 deltas. |
| R7 | `specops contribute` empuja a repos ajenos → riesgo de acción irreversible no intencionada | Nunca hace push automático: genera rama local + delta y **imprime** el comando de push. `--dry-run` por defecto en CI. |

---

## 9. Métricas de éxito

| Métrica | Hoy | Objetivo post-F3 |
|---|---|---|
| Time-to-first-value (usuario nuevo, primer artefacto útil) | ~25 min | < 5 min |
| Comandos visibles en `--help` por defecto | 25 | ≤ 8 |
| Comandos con `--json` documentado | 1 | 12 (100 % de los aptos para agente) |
| Herramientas de IA con comandos slash generados | 0 | ≥ 8 |
| Ciclo brownfield completo sin editar YAML de pack | ❌ imposible | ✅ |
| Cobertura de mutación en `scripts/change/` | n/a | ≥ 70 % |
| Longitud del README | 264 líneas | < 150 |

---

## 10. Checklist ejecutable

> **Actualizado 2026-08-16.** F0, F1 y F1B están cerradas y verificadas contra
> el código en `main`. F2, F3 y F4 siguen siendo el trabajo pendiente real, y
> están replanificadas como fases 3, 4 y 5 de
> [`plan-cierre-enterprise.md`](plan-cierre-enterprise.md).

```
F0 — Cimientos (3 PD)
[x] OS-0-01  ADR change lifecycle
[x] OS-0-02  ADR formato delta
[x] OS-0-03  ADR contrato JSON de agente
[x] OS-0-04  ADR schemas de artefactos
[x] OS-0-05  Spike parser markdown compartido

F1 — Ciclo de cambio (18 PD)   ← máxima prioridad
[x] OS-1-01  csda change new
[x] OS-1-02  csda change list
[x] OS-1-03  csda change show
[x] OS-1-04  parser + validador de deltas
[x] OS-1-05  integración con csda validate
[x] OS-1-06  csda change archive (motor de fusión)
[x] OS-1-07  archive → traceability.md + features/   ← el diferenciador
[x] OS-1-08  csda change status
[x] OS-1-09  skip_specs / retire_capabilities

F1B — SpecOps × cambios (7 PD)   ← el mayor diferenciador
[x] OS-1B-01  specops diff --as-change   (revisar intención, no ficheros)
[x] OS-1B-02  specops contribute         (cierra el bucle hacia el pack)
[x] OS-1B-03  validate --against-lock    (gate de drift, pendiente desde M3)
[x] OS-1B-04  procedencia origin= en csda:trace (ver desviación en F1B)
[x] OS-1B-05  packs que distribuyen cambios (changelog semántico del pack)

F2 — Agente (10 PD)
[ ] OS-2-01  envoltorio de diagnóstico
[ ] OS-2-02  --json en todos los comandos
[ ] OS-2-03  contrato de exit codes
[ ] OS-2-04  docs/specs/agent-contract.md verificado por tests
[ ] OS-2-05  csda agents init (multi-herramienta)
[ ] OS-2-06  comandos slash /csda:*
[ ] OS-2-07  csda change instructions (motor único de contexto)

F3 — Schemas, perfiles, docs (14 PD)
[ ] OS-3-01  grafo de artefactos configurable
[ ] OS-3-02  csda schema init/fork/validate/which
[ ] OS-3-03  schema built-in bdd-first
[ ] OS-3-04  perfiles core/full en el help
[ ] OS-3-05  rigor progresivo (--lite/--full)
[ ] OS-3-06  csda onboard
[ ] OS-3-07  reestructura de docs/ en guías cortas
[ ] OS-3-08  contexto de idioma
[ ] OS-3-09  comparativa actualizada vs OpenSpec

F4 — DX y multi-repo (8 PD)
[ ] OS-4-01  csda update
[ ] OS-4-02  csda completion
[ ] OS-4-03  doctor consciente de cambios y de procedencia
[ ] OS-4-04  csda init --from-pack (multi-repo sin copiar Stores)
[ ] OS-4-05  governance de repo
```

---

## 11. Recomendación de arranque

Rama única **`feat/change-lifecycle`**, con **F1 → F1B** como un solo bloque de
trabajo. Razón: F1 sin F1B produce "otro OpenSpec"; F1B es lo que convierte el
ciclo de cambio en el lenguaje de SpecOps y nos deja en territorio propio.

**Dogfooding obligatorio:** escribir la propuesta del propio ciclo de cambio
usando el formato delta *a mano*, antes de que exista el comando. Si el formato
no se sostiene escribiéndolo a mano, tampoco se sostendrá generado.

**Prueba de fuego de F1B:** hacer que el pack público
`parking-management-specops` publique un `v0.2.0` y consumirlo con
`specops diff --as-change`. Si la propuesta generada no es más legible que el
`git diff`, la fase ha fallado y hay que replantear el derivador de deltas.

El resto del plan es incremental y paralelizable; F1 y F1B no.

---

### Fuentes

- <https://openspec.dev>
- `Fission-AI/OpenSpec` — `README.md`, `docs/concepts.md`, `docs/cli.md`,
  `docs/commands.md`, `docs/opsx.md`, `docs/customization.md`,
  `docs/agent-contract.md`, `docs/workflows.md`, `docs/writing-specs.md`,
  `docs/existing-projects.md`, `docs/reviewing-changes.md`,
  `docs/team-workflow.md`, `docs/multi-language.md`, y el propio
  `openspec/changes/` del repo (dogfooding visible).
