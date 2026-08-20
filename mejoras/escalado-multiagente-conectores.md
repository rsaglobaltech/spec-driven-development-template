<!-- csda:allow-placeholders -->
# Escalado — harness multiagente, conectores ALM y csda como plugin de hosts

> **Creado:** 2026-08-20
> **Estado del proyecto al escribirlo:** v0.6.0, rama `fix/brownfield-onboarding-java`
> **Relación con otros documentos:** este fichero no sustituye a
> `mejoras/plan-cierre-enterprise.md`. Aquel gobierna el camino a 1.0 (§12.10);
> este propone lo que viene **después**, y dice explícitamente qué parte de ello
> puede entrar antes sin poner en riesgo el gate G1.

---

## 0. Veredicto en una tabla

| Idea | Veredicto | Por qué | Cuándo |
|---|---|---|---|
| **1 · Harness multiagente** | **Sí, pero en tres fases y sin construir un runtime propio** | La pieza que falta no es "más agentes", es el **grafo de dependencias entre requisitos** (H12). Con él, el paralelismo sale casi gratis porque cada REQ ya corre en su propio worktree. Los roles de agente vienen después, y como *asesores*, nunca sustituyendo la puerta determinista | Fase A tras 1.0 · Fases B y C en v2 |
| **2 · Conectores de planificación (Jira, YouTrack, …)** | **Sí. Es la de mayor valor por euro y la que menos mueve el centro** | Ya existe `csda alm sync` con dos proveedores reales. El trabajo no es "añadir YouTrack", es **extraer el puerto y publicar un kit de conformidad** para que añadir un proveedor sea una fila y no un fork | Extracción del puerto: seguro antes de 1.0 (es refactor interno). Proveedores nuevos: 1.1 |
| **3 · csda como plugin de Claude Code / Copilot / Antigravity** | **Sí, y es el alcance más barato — pero primero hay que arreglar una duplicación de casa** | El contenido ya existe dos veces: seis pasos en `scripts/agents/commands.ts` y siete herramientas en `packages/mcp-spec-driven/src/tools.ts`, mantenidas por separado. Unificarlas en un registro único es el trabajo real; el empaquetado por host es lo fácil | Registro único: antes de 1.0 · Plugin de Claude Code con hooks: 1.1 |

**La frase que resume las tres:** ninguna de ellas cambia lo que csda *es*. La
spec sigue siendo el contrato y `validate` sigue siendo quien dice la verdad.
Lo que cambia es cuánta gente y cuántas máquinas pueden tocar ese contrato sin
romperlo. Ese es el eje sobre el que hay que decidir cada tarea de aquí abajo:
**si una propuesta necesita que la spec deje de ser el centro, se rechaza.**

---

## 1. Punto de partida verificado

Comprobado contra el disco el 2026-08-20. No hace falta repetir esta lectura.

### 1.1 El harness hoy

`scripts/harness/run.ts` (717 líneas) hace, por cada requisito pendiente:

1. `plan --format json` da la cola.
2. Un worktree de git aislado, rama `harness/REQ-NNN`.
3. `buildPrompt()` arma un prompt autocontenido (Gherkin + `AI_RULES.md` +
   rutas + realimentación del intento anterior).
4. Shell-out al comando del usuario, con el marcador `{prompt_file}`.
5. Puerta: `validate --strict-tdd` + el comando de test del proyecto.
6. Verde → `done` + commit. Rojo → reintento alimentando el fallo.
7. Nunca mergea.

Propiedades que hay que **preservar**, porque son las que lo hacen distinto:

- **El agente es un comando de shell.** No hay SDK, no hay proveedor. Esa
  neutralidad es el foso del producto; cualquier diseño que la rompa está mal.
- **La señal de recompensa es determinista.** `validate --strict-tdd` + tests.
  La inmensa mayoría de los frameworks multiagente meten un juez LLM porque no
  tienen puerta real. Nosotros la tenemos: usarla es la ventaja.
- **El estado compartido es el repositorio.** `plan`, `status`, la matriz de
  trazabilidad y los ficheros `.feature` son la pizarra. Es durable, inspeccionable
  y verificable por CI, cosa que ninguna memoria de proceso lo es.
- **Aislamiento por worktree.** Ya es paralelizable; simplemente no se paraleliza.

Lo que **no** existe: dependencias entre requisitos (H12), paralelismo, roles,
escalado de modelo entre intentos, y un registro de ejecución legible por máquina.

### 1.2 El ALM hoy

`scripts/alm/core.ts` (178 l.) + `scripts/alm/clients.ts` (156 l.):

- Proveedores: `jira` (Cloud, Basic auth) y `azure` (Boards, PAT).
- Interfaz mínima ya aislada: `{ createIssue, getIssueStatus, closeIssue }`,
  inyectable — la lógica se testea offline.
- Mapeo persistido y versionado en `.specops/alm-map.json`; da idempotencia.
- Detección de deriva: issue cerrado con el REQ abierto → DRIFT.
- Credenciales solo por nombre de variable de entorno, nunca en el fichero.

Es decir: **el patrón puerto/adaptador ya está**, sin nombrarse. Lo que falta es
formalizarlo y probarlo como contrato.

Lo que **no** existe: reintentos con backoff, paginación, mapeo de campos
personalizados, enlace inverso (del issue a la spec), y ninguna vía de entrada
desde el ALM hacia el repositorio.

### 1.3 La integración con hosts de agente hoy

Dos superficies, mantenidas por separado:

| Superficie | Qué es | Fichero | Problema |
|---|---|---|---|
| `csda agents init` | Escribe ficheros de instrucciones para 8 herramientas: claude, cursor, copilot, windsurf, aider, gemini, cline, codex | `scripts/agents/init.ts`, pasos en `scripts/agents/commands.ts` | Es **texto estático**. Se genera una vez y a partir de ahí deriva. Mitigado en parte porque cada paso delega en `csda change instructions`, que sí lee del motor |
| Servidor MCP | 7 herramientas vivas: `read_spec`, `list_requirements`, `update_traceability`, `lint_pack`, `validate_project`, `plan`, `mark_requirement_done` | `packages/mcp-spec-driven/src/tools.ts` | Es una **tercera** definición de la superficie, junto a los 12 comandos del contrato de agente y los 6 pasos. Nada obliga a que las tres coincidan |

La regla que el propio repositorio aplica en todas partes —"escrito una vez,
generado en muchos formatos"— está aplicada dentro de `agents init` (los 6 pasos
se definen una vez) pero **no entre las tres superficies**. Ahí está la deuda.

---

## 2. Idea 1 — El harness multiagente

### 2.1 El diagnóstico honesto

"Multiagente" es hoy la palabra con peor relación señal/ruido del sector. La
mayoría de las implementaciones son un bucle de LLMs criticándose entre sí, y
producen demos impresionantes y diffs que nadie puede revisar. Antes de aplicar
ningún patrón hay que preguntarse qué problema resuelve **aquí**.

El harness tiene tres problemas medidos, y solo uno de ellos es de agentes:

| Problema | ¿Lo arregla más agentes? |
|---|---|
| **H12 · Los requisitos dependientes no se expresan.** REQ-002 se apoya en REQ-001 y hay que saberlo y pasar `--base-branch` a mano; sin `--req`, el harness procesa en orden de matriz y falla en cascada | **No.** Lo arregla un grafo. Pero es la precondición de todo lo demás |
| **H9 · `--base-branch` hereda la configuración de la base.** El fallo falso de REQ-002 fue exactamente esto | **No.** Lo arregla un aviso cuando la base va por detrás de `main` |
| **Un intento fallido reintenta con lo mismo.** El prompt cambia (lleva el fallo), pero el agente y el modelo son idénticos | **Sí, parcialmente.** Aquí sí hay valor en cambiar de rol o de modelo |

Conclusión: **el paralelismo y el grafo valen más que los roles**, y hay que
hacerlos primero. Un harness que procesa cinco requisitos independientes a la
vez multiplica el rendimiento por cinco con un único agente. Un harness con
cuatro roles y un solo requisito multiplica el gasto por cuatro y el rendimiento
por poco.

### 2.2 Fase A — El grafo y el paralelismo *(cierra H12, mitiga H9)*

**Modelo.** Declarar dependencias entre requisitos. El sitio natural es la
matriz de trazabilidad (una columna) y el pack (los packs ya declaran
`requirement_id` por escenario, pero no relaciones entre requisitos). El grafo
resultante es un DAG; los ciclos son un error de validación con su `fix`, no un
cuelgue en tiempo de ejecución.

**Ejecución.** `plan` ordena topológicamente y agrupa en niveles. Cada nivel es
un conjunto de requisitos mutuamente independientes → se lanzan en paralelo con
un pool de N trabajadores (`--concurrency`, por defecto 1 para no cambiar el
comportamiento actual sin pedirlo). Un requisito solo entra en cola cuando todos
sus predecesores están verdes; si uno falla, sus descendientes se marcan
`skipped: blocked by REQ-NNN` en vez de fallar en cascada.

**Base de cada worktree.** Aquí vive H9. Con el grafo, la base correcta de un
requisito es la rama de su predecesor, no `main` ni el HEAD actual — y el
harness puede calcularlo en vez de exigir `--base-branch` a mano. Cuando la base
elegida va por detrás de `main`, se avisa; no se corrige en silencio.

**Lo que no cambia:** cada requisito sigue en su worktree, la puerta sigue siendo
la misma, y sigue sin mergear nada.

**Riesgo a nombrar:** N ramas verdes en paralelo son N revisiones humanas en
paralelo. El paralelismo mueve el cuello de botella del agente al revisor, no lo
elimina. Por eso `--concurrency` por defecto es 1 y subirlo es una decisión
consciente de quien va a revisar.

### 2.3 Fase B — Roles, y dónde se permiten

Un rol es **un perfil de `.harness/profiles.yaml`**, no una clase nueva. Ya
existe `agent_profile`; basta con permitir varios por ejecución. Así el contrato
"un agente es un comando de shell" sobrevive intacto.

| Rol | Qué hace | Qué puede escribir | Obligatorio |
|---|---|---|---|
| `implementer` | Lo que hace hoy el agente único | Código y tests. Nunca `features/**` ni `docs/specs/**` | Sí — es el actual |
| `reviewer` | Lee el diff del intento y produce hallazgos, **asesores** | Nada. Solo devuelve texto | No |
| `repairer` | Reintento con los hallazgos del revisor **más** la salida de la puerta | Igual que `implementer` | No |
| `spec-author` | Redacta la propuesta y el delta de un `change` | Solo dentro de `changes/<id>/`, y valida con `csda change validate` | No |

**La regla dura, y es la que separa esto de un juguete:** el revisor **nunca**
puede aprobar. Su salida es entrada del siguiente prompt, no una decisión.
`validate --strict-tdd` + los tests siguen siendo el único juez. Un hallazgo del
revisor con la puerta en verde no bloquea; se anota en el informe para el humano.

**Escalada entre intentos.** Hoy los tres intentos son idénticos salvo el
prompt. Con perfiles, la escalera natural es: intento 1 `implementer`; intento 2
`reviewer` → `repairer`; intento 3 `repairer` con un perfil más capaz (o más
presupuesto de razonamiento). Se declara en `harness.config.yaml`, con la
escalera de un solo peldaño —el comportamiento de hoy— como valor por defecto.

### 2.4 Fase C — Observabilidad y coste

Multiagente multiplica el gasto, y ahora mismo el harness no lleva cuentas. Sin
esto, la fase B es imposible de justificar ante nadie que pague la factura.

Un registro por ejecución en `.harness/runs/<timestamp>.json`: por requisito,
intentos, rol de cada intento, duración, código de salida, resultado de la
puerta, y —cuando el agente lo reporte por stdout o por un fichero de uso—
tokens y coste. Es el mismo patrón que ya usa `alm-map.json`: un fichero JSON
versionado que convierte una ejecución en un hecho consultable.

De ahí sale casi gratis un `csda harness report`, y de ahí la métrica que de
verdad importa y que hoy nadie mide: **coste por requisito entregado y tasa de
acierto al primer intento.**

### 2.5 Lo que se rechaza de la idea 1

- **Un runtime o SDK de agentes propio.** Mata la neutralidad, que es el foso.
- **Un bus de mensajes o memoria compartida entre agentes.** La pizarra es el
  repositorio. Un canal lateral crea estado que CI no puede verificar, que es
  exactamente el fallo que este proyecto existe para arreglar.
- **Un juez LLM en la puerta.** Tenemos puerta determinista. Cambiarla por una
  opinión sería regalar la única ventaja estructural del producto.
- **Agentes que negocian el alcance entre sí.** El alcance lo fija la spec. Si
  la spec es ambigua, eso es un `change`, no una negociación.

---

## 3. Idea 2 — Conectores de herramientas de planificación

### 3.1 Es viable porque ya está medio hecho, y el centro no se mueve

La pregunta de fondo —"¿mantiene el centro?"— tiene una respuesta precisa, y hay
que escribirla antes de tocar código:

> **El ALM es un espejo, no una fuente de verdad.** La spec y la matriz son el
> contrato. Un issue de Jira o de YouTrack refleja un requisito; nunca lo
> define. Y cualquier flujo de entrada desde el ALM entra por el ciclo de
> `change`, jamás escribiendo directamente en la matriz.

Con esa regla, los conectores no son un riesgo de dilución: son distribución.
Sin ella, en tres versiones el producto es un cliente de Jira con specs de
adorno.

Hay además una razón concreta para invertir aquí: §12.12 registra que **P1
(orquestación multi-repositorio) usa hoy el issue del ALM como identificador
supra-repo — "feo y barato"**. Un puerto ALM bien hecho convierte ese apaño en
una capacidad declarada. Es el único camino barato hacia P1 antes de v2.

### 3.2 El trabajo real: extraer el puerto y publicar un kit de conformidad

Hoy `makeClient` es un `switch` sobre dos proveedores en un fichero. Eso escala
mal a seis. Lo que hay que construir:

1. **`AlmProvider` como puerto documentado.** La interfaz de tres métodos ya
   existe de hecho; hay que nombrarla, versionarla y ampliarla mínimamente:
   `createIssue`, `getIssueStatus`, `closeIssue`, `linkBack(issueKey, specUrl)`,
   `capabilities()`. `capabilities()` es lo que evita el peor fallo de diseño de
   estos conectores: fingir que todos los ALM saben hacer lo mismo. YouTrack no
   tiene `statusCategory`; Linear no tiene tipos de issue de Jira; GitHub Issues
   no tiene transiciones. Un proveedor declara lo que sabe hacer y el núcleo
   degrada con un aviso en vez de romper.
2. **Un kit de conformidad.** Una suite de tests que cualquier proveedor debe
   pasar, contra respuestas grabadas. Es el mismo razonamiento que ya se aplicó
   a los packs curados ("un test instala cada uno"): sin ella, seis proveedores
   son seis fuentes de regresiones silenciosas.
3. **Robustez que hoy falta y que en un ALM corporativo aparece el primer día:**
   reintento con backoff ante 429/5xx, paginación, timeouts, y un `--dry-run`
   que ya existe pero que debe cubrir también las escrituras nuevas.

### 3.3 Los proveedores, por orden

| Proveedor | Coste | Nota técnica |
|---|---|---|
| **YouTrack** | Bajo | REST `/api/issues`, token permanente en cabecera `Bearer` (no Basic, a diferencia de Jira). El estado es un **campo personalizado** de tipo bundle, así que "hecho" no se deduce de una categoría: hay que configurar `state_field` y `done_state`. La config ya tiene `done_state` para Azure; se generaliza |
| **GitHub Issues** | Muy bajo | Vía `gh` o REST. Cierra el círculo para equipos que ya viven en GitHub y no tienen Jira. Probablemente el segundo más usado tras Jira |
| **Linear** | Bajo | GraphQL. Estados por workflow de equipo |
| **GitLab Issues** | Bajo | Simétrico a GitHub |
| **Jira Data Center / Server** | Medio | Auth y rutas distintas de Cloud. Es el que de verdad piden las empresas grandes, y el que más soporte genera |

**Modelo de dos niveles, para que el mantenimiento no se coma el repositorio:**
*core* (`jira`, `azure`, `github`) mantenidos aquí con el kit de conformidad en
CI; *comunidad* resueltos por nombre de paquete (`provider: npm:csda-alm-youtrack`).
Es la misma lógica de D9/D12, que ya sacó la distribución de plugins a v2: cada
adaptador es una API ajena que cambia sin avisar, y eso no puede vivir todo en
el árbol principal.

### 3.4 La entrada desde el ALM: `alm pull --as-change`

Es la petición que llegará de cualquier empresa —"el PO abre el ticket en Jira,
que aparezca en el repo"— y es donde se pierde el centro si se implementa mal.

La forma correcta ya existe en el producto y se llama `specops diff --as-change`:
lo que entra de fuera entra **como propuesta revisable**, no como hecho
consumado. Aplicado aquí: `csda alm pull` toma issues etiquetados, abre un
`change` con una propuesta y un delta prerrellenados desde el título y la
descripción, y **deja los escenarios Gherkin vacíos a propósito**. Un ticket de
Jira no contiene criterio de aceptación ejecutable; fingir que sí lo contiene
sería precisamente el "documentar produce un texto que nadie relee" contra el
que argumenta §12.13.

Ese hueco vacío no es una carencia: es el sitio donde el equipo (o el rol
`spec-author` de la idea 1) hace el único trabajo que no se puede automatizar.

### 3.5 Lo que se rechaza de la idea 2

- **Webhooks / modo servidor.** Exige un proceso escuchando, con su hosting y su
  seguridad. El CLI es sin estado y debe seguir siéndolo; la sincronización va
  en CI, por cron, que es donde ya vive.
- **Sincronización bidireccional de estado libre.** Si Jira puede reabrir un
  requisito cerrado en la matriz, hay dos fuentes de verdad y ninguna gana. La
  deriva se **reporta**, como ahora; no se resuelve automáticamente.
- **Guardar credenciales en el fichero de configuración.** Ya está bien resuelto
  (solo nombres de variables) y no se toca.

---

## 4. Idea 3 — csda como plugin de los hosts de agentes

### 4.1 El trabajo de casa primero: un registro único de superficie

Hoy la superficie de csda está descrita en tres sitios que nada obliga a
mantener sincronizados: los 12 comandos del contrato de agente, los 6 pasos de
`scripts/agents/commands.ts`, y las 7 herramientas de
`packages/mcp-spec-driven/src/tools.ts`. Añadir un comando nuevo hoy no aparece
en MCP salvo que alguien se acuerde.

**Antes de empaquetar para ningún host hay que colapsar eso en un registro
único**, del que se generen: la tabla de despacho del CLI, las herramientas MCP,
el documento del contrato de agente (`docs:agent-contract` ya se genera y tiene
`--check`, así que el patrón está probado) y los ficheros por host. Un comando
nuevo aparece en todas partes o en ninguna.

Este es el trabajo real de la idea 3. El empaquetado por host, una vez hecho
esto, es casi mecánico.

### 4.2 Claude Code — de ficheros de instrucciones a plugin de verdad

Es el host donde más se puede ganar, porque su superficie de extensión es la más
rica: plugins empaquetables (comandos + skills + subagentes + hooks + servidores
MCP en una unidad instalable), y sobre todo **hooks**.

Hoy csda escribe seis comandos de barra y un `AGENTS.md`. Un plugin completo
llevaría:

| Pieza | Contenido | Valor |
|---|---|---|
| Comandos | Los 6 pasos, ya definidos | Igual que hoy |
| Servidor MCP | El que ya existe, declarado en el plugin | El agente lee specs en vivo en vez de leer un fichero congelado |
| Subagentes | Los roles de la idea 1 (`reviewer`, `spec-author`) | Reutiliza el diseño en el host interactivo, no solo en el harness |
| **Hooks** | `validate --json` tras editar, y bloqueo al cerrar la sesión si `--strict-tdd` falla | **Esto es lo diferencial** |

Los hooks merecen el subrayado. La tesis entera del producto es "la puerta falla
cuando falta algo". Hoy esa puerta actúa en CI, es decir, **después** de que el
agente haya terminado y se haya ido. Un hook la mete **dentro** del bucle del
agente: la sesión no se cierra en verde con un requisito sin test. Eso convierte
csda de "lo que revisa el trabajo del agente" en "lo que el agente no puede
saltarse", y no conozco ninguna otra herramienta de specs que lo haga.

### 4.3 GitHub Copilot — realista, no ambicioso

Dos superficies distintas y conviene no confundirlas:

- **Instrucciones + MCP.** `.github/copilot-instructions.md` ya se genera, y
  Copilot en VS Code consume servidores MCP. Con el registro único de §4.1, esto
  es coste cero adicional. **Hacerlo.**
- **Una Copilot Extension (GitHub App alojada).** Es otro producto: requiere
  hosting, credenciales, ciclo de publicación y soporte. Es exactamente el mismo
  razonamiento por el que D12 mandó a v2 los plugins de Maven/Gradle y el
  registry. **No hacerlo ahora.**

### 4.4 Antigravity CLI — verificar antes de prometer

Aquí hay que ser honesto: **no tengo confirmado el formato de extensión de
Antigravity a día de hoy**, y comprometer una tarea contra un formato supuesto
es la forma más barata de generar trabajo inútil. La primera tarea de esta línea
es una hora de lectura de su documentación, no código, y tiene tres desenlaces:

1. **Habla MCP** → coste cercano a cero; ya está cubierto por el servidor actual.
2. **Lee `AGENTS.md`** → ya está cubierto por las filas `codex` / `gemini` de
   `scripts/agents/init.ts`; sería una fila más en `TOOLS`.
3. **Tiene formato propio de plugin** → una fila nueva, coste comparable al de
   Cursor o Windsurf, que ya están.

En los tres casos el coste es bajo *porque el registro único existe*. Ese es el
argumento de por qué §4.1 va primero.

### 4.5 El principio que ordena toda la idea 3

**Una definición, muchos empaquetados; y una sola superficie viva.** Los
ficheros de instrucciones son texto que deriva; MCP es una conexión que no
puede derivar porque lee del motor. Por eso la dirección estratégica es que
**MCP sea la superficie principal** y los ficheros de instrucciones queden como
el escalón de compatibilidad para hosts que no hablan MCP — no al revés.

---

## 5. Cómo encajan las tres: el plano de control

Puestas juntas, las tres ideas no son tres funcionalidades sueltas: son las tres
caras que le faltan a una misma pieza.

```
              ┌───────────────────────────────────────┐
   Idea 2 ──▶ │  ALM (Jira · YouTrack · Boards · GH)   │  planificación
              └───────────────────┬───────────────────┘
                    espejo, entra por `change`
                                  ▼
              ┌───────────────────────────────────────┐
              │   LA SPEC — spec.md · features/ ·     │  ◀── el centro
              │   docs/specs/traceability.md          │      no se mueve
              └───────┬───────────────────────┬───────┘
                      │                       │
        Idea 3 ──▶ hosts de agente      Idea 1 ──▶ harness
        (Claude Code · Copilot ·        (DAG · paralelo ·
         Antigravity · MCP)              roles · coste)
                      │                       │
                      └───────────┬───────────┘
                                  ▼
              ┌───────────────────────────────────────┐
              │  validate --strict-tdd + tests + CI   │  el único juez
              └───────────────────────────────────────┘
```

Leído así, la propuesta completa se enuncia en una frase: **csda deja de ser un
CLI de specs y pasa a ser el plano de control entre lo que la empresa planifica,
lo que los agentes ejecutan y lo que CI verifica** — sin que ninguna de las tres
puntas pueda decidir por su cuenta qué es verdad.

Y hay una consecuencia práctica de este dibujo: las tres ideas comparten una
misma pieza pendiente, el **registro único de superficie** (§4.1). El grafo de
requisitos lo consume `plan`, el conector lo consume `alm`, y los hosts lo
consumen todos. Hacerlo una vez habilita las tres; no hacerlo obliga a
mantenerlas por triplicado.

---

## 6. Riesgos transversales

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Las tres ideas añaden superficie, y G1 exige dos releases sin roturas.** Ninguna de las tres avanza G3 (un equipo externo que adopte y reporte), que es el que de verdad bloquea 1.0 | Solo entran antes de 1.0 los **refactores internos sin cambio de contrato**: registro único (§4.1) y extracción del puerto ALM (§3.2). Todo lo demás es 1.1 o v2 |
| R2 | **El paralelismo traslada el cuello de botella al revisor humano** | `--concurrency` 1 por defecto. El informe de ejecución debe ordenar por riesgo, no por orden de finalización |
| R3 | **Cada conector y cada host son una API ajena que cambia sin avisar** | Modelo de dos niveles (core / comunidad) y kit de conformidad con respuestas grabadas |
| R4 | **Multiagente multiplica el gasto sin que hoy nadie lo mida** | La fase C (registro de ejecución y coste) es **precondición** de la fase B, no una mejora posterior |
| R5 | **Deriva entre las tres superficies de comandos** — ya existe hoy | El registro único, con un `--check` en CI como el que ya tiene `docs:agent-contract` |
| R6 | **Que los conectores conviertan el producto en un cliente de Jira** | La regla de §3.1, escrita en un ADR: el ALM es espejo; la entrada va por `change` |

---

## 7. Secuenciación propuesta

IDs con el mismo formato que `mejoras/plan-cierre-enterprise.md`, para que se
puedan citar en los commits.

### Antes de 1.0 — solo refactor interno, sin cambio de contrato

| ID | | Tarea | Idea |
|---|---|---|---|
| `E0-01` | `[x]` | Registro único de superficie: despachador, ambos perfiles de ayuda, completion, contrato de agente y herramientas MCP leen una sola declaración — `06be948`, `21a435a`, `1d35caf` | 3 |
| `E0-02` | `[ ]` | Extraer `AlmProvider` como puerto documentado, con `capabilities()` y kit de conformidad contra respuestas grabadas. Jira y Azure pasan a ser sus dos primeras implementaciones | 2 |
| `E0-03` | `[ ]` | ADR: "el ALM es un espejo; toda entrada externa pasa por el ciclo de `change`" | 2 |

### Lo que salió al hacer E0-01 *(2026-08-20)*

La superficie no estaba descrita en tres sitios, sino en **cinco**: el
despachador y `usage()` en `bin/`, las listas de la completion, la tabla del
contrato, los esquemas de MCP y las cadenas literales de
`scripts/agents/commands.ts`. `AI_RULES.md` ya exigía "ninguna orden nueva sin
fila en la tabla de despacho, en `usage()`, en la tabla del README y un test", y
aun así la deriva ya estaba publicada:

**Cuatro subcomandos existían y la completion no los ofrecía** — `harness init`,
`change instructions`, `alm link` y `alm status`. El guarda que debía impedirlo
comparaba solo nombres de primer nivel, raspando el despachador con una regex,
así que no podía ver un subcomando ni en principio.

Es exactamente el patrón de §12.11: el defecto no se ve leyendo el código, se ve
cuando algo lo ejecuta. Aquí lo ejecutó un test nuevo, no un agente, pero la
lección es la misma — **un guarda que no puede fallar no es un guarda.**

Tres notas de método que conviene repetir en `E0-02`:

1. **Línea base antes de refactorizar.** Se capturaron las 67 invocaciones de
   todos los comandos y subcomandos (código de salida + huella de stdout y
   stderr) antes de tocar el despachador, y se compararon después. Los códigos
   de salida salieron idénticos en las 67, y todo el delta de salida se redujo a
   tres cadenas intencionadas. Sin esa captura, "no cambia el comportamiento"
   habría sido una opinión.
2. **Los guardas se prueban mutando.** Apuntar una fila a una herramienta MCP
   inexistente rompe dos tests; declarar un comando que no enruta rompe un
   tercero. Comprobado, no supuesto.
3. **El registro no puede tragárselo todo.** `init`, `validate` y `harness
   prompt` siguen parseando por su cuenta porque cada uno es una decisión, no una
   ruta. Y dos campos —`argsFrom` y `order`— existen porque son comportamiento:
   `pack lint` y `config set` reciben su propio token de subcomando, y la ayuda
   diaria se lee como secuencia, no en orden de declaración.

Efecto lateral que sí es producto: `bin/create-spec-driven-app.ts` pierde 230
líneas y deja de ser un sitio donde se declara la superficie.

### 1.1 — la primera release que añade cosas (y por tanto la prueba real de G1)

| ID | Tarea | Idea |
|---|---|---|
| `E1-01` | Dependencias entre requisitos: modelo, validación de ciclos con `fix`, y orden topológico en `plan` — **cierra H12** | 1 |
| `E1-02` | `harness run --concurrency N` por niveles del DAG; descendientes de un fallo marcados `blocked`, no fallados | 1 |
| `E1-03` | Base de worktree derivada del grafo + aviso cuando va por detrás de `main` — **cierra H9** | 1 |
| `E1-04` | Registro de ejecución `.harness/runs/<ts>.json` y `csda harness report` (coste por requisito, acierto al primer intento) | 1 |
| `E1-05` | Plugin de Claude Code: comandos + MCP + **hooks** de `validate` durante la sesión | 3 |
| `E1-06` | Proveedor `github` (issues) sobre el puerto de `E0-02` | 2 |
| `E1-07` | Antigravity: verificar formato de extensión y decidir entre los tres desenlaces de §4.4 | 3 |

### v2

| ID | Tarea | Idea |
|---|---|---|
| `E2-01` | Roles como perfiles: `implementer` / `reviewer` (asesor) / `repairer`, con escalada entre intentos | 1 |
| `E2-02` | Rol `spec-author` acotado a `changes/<id>/` | 1 |
| `E2-03` | `alm pull --as-change` (escenarios deliberadamente vacíos) | 2 |
| `E2-04` | Proveedores de comunidad resueltos por paquete: YouTrack, Linear, GitLab, Jira DC | 2 |
| `E2-05` | Revisar P1 (multi-repo) ahora que el puerto ALM da un identificador supra-repo declarado en vez del apaño actual | 2 |

---

## 8. Lo que se dice que no, y por qué

Reunido aquí para que no haya que releer las tres secciones:

1. **Un runtime/SDK de agentes propio.** Mata la neutralidad de proveedor, que
   es lo que hace instalable esta herramienta en una empresa que ya eligió otro
   agente.
2. **Un juez LLM en la puerta.** Tenemos puerta determinista; cambiarla por una
   opinión es regalar la única ventaja estructural.
3. **Bus de mensajes entre agentes.** La pizarra es el repositorio, y su virtud
   es que CI puede verificarla.
4. **Webhooks / servicio alojado para el ALM.** El CLI es sin estado; la
   sincronización vive en CI.
5. **Bidireccionalidad plena con el ALM.** Dos fuentes de verdad, ninguna gana.
6. **Copilot Extension alojada.** Otro producto, otras credenciales, otro ciclo
   — el mismo razonamiento de D12.

---

## 9. Preguntas abiertas

Cosas que hay que decidir o verificar, no cosas que hay que programar.

| # | Pregunta | Quién decide |
|---|---|---|
| Q1 | ¿Dónde se declaran las dependencias entre requisitos: columna nueva en la matriz, o campo en el pack? La matriz es donde vive el estado; el pack es donde vive el modelo reutilizable. Probablemente el pack declara y la matriz refleja | Decisión de modelo — merece ADR |
| Q2 | ¿El paralelismo por defecto es 1 para siempre, o sube cuando el registro de ejecución demuestre que la tasa de acierto al primer intento se mantiene? | Datos de `E1-04` |
| Q3 | Formato de extensión de Antigravity CLI — sin verificar | `E1-07`, una hora de lectura |
| Q4 | ¿El plugin de Claude Code se publica en un marketplace propio o se instala desde el repositorio? Afecta a credenciales y ciclo de release, igual que D9/D12 | Decisión de distribución |
| Q5 | ¿`alm pull` genera un `change` por issue, o uno por lote? Uno por issue es más limpio de revisar; uno por lote es más realista con un backlog de cincuenta tickets | Se decide con un piloto real, no en abstracto |

---

## 10. La lectura de conjunto

Las tres ideas son buenas y las tres apuntan en la misma dirección, que es la
correcta: convertir una herramienta que valida specs en el plano de control de
la entrega. Ninguna exige reescribir nada, y las tres tienen ya media
implementación en el árbol.

El orden importa más que las ideas. En concreto:

- **La idea 3 va primero**, aunque suene la menos ambiciosa, porque el registro
  único abarata las otras dos.
- **La idea 2 es la que más valor comercial da por euro**, porque el puerto ya
  existe de hecho y porque Jira es la puerta de entrada a la empresa.
- **La idea 1 es la más vistosa y la que más fácil sale mal.** Su fase A (grafo
  y paralelismo) es sólida y cierra dos defectos abiertos. Su fase B (roles)
  solo debe hacerse cuando la fase C pueda demostrar que sale a cuenta.

Y una advertencia que vale para las tres, y que este repositorio ya aprendió por
las malas en §12.11: **nada de esto se valida leyéndolo.** Una sola ejecución
real del harness destapó tres defectos que ninguna revisión estática habría
encontrado. Multiplicar agentes, conectores y hosts multiplica también esa clase
de defecto. La regla de aquella sección sigue siendo la regla de esta:
se ejecuta contra un caso real, o no cuenta.
