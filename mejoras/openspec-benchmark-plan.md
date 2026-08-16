# Benchmark: OpenSpec vs `create-spec-driven-app`


> **Recortado el 2026-08-16.** Este documento era un análisis *y* un plan de
> ejecución en seis fases. Las fases se ejecutaron —F0, F1 y F1B durante agosto;
> F2, F3 y F4 como fases 3, 4 y 5 de
> [`plan-cierre-enterprise.md`](plan-cierre-enterprise.md)— así que el plan, su
> checklist y el diseño técnico de las piezas se han eliminado: duplicaban el
> plan de cierre y describían trabajo terminado como si estuviera pendiente.
>
> Lo que queda es lo que no caduca: qué es OpenSpec, la comparativa honesta, la
> valoración de SpecOps y qué decidimos **no** copiar. `docs/comparisons.md` cita
> este documento como la evidencia de su columna de OpenSpec.

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

### Fuentes

- <https://openspec.dev>
- `Fission-AI/OpenSpec` — `README.md`, `docs/concepts.md`, `docs/cli.md`,
  `docs/commands.md`, `docs/opsx.md`, `docs/customization.md`,
  `docs/agent-contract.md`, `docs/workflows.md`, `docs/writing-specs.md`,
  `docs/existing-projects.md`, `docs/reviewing-changes.md`,
  `docs/team-workflow.md`, `docs/multi-language.md`, y el propio
  `openspec/changes/` del repo (dogfooding visible).
