# De la puerta al verificador — qué le falta a CSDA para comprobar el código, y no solo el papeleo

> **Reescrito el 2026-08-25.** La versión anterior de este fichero comparaba CSDA con
> [Predictable Code](https://code.predictablemachines.com) sobre una tabla de 21
> huecos. Nueve de esos huecos no los reclama nadie: eran ideas nuestras con etiqueta
> de «vamos por detrás». Y la columna de lo que CSDA ya tiene también inflaba. Esta
> versión mantiene el hallazgo real —que es uno y es grande— y tira el resto.

---

## 1. Método, y qué no se hizo

| | |
|---|---|
| **Qué se leyó del rival** | Su página pública, `code.predictablemachines.com`, el 2026-08-25. Nada más |
| **Qué NO se hizo** | Nadie de aquí ha usado Predictable Code. Está en *private beta*: no hay CLI que ejecutar, ni lenguajes publicados, ni precio |
| **Qué se midió de CSDA** | El árbol de este repositorio en `main`, v0.7.0. Cada afirmación de §3 lleva `fichero:línea` |

**Regla para mantener este documento:** toda fila de §2 lleva **cita textual** de la
página del rival; toda fila de §3 lleva **`fichero:línea`** de este repo. No hay
tercera categoría. Una afirmación sin una de las dos cosas se borra, no se matiza.

Esa regla es la que faltaba, y es la causa de los tres defectos de la versión
anterior.

---

## 2. Lo que el rival reclama — verificado

Seis capacidades. Textual:

| # | Capacidad | Cita |
|---|---|---|
| PC-1 | Verificación formal | *«Predictable Code uses Lean 4 formal verification to prove that AI-generated code matches your specifications.»* |
| PC-2 | Proofs matemáticas continuas | *«Every change is checked against your specs in real time, producing mathematical proofs of correctness.»* |
| PC-3 | Proofs criptográficas de auditoría | *«Cryptographically verifiable proofs connect requirements → implementation → verification.»* |
| PC-4 | Inferencia de specs | *«Run predictable init, then predictable specs infer. The tool reads your source tree and generates formal behavioral specifications.»* |
| PC-5 | Status check nativo de GitHub | *«Every pull request is automatically checked against your specs as a native GitHub status check.»* |
| PC-6 | Plugin de Claude Code | *«Verify specs without leaving your coding flow. The plugin lets Claude run verification as part of your conversation.»* |

**Estado del producto:** private beta · public beta Q2 2026 · GA Q3 2026. Gratis para
participantes aceptados; precio sin anunciar. **Lenguajes soportados: no se
especifican.**

**No reclama** —y la versión anterior se lo atribuía— reportes de compliance
SOC 2 / HIPAA / PCI-DSS, counterexamples concretos, modo YOLO de reparación
automática, un visor local `specs/_viewer.html`, Z3/SMT, watch mode, plugin de Codex
CLI, 3-way resolution paths ni análisis AST multi-lenguaje con tree-sitter. Nueve
huecos de veintiuno. Ver §7: no se tiran, se reetiquetan.

---

## 3. Lo que CSDA tiene — medido, no recordado

Solo las filas donde la versión anterior se pasaba de frenada. El resto de su tabla
—packs, change lifecycle, ALM sync, harness, multi-CI, arquitectura hexagonal— es
correcto.

| Capacidad | Lo que decía | Lo que es | Evidencia |
|---|---|---|---|
| Mutation testing | ✅ | Piloto sobre **dos** ficheros, `testRunner: "command"`, `coverageAnalysis: "off"`, `thresholds.break: 0`. Es una línea base registrada, **no una puerta** | `stryker.config.mjs:32-33` |
| Property-based testing | ✅ fast-check para invariants | **Un** fichero de test | `tests/unit/property-based.test.ts:12` |
| HTML Report / Studio | «`csda report` + `csda studio` live dashboard» | `report` **escribe** un HTML autocontenido en `reports/`. `studio` es un **servidor HTTP** (puerto 4173) que no escribe nada, renderiza en memoria y **carga Mermaid desde `cdn.jsdelivr.net`** | `ReportCommand.ts:148,398` · `StudioCommand.ts:135,170-179` |
| MCP Server | «`read_spec`, `list_requirements`, `validate_project`, etc.» | Siete tools exactos: `read_spec`, `list_requirements`, `update_traceability`, `lint_pack`, `validate_project`, `plan`, `mark_requirement_done`. JSON-RPC escrito a mano, sin el SDK de MCP | `packages/mcp-spec-driven/src/tools.ts:382-390` · `server.ts:10-19` |
| LSP Server | «Diagnostics para traceability y pack.yaml» | Cuatro códigos —`STATUS`, `DUP-SCN`, `TDD-1`, `TDD-2`— **solo** sobre `traceability.md` en formato rich; se rinde si falta la cabecera. Sin diagnósticos de Gherkin, sin completions, sin hover, sin code actions | `packages/lsp-spec-driven/src/diagnostics.ts:81,103-131` |
| `csda validate` | «Quality Gates» | `--strict-tdd` = **tres** reglas, todas sobre la matriz. `--strict-scenarios` = ocho reglas de Gherkin. `--against-lock` **requiere red** (re-resuelve packs remotos) y degrada a aviso con matriz legacy | `ValidateProjectUseCase.ts:126,133,144` · `GherkinQuality.ts:70-78` · `CheckAgainstLockUseCase.ts:36,43` |
| Zero runtime dependencies | ✅ | Cierto, y **estructural**: el `package.json` raíz no tiene siquiera la clave `dependencies`. `YamlLite.ts` está escrito a mano por eso. Matiz: los paquetes MCP y VS Code, que se publican aparte, sí traen `js-yaml`/`ajv` | `package.json` · `packages/core/src/domain/YamlLite.ts` |

**El agujero air-gapped que ya existe:** `studio` pide Mermaid a un CDN. El argumento
de «procesamiento local» de la §8.2 anterior tiene un roto antes de que llegue
ninguna dependencia nueva.

---

## 4. El hueco real, y es uno

> **`csda validate` comprueba que el papeleo es coherente consigo mismo. No comprueba
> que el código haga lo que la spec dice.**

Ese es el techo del producto, y la versión anterior lo nombró bien (era su hueco 3).
Los huecos 1, 4 y 9 —inferencia, verificación continua, detección de divergencias— son
ese mismo hueco visto desde otro lado. La evidencia, medida:

| Hecho | Evidencia |
|---|---|
| `--strict-tdd` son tres reglas, y las tres leen la **matriz**: artefacto de test en `TBD` con estado post-Draft; fila rich sin Scenario ID con estado no-Draft; `REQ-\d+` en `spec.md` sin fila | `ValidateProjectUseCase.ts:126,133,144` |
| **No existe ningún parser de código fuente en el repo.** Cero apariciones de tree-sitter, `ts.createSourceFile`, babel, acorn, esprima, swc u oxc en `bin/`, `scripts/`, `packages/`, `templates/`, `schemas/` | grep repo-wide |
| `csda onboard` propone capabilities a partir de **nombres de directorio y conteo de ficheros**. Nunca abre uno | `OnboardCommand.ts:111` (`countFiles`, cuenta y no lee) · `:141` (`proposeCapabilities`) |
| `csda adopt` solo lee manifiestos de build (`pom.xml`, `build.gradle`, `package.json`) y por regex | `AdoptCommand.ts:76-123` |
| `csda fix` arregla exactamente dos cosas, **añadiendo filas a `traceability.md`**: features huérfanos y REQ-ids sin fila. No toca código, ni features, ni estados | `FixCommand.ts:47-72,188` |
| `DeclaredArtifacts` compara declaraciones de la matriz contra el diff de git — comprueba que un fichero **se tocó**, no qué dice | `DeclaredArtifacts.ts:49,65,85` |

Todo lo demás de este documento sirve a cerrar esa frase, o sobra.

---

## 5. Lo que NO copiamos

Sección calcada de `mejoras/openspec-benchmark-plan.md` §7. Su ausencia en la versión
anterior es precisamente por qué allí todo era un hueco a cerrar.

| Del rival | Por qué no |
|---|---|
| El vocabulario **«mathematical proof» / «cryptographically verifiable»** (PC-2, PC-3) | Es la trampa H13 con un auditor delante. Toda la serie H de `plan-cierre-enterprise.md` §12.11 es **un** defecto repetido —*la puerta aprueba sin comprobar*—; H1 quedó descrito como «la negación del producto» y H19 **sigue abierto**. Un SHA-256 sobre un check estructural es el hash de una heurística. Sellarla y llamarla proof es la versión de mayor apuesta del defecto que este repo lleva un mes cazándose a sí mismo |
| **Reportes de compliance SOC 2 / HIPAA / PCI-DSS** | El rival no los reclama; eran nuestros. Y ADR-0020 ya costó la lección: declaró el JSON Schema «única autoridad» sin que nadie lo aplicara, y diez de once packs lo fallaban mientras los once pasaban `pack lint --strict`. Se cerró rebajando la afirmación al hecho (`E1`, opción B). Firmar un informe HIPAA sobre verificación estructural es el mismo error con consecuencias legales |
| **Lean 4** (PC-1) | No hay ruta desde aquí. Se nombra como horizonte en §8, nunca como fase con fecha |
| **La inferencia con LLM como puerta de entrada** (PC-4, tal cual) | ADR-0014 ya decidió lo contrario para `pack infer`: *«Heuristic, not LLM, for v1. Deterministic output is testable, reviewable in a git diff, works offline, has no vendor dependency, and is instant.»* Si se revierte, se revierte con un ADR que lo enmiende — no de tapadillo dentro de una fase |
| **Un visor nuevo** | ADR-0019 decidió el 2026-08-16 que `csda studio` **es** la superficie de studio, y cerró —no aplazó— la Fase 4 de `visual-pack-authoring-todo.md`. Lo que falta de P2 son ~6 líneas de workflow para publicarlo, no una UI nueva |

---

## 6. Decisiones ya tomadas que la versión anterior pisaba

Cada una tiene dos salidas legítimas: **respetarla**, o **enmendarla con un ADR
nuevo**. Ninguna admite ignorarla en silencio, que es lo que hacía el documento.

| Decisión | Qué decía | Contra qué chocaba | Salida |
|---|---|---|---|
| **ADR-0014** (2026-05-14) | `pack infer` es heurístico y determinista; `--llm` diferido explícitamente | Fase 1.2 «AI-Assisted Spec Enrichment» | Respetar en v1. La inferencia arranca determinista; el LLM, si llega, entra por ADR |
| **ADR-0019** (2026-08-16) | `csda studio` es *la* superficie de studio | Hueco 18 «Local Spec Viewer» y Fase 3.3 | Respetar. Lo que se construya se construye **dentro** de `studio` |
| **ADR-0022** (2026-08-21) | *«Los patrones son opcionales; los principios no.»* Y: prosa que ninguna máquina verifica igual la obedece todo agente | Fase 1.2 y Fase 2.2, ambas capas de LLM cuyo veredicto nadie comprueba | Respetar. Un resultado no determinista no puede marcarse `verified` |
| **ADR-0020 + `E1`** (2026-08-23) | El esquema describe el formato que existe; nada afirma autoridad que no ejerce | Fase 4 entera (proofs, sellado, compliance) | Respetar. Es la regla que §5 aplica |
| **§13 del plan de cierre** | Watch mode aparcado, con motivo | Hueco 12 y Fase 2.5 | Sigue aparcado hasta que haya algo que observar |
| **D9 / D12** (2026-08-17) | Publicar plugins, extensión, scope npm y registry va a **v2** | Fase 5 (GitHub App) y Fase 6 (plugin de Codex) | v2. Una GitHub App es un canal de distribución con credenciales propias — exactamente lo que D12 movió |

---

## 7. Nuestras ideas, no las suyas

Los nueve huecos que el rival no reclama. No se tiran: dejan de ser «ponerse al día» y
pasan a ser propuesta propia, que es lo que siempre fueron. Se priorizan por lo que
rinden, no por quién los tenga.

| Idea | Valor | Nota honesta |
|---|---|---|
| **Counterexamples concretos** — cuando una comprobación falla, devolver el input exacto que la rompe | **Alto.** Es la diferencia entre «diverge» y una reproducción | Es también la más cara: sin solver hay que generarlos, y `fast-check` (ya en devDeps) hace justo eso. Ruta barata inexplorada |
| **Tres rutas ante una divergencia** — arreglar código / actualizar spec / retirar el requisito | **Alto y barato.** El ciclo de cambio ya existe (`csda change`), y `ArchiveChangeUseCase` ya sabe reescribir la matriz | Es pegamento entre piezas que ya están, no motor nuevo |
| **Watch mode** | Bajo hoy | Aparcado por §13. Observar una puerta que no comprueba lo que dice no aporta |
| **Modo YOLO de reparación automática** | Bajo | El harness ya es el bucle desatendido, con presupuesto (`C1`) y worktrees. Esto sería un segundo bucle peor |
| **Compliance SOC 2 / HIPAA / PCI-DSS** | Cero por ahora | Ver §5. Vuelve a la mesa cuando haya algo real que certificar |
| **Z3 / SMT** · **tree-sitter multi-lenguaje** · **`specs/_viewer.html`** · **plugin de Codex** | — | Ver §5 y §6 |

---

## 8. Por dónde se empieza

> **Premisa fijada el 2026-08-25:** verificación primero, 1.0 después. Ver `D14` en
> `mejoras/plan-cierre-enterprise.md` §14, donde consta también lo que cuesta.

### 8.1 · El orden va al revés de como estaba

La versión anterior construía el verificador y confiaba en que las specs contuvieran
algo verificable. No lo contienen. Su propio ejemplo lo demuestra: el bloque «Formal
Contract» que proponía son viñetas en prosa, y `- Max 5 failed attempts per hour per
user` no es comprobable por ninguna máquina tal como está escrito. Es exactamente la
prosa que ADR-0022 señala.

**Primero que la spec declare valores comprobables; después comprobarlos.** Eso ya
está en el backlog y cuesta «Bajo»: es `F6` (EARS opcional en la línea de requisito),
en `mejoras/valoracion-bdd-gherkin-era-agentes.md`. Sin ese paso, cualquier
verificador se queda en comparar nombres de fichero.

### 8.2 · La matriz no admite una columna más

La Fase 0.1 anterior pedía añadir `linked_files`, `proof_hash` y `last_verified` como
columnas. **No se puede**, y no es opinión:

- `TraceabilityFormat.ts:38` reconoce una fila rich por `cells.length === 10`.
- La nota de `:92-107` documenta que una columna 11 rompe el parser.
- **Y por eso** `depends=` y `context=` ya viajan fuera de la tabla, en líneas
  `<!-- csda:trace REQ-002 depends=… context=… -->`, con parser propio en `:108-198`.

El punto de extensión existe, está probado y lo usan `B1` y `D1`. Todo campo nuevo va
ahí. Coste de intentar lo otro, para que quede escrito: parser, serializador, el
driver de merge por filas del harness en paralelo
(`mejoras/colisiones-traceability-paralelo.md`), `change archive`,
`tests/unit/docs-truth.test.ts`, los once packs y todo proyecto ya generado.

### 8.3 · Hay dos gramáticas de `spec.md`, y el plan no decía a cuál iba

| Gramática | Dónde | Cómo se lee |
|---|---|---|
| **Capability spec** (`docs/specs/capabilities/<cap>/spec.md`) | `packages/core/src/domain/SpecParser.ts` | Parser real, orientado a líneas. Prefijos de etiqueta **cerrados** (`REQ, SCN, UC, CMD, QRY, AGG, EVT`, `:56`), y propiedad de punto fijo parse→render→parse (`:426`) |
| **`spec.md` raíz** (manifiesto, `## REQ-NNN — Título`) | Ninguno | Raspado por regex en **cinco** sitios: `ValidateProjectUseCase.ts:140`, `alm/core.ts:163`, `mcp/tools.ts:119`, `DoctorCommand.ts:155`, `FixCommand.ts:130` |

Un «contrato formal» en el raíz nace en cinco regex que ya divergen. En el de
capabilities, toca un parser con invariante de punto fijo y un conjunto cerrado de
prefijos. **Decisión: el contrato formal vive en el capability spec**, que es el único
que tiene gramática, y se expresa como campos del `csda:trace` que ese parser ya lee
(`parseTraceComment`, `SpecParser.ts:96`) antes que como secciones nuevas.

### 8.4 · Las dependencias hay que costearlas, no listarlas en riesgos

La versión anterior despachaba esto con «optional peer dependencies, graceful
degradation». Es la primera dependencia de runtime de la historia del proyecto:

- **tree-sitter** son bindings nativos N-API, y **una gramática compilada por
  lenguaje**.
- **z3-solver** son megas de WASM.
- Contra un `package.json` **sin clave `dependencies`**, que sostiene `npx`, el
  argumento air-gapped y la procedencia SLSA.

**El precedente del repo es explícito y va en contra.** Cuando hizo falta un parser de
Gherkin, se escribió a mano (`packages/core/src/domain/Gherkin.ts`, con la tabla de
dialectos vendorizada como datos) y `@cucumber/gherkin` quedó como **oráculo de test**
contra la deriva, en devDependencies. tree-sitter no admite ese trato: no se escribe a
mano un parser de Java.

O sea que esto es una bifurcación de la historia de distribución, y se decide como
tal —con ADR— no dentro de una fase.

### 8.5 · Lo que sí se puede hacer sin nada de lo anterior

Dos comprobaciones se nombraron aquí. La primera está hecha; la segunda sigue sin
diseñar.

**Hecha (2026-08-25): el vínculo declarado sigue apuntando a algo que existe.**
`csda validate --strict-links` lee las columnas Feature file / Technical artifact /
Test artifact de la matriz y falla si una ruta declarada ya no existe en disco.
Reutiliza `declaredPaths`/`looksLikePath`, ya escritos para `DeclaredArtifacts`
(A2) — ninguna dependencia nueva, nada de AST.

**Corrección medida, no supuesta.** La primera versión la hizo incondicional, con
el razonamiento de que "esta ruta no existe" no tiene lectura legítima.
`tests/unit/validate-strict-tdd.test.ts` lo desmintió de inmediato: una fila en
`Draft` o `In Dev` declara con normalidad el fichero donde un requisito **va a**
aterrizar, antes de que exista — planear no es deriva documental. Es la misma
razón por la que `declared_artifact_untouched` en `DeclaredArtifacts` ya es un
warning, no una certeza. Se corrigió a opt-in, misma promesa que
`--strict-scenarios`.

Ninguna de las dos es verificación formal y ninguna debe llamarse así. Es la
puerta comprobando una cosa más de las que hoy da por buenas — el patrón de la
Tanda 1, la que cerró H14, H15 y H16.

### 8.6 · Mitad 2 de §8.5, diseñada el 2026-08-26 — sin implementar

> **Estado: diseño cerrado, implementación pendiente por decisión explícita.**
> No se escribe código de esto hasta que se retome en otra sesión.

**El problema, en el ejemplo que la propia página del rival usa:** *"session
timeout is 30m but spec requires 15m"*. Ninguna comprobación de este documento
lo detecta — `--strict-requirements` valida la forma de la frase, no lo que
dice; `--strict-links` valida que el fichero exista, no lo que contiene. Falta
comparar un valor declarado en la spec contra el mismo valor declarado en el
código, sin AST y sin pretender entender ninguno de los dos.

**Restricción de quien retoma esto: no tocar `tests/unit/architecture.test.ts`
ni sus cuatro reglas.** El diseño de abajo se ajusta a ellas por construcción —
se explica dónde vive cada pieza y por qué — precisamente para que la próxima
sesión no tenga que decidirlo de nuevo.

#### La decisión: anotación explícita a ambos lados, comparada por igualdad literal

Ni AST ni heurística de nombres. Dos anotaciones, mismo identificador, texto
literal comparado por igualdad — el mismo trato que `csda:trace` ya da a
`depends=` y `context=`: explícito, determinista, y la herramienta no
interpreta nada, solo compara lo que un humano (o un agente) ya escribió dos
veces a propósito.

**Lado spec — dentro del `csda:trace` que el requisito ya lleva:**

```markdown
### Requirement: REQ-AUTH-002 — Token expiry

El sistema SHALL expirar el token de sesión a los 15 minutos de inactividad.

<!-- csda:trace uc=Login value_session_timeout=15m -->
```

Sin campo nuevo en el parser: `parseTraceComment` (`SpecParser.ts:96`) ya acepta
cualquier clave `[a-z_]+`. La convención es solo de nombrado — toda clave con
el prefijo `value_` declara un valor comprobable; lo que sigue al prefijo
(`session_timeout`) es el identificador que ambos lados comparten.

**Lado código — un marcador de una línea, en el lenguaje que sea:**

```ts
// csda:value session_timeout=15m
const SESSION_TIMEOUT = "15m";
```

No es un comentario reconocido por lenguaje — es una cadena literal buscada en
el texto del fichero, igual que `csda:trace` es una cadena literal buscada en
markdown. Funciona idéntico en `.ts`, `.py`, `.java`, `.go` sin saber nada de
ninguno, porque no analiza sintaxis: solo busca la frase `csda:value clave=valor`
en cualquier línea. Esto es lo que de verdad resuelve la pregunta multi-lenguaje
que el documento original creía necesitar tree-sitter para responder — el precio
es que alguien tiene que escribirlo, dos veces, a propósito.

**Qué ficheros se escanean — reutilizando el enlace que ya existe.** Nada de
campo nuevo para nombrar el fichero: se escanean los mismos `Technical
artifact` / `Test artifact` que `--strict-links` ya valida que existen para
ese requisito, correlacionando `req.id` (capability spec) con `row.requirement`
(matriz) — la misma correlación por id que `--strict-requirements` no necesitó
pero que aquí sí hace falta, porque el valor vive en el código, no en la spec.

**Comparación: igualdad de cadena exacta, nada más.** `15m` contra `15m` pasa;
`15m` contra `900000` falla, aunque ambos signifiquen lo mismo. Interpretar
unidades es el trabajo que este documento entero existe para no reclamar
(§5, la trampa H13) — normalizar la unidad es responsabilidad de quien escribe
las dos anotaciones, no de la herramienta.

#### Dónde vive cada pieza — por qué no rompe `architecture.test.ts`

| Pieza | Capa | Fichero (nuevo o existente) | Por qué esa capa |
|---|---|---|---|
| Extraer `value_*` de un `TraceComment` ya parseado | Dominio, puro | `packages/core/src/domain/ValueAnnotations.ts` (nuevo) — función `declaredSpecValues(trace)` | Recibe un objeto ya en memoria, no toca disco |
| Parsear `csda:value clave=valor` de un texto de código | Dominio, puro | mismo fichero — función `declaredCodeValues(source: string)` | Recibe una cadena ya en memoria — la misma disciplina que `Gherkin.ts` o `GherkinQuality.ts` con el texto de un `.feature` |
| Comparar ambos mapas y producir `Diagnostic[]` | Dominio, puro | mismo fichero — función `compareDeclaredValues(specValues, codeValues, opts)` | Solo estructuras de datos entrando y saliendo; sin `fs`, sin `path` |
| Leer el capability spec, la matriz y los ficheros de código; llamar a las tres funciones de arriba; imprimir | Comando (I/O) | `scripts/cli/commands/quality/ValidateSpecsCommand.ts`, junto a `checkRequirementSyntax` y `checkDeclaredArtifactsExist` | Exactamente donde vive hoy toda lectura de disco de `validate` — el propio comentario de `ValidateProjectUseCase.ts` ya dice que "los checks sobre el layout en disco se quedan con el comando" |

Ninguna pieza nueva importa desde `scripts/` hacia `packages/core/src` en la
dirección prohibida, ninguna hace I/O dentro de `domain/`, y `application/`
no se toca — no hace falta un nuevo caso de uso, el patrón de comando+dominio
que ya usan `--strict-requirements` y `--strict-links` alcanza. Las cuatro
reglas de `tests/unit/architecture.test.ts` quedan intactas por construcción,
no por vigilancia.

#### Superficie propuesta (sin implementar)

- Flag nuevo en `validate`: **`--strict-values`**. Opt-in — un proyecto sin
  ninguna anotación `value_*`/`csda:value` no tiene nada que comparar, mismo
  no-op que `--strict-links` en un proyecto recién creado.
- Código de diagnóstico nuevo: `declared_value_diverges` — mensaje con el
  identificador, el valor que dice la spec, el valor que dice el código, y los
  dos ficheros (`file:línea` en ambos lados, porque `csda:value` también lleva
  número de línea).
- Un identificador declarado en la spec sin su pareja en el código (o
  viceversa) **no es error** por defecto — solo se compara cuando ambos lados
  declaran el mismo identificador. Ese es el precedente de `A2`/`--strict-artifacts`:
  una comprobación que solo se pronuncia sobre lo que puede sustanciar.

#### Lo que esto no hace, dicho para que no se olvide

No verifica que el código *en efecto* respete el valor en tiempo de ejecución —
solo que la anotación del código coincida con la de la spec. Un `SESSION_TIMEOUT
= "15m"` correctamente anotado y después ignorado por el código real seguiría
pasando. Es detección de deriva entre dos declaraciones explícitas, no
verificación de comportamiento — exactamente el techo que §5 fija a propósito.
Y depende de adopción: nadie escribe `csda:value` por scaffolding automático
todavía, así que el primer uso real es dogfoodearlo sobre este propio repo o
sobre `csda-studio-app` (§3.5 de `mejoras/README.md`) antes de generalizarlo,
la misma disciplina que ya midió y corrigió `--strict-links`.

---

## 9. Cómo se mide el éxito

Fuera toda métrica que compare contra una capacidad no observada del rival. Quedan
tres, y las tres se miden en este repo:

| Métrica | Hoy | Objetivo |
|---|---|---|
| Comprobaciones de `validate` que leen algo distinto del papeleo | **0** | ≥ 1, determinista y sin dependencias de runtime |
| Requisitos cuya spec declara un valor comprobable (`F6`) | 0 | Medible, y es el prerrequisito de la anterior |
| Afirmaciones de este documento sin cita ni `fichero:línea` | 0 | 0 |

---

## 10. Riesgo principal

No es técnico. Es que la palabra «verificación» crezca más rápido que lo que la puerta
comprueba de verdad. Ese fallo tiene nombre propio en este repo —H1, H13, H15, H16,
H19— y todos aparecieron **ejecutando**, ninguno leyendo.

Así que la regla de §1 no es papeleo: es la misma disciplina aplicada al documento que
propone el trabajo.
