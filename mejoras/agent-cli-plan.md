# Plan — CLI agéntico estilo Claude Code (`csda-agent`)

> **Fecha:** 2026-08-15
> **Objetivo:** construir un cliente CLI interactivo con la ergonomía de
> Claude Code — REPL con streaming, comandos slash, modos de permiso, hooks,
> subagentes, MCP, memoria de proyecto — sobre la API de Anthropic.
> **Rama sugerida:** `feat/agent-cli` (independiente de `feat/change-lifecycle`).

---

## 0. Supuesto de alcance (léelo primero)

La petición admite dos lecturas. Asumo la útil y la declaro:

**Construimos un CLI agéntico genérico, y lo conectamos al bucle spec-driven de
CSDA.** El núcleo (bucle de agente, herramientas, permisos, TUI) es
**agnóstico de dominio** y podría publicarse como paquete propio; encima de él
se monta una capa fina que expone `plan`, `validate`, `change`, `specops` y el
harness como comandos slash y herramientas del agente.

Si lo que quieres es solo el clon genérico sin atarlo a CSDA, ignora la §9 —
todo lo demás sigue siendo válido tal cual.

**Nombre:** `csda agent` como subcomando y `csda-agent` como binario propio.
No reutilizar "Studio": ese nombre ya es la SPA del dogfood
(`mejoras/csda-studio-brief.md`).

---

## 1. Anatomía de Claude Code — qué hay que replicar de verdad

La sensación de Claude Code no viene del modelo. Viene de diez piezas de
harness. Este es el inventario a construir, ordenado por cuánto contribuyen a
la percepción de "esto es Claude Code":

| # | Pieza | Por qué importa |
|---|---|---|
| 1 | **REPL con streaming token a token** y interrupción con `Esc` | Es el 80 % de la sensación. Un CLI que espera 40 s en silencio no se parece en nada, tenga el mismo modelo. |
| 2 | **Bucle de herramientas con permisos** — `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch` | El agente actúa sobre el repo. Sin esto es un chat con esteroides. |
| 3 | **Modos de permiso** (`default`, `acceptEdits`, `plan`, `bypassPermissions`) ciclables con `Shift+Tab` | Es lo que hace usable el punto 2 sin miedo. |
| 4 | **Comandos slash** (`/help`, `/clear`, `/compact`, `/model`, `/cost`, `/init`…) + slash personalizados en `.claude/commands/*.md` | Superficie de control sin salir del REPL, y extensibilidad por el usuario. |
| 5 | **Jerarquía de settings** (enterprise → CLI args → local → proyecto → usuario) con `permissions.allow/deny/ask` | Gobierno. Sin esto no entra en una empresa. |
| 6 | **Memoria de proyecto** (`CLAUDE.md` / `AGENTS.md` jerárquico con imports `@ruta`) | El agente "conoce" el repo entre sesiones. |
| 7 | **Hooks** (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SessionStart`…) con protocolo JSON por stdin/stdout | Automatización determinista que el modelo no puede saltarse. |
| 8 | **Subagentes** (`.claude/agents/*.md` con frontmatter) y **skills** (`.claude/skills/<n>/SKILL.md`) | Fan-out y divulgación progresiva de contexto. |
| 9 | **MCP** (stdio / HTTP / SSE, `.mcp.json`, scopes) | Integración con el ecosistema existente. |
| 10 | **Gestión de contexto**: auto-compactación, checkpoints, `--resume` | Sesiones largas que no se mueren. |

**Modo no interactivo** (`-p/--print`, `--output-format json|stream-json`) es la
puerta a CI y a scripting; se construye desde el mismo núcleo.

---

## 2. Decisión fundacional: sobre qué se construye

Hay cuatro caminos reales. Los dos primeros son los candidatos:

| Opción | Qué escribes tú | Quién pone el harness | Herramientas |
|---|---|---|---|
| **A. Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | Un prompt + opciones | El SDK **es** el harness de Claude Code, empaquetado como librería | `Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch` **incluidas**, + MCP + subagentes + hooks + permisos |
| **B. Messages API + Tool Runner** (`client.beta.messages.toolRunner`) | Las funciones de tus herramientas | El SDK de la API pone el bucle; tú alojas | **Solo las tuyas** |
| C. Messages API + bucle manual | El `while stop_reason === "tool_use"` entero | Tú | Solo las tuyas |
| D. Managed Agents | Config del agente | Anthropic pone bucle **y** sandbox por sesión | Sandbox de Anthropic |

### Recomendación: **A para el MVP, con frontera limpia para migrar a B**

**Por qué A.** El Agent SDK es literalmente el harness de Claude Code
publicado como librería: trae el bucle, las herramientas de ficheros y bash,
la gestión de contexto, los hooks, los subagentes, los permisos y las
sesiones. Reimplementar eso con Tool Runner es reescribir de cero la parte
que ya está resuelta y probada. Time-to-demo: días, no meses.

**Por qué la frontera.** Si más adelante necesitas control que el SDK no
expone — un transporte propio, una política de permisos que no encaja, tu
propio modelo de sesiones — quieres poder cambiar el motor sin tocar la TUI.
De ahí la interfaz `AgentEngine` de la §3.

**Cuándo elegir B en su lugar:** si el producto real es un agente de dominio
que **no** debe tener acceso libre al filesystem — por ejemplo, un agente que
solo puede tocar `docs/specs/**` y ejecutar `csda validate`. Ahí las
herramientas built-in son un pasivo, no un activo, y el Tool Runner con seis
herramientas propias es más limpio y más auditable.

> **Nota:** el Agent SDK y el Tool Runner suenan parecido y no lo son. El Tool
> Runner (`client.beta.messages.tool_runner`) es un helper del SDK normal de la
> API que hace el bucle *sobre herramientas que tú defines* — sin herramientas
> built-in, sin filesystem. El Agent SDK es Claude Code entero. Ambos los
> alojas tú; ninguno de los dos es Managed Agents.

---

## 3. Arquitectura objetivo

```text
packages/agent-cli/
├── src/
│   ├── engine/
│   │   ├── types.ts          # interfaz AgentEngine — la frontera
│   │   ├── sdk-engine.ts     # impl. sobre @anthropic-ai/claude-agent-sdk
│   │   └── raw-engine.ts     # impl. sobre Messages API + toolRunner (fase 5)
│   ├── tui/                  # Ink (React para terminal)
│   │   ├── App.tsx           # layout, scrollback, composer
│   │   ├── Stream.tsx        # render incremental de deltas
│   │   ├── ToolCard.tsx      # una tarjeta por tool_use + su resultado
│   │   ├── PermissionPrompt.tsx
│   │   └── StatusLine.tsx    # modelo · modo · tokens · coste · rama git
│   ├── commands/             # comandos slash built-in
│   ├── config/               # jerarquía de settings + permisos
│   ├── hooks/                # runner de hooks (proceso hijo, JSON I/O)
│   ├── memory/               # descubrimiento de AGENTS.md / imports
│   ├── mcp/                  # carga de servidores MCP
│   ├── session/              # persistencia, resume, checkpoints
│   ├── print/                # modo no interactivo (-p, --output-format)
│   └── bin.ts
```

### 3.1 La frontera `AgentEngine`

```ts
export interface AgentEngine {
  /** Lanza un turno. Devuelve un stream de eventos normalizados. */
  run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
  /** Estado de contexto para la status line. */
  usage(): UsageSnapshot;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_start" }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; ok: boolean; preview: string }
  | { type: "permission_request"; id: string; tool: string; detail: string }
  | { type: "compacted"; before: number }
  | { type: "turn_end"; stopReason: string; usage: UsageSnapshot }
  | { type: "error"; code: string; message: string; retryable: boolean };
```

Todo lo que la TUI pinta sale de `AgentEvent`. La TUI **no** sabe si detrás
hay Agent SDK, Tool Runner o un bucle manual. Esa es la única decisión de
arquitectura que hay que tomar bien desde el día 1.

---

## 4. Superficie de comandos

### 4.1 Flags de CLI

```bash
csda-agent                                  # REPL interactivo
csda-agent "arregla el test que falla"      # una instrucción, luego REPL
csda-agent -p "resume el diff"              # no interactivo, imprime y sale
csda-agent -p --output-format stream-json   # NDJSON para pipes y CI
csda-agent --continue                       # reanuda la última sesión
csda-agent --resume <session-id>
csda-agent --model claude-opus-5            # o sonnet / haiku
csda-agent --permission-mode plan
csda-agent --allowed-tools "Read,Grep,Bash(npm run test:*)"
csda-agent --disallowed-tools "Write,Edit"
csda-agent --add-dir ../otro-repo
csda-agent --mcp-config ./mcp.json
csda-agent --append-system-prompt "..."
csda-agent --settings ./ci-settings.json
csda-agent --max-turns 20                   # cortafuegos para CI
csda-agent --verbose
```

### 4.2 Comandos slash built-in

| Comando | Qué hace |
|---|---|
| `/help` | Lista comandos y atajos |
| `/clear` | Vacía el contexto y arranca sesión nueva |
| `/compact [instrucción]` | Compacta el contexto ahora, con foco opcional |
| `/model [id]` | Cambia de modelo — **advierte de que invalida la caché** |
| `/cost` | Tokens y coste acumulado, desglosado por caché |
| `/context` | Qué ocupa el contexto ahora: system, memoria, herramientas, historial |
| `/config` | Abre/edita settings |
| `/permissions` | Ver y editar reglas allow/deny/ask |
| `/hooks` | Listar hooks activos y su matcher |
| `/agents` | Listar/crear subagentes |
| `/mcp` | Estado de los servidores MCP |
| `/memory` | Editar el `AGENTS.md` aplicable |
| `/init` | Genera un `AGENTS.md` inicial analizando el repo |
| `/resume` | Selector de sesiones anteriores |
| `/rewind` | Vuelve a un checkpoint previo (ficheros + conversación) |
| `/doctor` | Diagnóstico de instalación, auth, MCP, permisos |
| `/status` | Versión, auth, cwd, modelo, límites |
| `/export` | Exporta la conversación a markdown |
| `/vim` | Modo de edición vim en el composer |

### 4.3 Comandos slash del usuario

Fichero `.claude/commands/<nombre>.md` (y `.csda/commands/` como alias propio):

```markdown
---
description: Revisa el cambio actual contra las specs
argument-hint: [REQ-NNN]
allowed-tools: Read, Grep, Bash(csda validate:*)
model: claude-sonnet-5
---

Revisa la implementación de $1 contra `docs/specs/traceability.md`.
Ejecuta `csda validate --strict-tdd` y reporta solo lo que falle.
```

`$ARGUMENTS` para todo, `$1..$9` posicionales. El fichero se resuelve a un
prompt de usuario; el frontmatter ajusta modelo y herramientas **solo para ese
turno**.

### 4.4 Atajos del composer

| Entrada | Efecto |
|---|---|
| `@ruta/fichero` | Inserta el fichero en el contexto (autocompletado difuso) |
| `!comando` | Ejecuta bash directamente y mete la salida en la conversación |
| `#texto` | Añade `texto` a la memoria (`AGENTS.md`) |
| `Shift+Tab` | Cicla modo de permiso |
| `Esc` | Interrumpe el turno en curso |
| `Esc Esc` | Rebobina al checkpoint anterior |
| `Ctrl+C` ×2 | Salir |

---

## 5. Configuración, permisos, memoria y hooks

### 5.1 Jerarquía de settings

Precedencia, de mayor a menor:

```text
1. políticas gestionadas (enterprise)
2. flags de CLI
3. .csda/settings.local.json     (local, gitignored)
4. .csda/settings.json           (proyecto, commiteado)
5. ~/.csda/settings.json         (usuario)
```

Se **fusionan** por clave; las listas de permisos se concatenan y `deny` gana
siempre sobre `allow`.

```jsonc
{
  "model": "claude-opus-5",
  "permissions": {
    "allow": ["Read(./**)", "Grep", "Glob", "Bash(npm run test:*)", "Bash(git status)"],
    "ask":   ["Write(./src/**)", "Edit(./src/**)"],
    "deny":  ["Read(./.env*)", "Bash(rm -rf:*)", "WebFetch"]
  },
  "env": { "NODE_ENV": "test" },
  "hooks": { /* §5.3 */ }
}
```

**Reglas de permiso** = `Herramienta(patrón)`. Para `Bash`, el patrón es
prefijo de comando con `:*`; para ficheros, glob. `deny` sobre `.env*` y
credenciales debe venir preconfigurado por defecto — no como opción.

### 5.2 Memoria de proyecto

Descubrimiento ascendente desde `cwd` hasta la raíz del repo, más
`~/.csda/AGENTS.md`. Soporta imports `@docs/specs/architecture.md` con
profundidad máxima 5 y detección de ciclos. Se concatena en el system prompt
**en orden estable** (usuario → raíz → subdirectorios) porque cualquier
reordenación rompe la caché de prompt (§6.3).

### 5.3 Hooks

Eventos: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionEnd`.

Protocolo: el hook es un comando de shell; recibe JSON por **stdin**, responde
por **stdout**. Código de salida `2` = bloquear la acción y devolver stderr al
modelo como feedback.

```jsonc
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": ".csda/hooks/protect-specs.sh" }]
    }],
    "PostToolUse": [{
      "matcher": "Edit",
      "hooks": [{ "type": "command", "command": "npx prettier --write $CSDA_TOOL_FILE" }]
    }]
  }
}
```

Los hooks son la pieza que convierte "el modelo debería" en "el sistema
garantiza". Prioridad alta, no la dejes para el final.

### 5.4 Subagentes

`.csda/agents/<nombre>.md`:

```markdown
---
name: spec-reviewer
description: Revisa deltas de spec contra la matriz de trazabilidad. Read-only.
tools: Read, Grep, Glob
model: sonnet
---

Eres un revisor de especificaciones. No propongas código...
```

El agente principal recibe una herramienta `Task`/`Agent` que lista estos
subagentes por `description`. Cada subagente corre en su **propio contexto** —
ese es el punto: fan-out sin llenar el contexto del principal.

---

## 6. El bucle: streaming, contexto y coste

Aquí es donde un clon mediocre se separa de uno bueno. Detalles concretos,
verificados contra la referencia de la API:

### 6.1 Modelos

| Modelo | ID exacto | Contexto | Entrada $/1M | Salida $/1M |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $3.00 (intro $2.00 hasta 2026-08-31) | $15.00 (intro $10.00) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1.00 | $5.00 |

Por defecto **`claude-opus-5`**. Haiku para subagentes de lectura masiva
(buscar, leer, extraer): es donde el ahorro es real sin pérdida de calidad.

### 6.2 Thinking y effort

- `thinking: { type: "adaptive" }` — el modelo decide cuánto pensar.
  `budget_tokens` está **eliminado** en Opus 5 (devuelve 400).
- Profundidad vía `output_config: { effort: "low"|"medium"|"high"|"xhigh"|"max" }`.
  Arranca en `xhigh` para trabajo de código/agéntico y **barre hacia abajo**:
  en Opus 5, `low` y `medium` rinden sorprendentemente bien y son la palanca
  principal de latencia y coste.
- En Opus 5 el thinking está **activo por defecto** aunque omitas el campo, y
  `max_tokens` es tope de *thinking + respuesta* — dimensiónalo con holgura
  (≥ 64000 en streaming a `xhigh`/`max`).
- Para mostrar el razonamiento en la TUI hay que pedirlo:
  `thinking: { type: "adaptive", display: "summarized" }`. El defecto es
  `"omitted"`, y entonces los bloques llegan con texto vacío — que en pantalla
  se ve como una pausa larga sin explicación.

### 6.3 Caché de prompt — la diferencia entre usable y caro

La caché es **coincidencia de prefijo**: cualquier byte que cambie invalida
todo lo que va detrás. Orden de render: `tools` → `system` → `messages`.

Reglas de diseño no negociables para el CLI:

1. **El system prompt es inmutable durante la sesión.** Nada de interpolar
   fecha, hora, rama git o nombre de usuario ahí dentro. Eso va en el primer
   mensaje de usuario o como mensaje de sistema intermedio.
2. **La lista de herramientas se serializa de forma determinista** (ordenada
   por nombre). Renderiza en posición 0: cualquier cambio invalida todo.
3. **Contexto dinámico a mitad de sesión** → mensaje `{"role": "system"}`
   dentro de `messages[]`, no editando el `system` de nivel superior.
   Disponible en Opus 5 y Opus 4.8, sin beta header. Preserva la caché **y**
   es el canal de operador no falsificable (a diferencia de meter la
   instrucción en un turno de usuario, que cualquier fichero leído puede
   imitar).
4. **Breakpoint** en el último bloque del turno recién añadido, máximo 4 por
   petición. Mínimo cacheable en Opus 5: **512 tokens** (la mitad que en 4.8).
5. **Ventana de 20 bloques:** un breakpoint retrocede como mucho 20 bloques de
   contenido buscando entrada previa. Un turno agéntico con muchos pares
   `tool_use`/`tool_result` la supera fácil → coloca un breakpoint intermedio
   cada ~15 bloques o la caché falla en silencio.
6. **Verifica siempre** `usage.cache_read_input_tokens`. Si sale 0 en
   peticiones consecutivas con el mismo prefijo, hay un invalidador silencioso.
   Esto debe ser un test automático, no una inspección manual.

Economía: lectura ~0,1× · escritura 1,25× (TTL 5 min) o 2× (TTL 1 h). Con TTL
de 5 minutos el punto de equilibrio son **dos** peticiones — en un REPL
interactivo siempre sale a cuenta.

### 6.4 Gestión de contexto en sesiones largas

Tres mecanismos, complementarios:

- **Compactación** (beta `compact-2026-01-12`): resume el historial antiguo en
  el servidor. `context_management: { edits: [{ type: "compact_20260112" }] }`.
  **Trampa crítica:** hay que devolver `response.content` **entero** en el
  siguiente turno, no solo el texto. Los bloques de compactación son estado; si
  extraes el string y descartas el resto, pierdes la compactación en silencio.
- **Context editing** (beta `context-management-2025-06-27`): *borra* resultados
  de herramientas antiguos en vez de resumirlos —
  `{ type: "clear_tool_uses_20250919" }`. Ideal para un CLI: los `tool_result`
  de hace veinte turnos son puro peso.
- **Task budgets** (beta `task-budgets-2026-03-13`): techo de tokens del que el
  modelo **es consciente** y con el que se autorregula, distinto de `max_tokens`
  (tope duro que el modelo no ve). Mínimo 20 000. Úsalo en el modo no
  interactivo y en subagentes.

### 6.5 Cambiar de herramientas sin romper la caché

Un CLI cambia el conjunto de herramientas al vuelo: modo plan quita `Write` y
`Edit`, un servidor MCP se conecta a mitad de sesión. Editar `tools[]`
invalida **todo** el prefijo.

La salida es el beta `mid-conversation-tool-changes-2026-07-01` (Opus 5 en
adelante): declaras las herramientas opcionales de entrada con
`defer_loading: true` y las activas o desactivas con bloques `tool_addition` /
`tool_removal` dentro de un mensaje `{"role": "system"}`. El prefijo cacheado
sobrevive.

Si además el catálogo de herramientas MCP crece por encima de unas decenas,
la respuesta es **tool search** (`tool_search_tool_regex_20251119`), que añade
esquemas en vez de sustituirlos y por tanto tampoco rompe la caché.

### 6.6 Streaming y errores

- Siempre `client.messages.stream(...)`; `finalMessage()` para el mensaje
  completo. No envuelvas eventos `.on()` en `new Promise()` — el SDK ya
  gestiona completado, error y abort.
- Comprueba `stop_reason` **antes** de leer `content`. Valores a manejar:
  `end_turn`, `tool_use`, `max_tokens`, `pause_turn` (herramienta de servidor
  llegó a su límite de iteraciones — reenvía para continuar), `refusal`.
- Opus 5 lleva salvaguardas de ciberseguridad elevadas: un `refusal` llega como
  **HTTP 200** con `stop_reason: "refusal"` y `stop_details.category`, no como
  error. Código que hace `content[0].text` a ciegas revienta ahí.
- Captura excepciones tipadas en cadena, de más específica a menos:
  `NotFoundError` → `RateLimitError` → `APIConnectionError` → `APIError`.
  Nunca hagas match sobre el texto del mensaje.
- `AbortController` cableado a `Esc`: interrumpir debe abortar la petición HTTP,
  no solo dejar de pintar.

### 6.7 Fast mode

`speed: "fast"` con el beta `fast-mode-2026-02-01` en Opus 5 (research preview,
solo API de Anthropic) sube el throughput de salida hasta ~2,5× a $10/$50 por
MTok. Es el equivalente al `/fast` de Claude Code. Tiene su propio pool de rate
limit; ante un 429, o esperas el `retry-after` o quitas `speed` — pero **ojo**:
cambiar de velocidad invalida la caché de prompt.

---

## 7. Herramientas: qué exponer y cómo

Con la opción A (Agent SDK) las básicas vienen de fábrica. Con la B las
defines tú. En cualquier caso, dos decisiones de diseño:

**Bash vs herramientas dedicadas.** `Bash` da alcance máximo pero al harness
solo le llega una cadena opaca — no puede distinguir un `grep` paralelizable
de un `git push` irreversible. Promueve a herramienta dedicada todo lo que
necesite ser **filtrado, renderizado, auditado o paralelizado**. Regla: empieza
con bash por amplitud; asciende cuando necesites una de esas cuatro cosas.

**Bash y text editor de Anthropic son herramientas sin esquema.** Se declaran
solo con `type` y `name`, jamás con `input_schema`:

```ts
{ type: "bash_20250124", name: "bash" }
{ type: "text_editor_20250728", name: "str_replace_based_edit_tool" }
```

El par `type`/`name` es fijo: mezclarlos es un error de tipos. Y una
herramienta propia llamada `"bash"` **no** es la de Anthropic — es otra cosa
sin el comportamiento entrenado.

### Seguridad de las herramientas de ejecución

Los comandos que emite el modelo son entrada no confiable. No negociable:

- Ejecutar con **allowlist** de binarios permitidos, rechazando operadores de
  shell (`&&`, `|`, `;`, backticks, `$()`). Una blocklist no sirve.
- Timeouts y límites de recursos por comando. Log de todo.
- Para ficheros: resolver la ruta a canónica y verificar que sigue dentro de la
  raíz del proyecto antes de cualquier operación. Rechazar `..`, symlinks fuera,
  rutas absolutas externas y travesías codificadas (`%2e%2e%2f`). Nunca llamar a
  `readFile`/`writeFile` sobre el `path` crudo.
- `deny` por defecto sobre `.env*`, `~/.ssh/**`, `**/credentials*`.

---

## 8. TUI

**Ink (React para terminal)** — es lo que usa Claude Code y evita reinventar
layout, foco y reconciliación en un terminal.

Detalles que marcan la diferencia entre "funciona" y "se siente bien":

- **Render incremental sin parpadeo:** acumula deltas en un buffer y pinta a
  ~30 fps, no en cada token. Ink re-renderiza el árbol; pintar por token
  produce flicker en terminales lentos.
- **Tarjeta por herramienta**, colapsable: cabecera con nombre + argumento
  resumido, cuerpo con las primeras N líneas del resultado y contador del
  resto. Un `Bash` que escupe 400 líneas no puede empujar el scrollback.
- **Status line** fija abajo: modelo · modo de permiso · % de contexto usado ·
  coste acumulado · rama git. Configurable por comando externo, como el
  `statusLine` de Claude Code.
- **Prompt de permiso** modal, bloqueante, con opciones "sí / sí y no volver a
  preguntar para este patrón / no / no y dime por qué". La tercera opción es la
  que evita que la gente ponga `bypassPermissions` a la primera fricción.
- **Degradación:** si `stdout` no es TTY, salta automáticamente a modo `--print`.
  Nadie debería tener que acordarse del flag dentro de un pipe.

---

## 9. Capa CSDA (lo que lo hace nuestro, no un clon)

Un clon genérico no aporta nada. Lo que aporta es el matrimonio con el bucle
spec-driven:

| Pieza | Integración |
|---|---|
| **Herramientas de dominio** | `csda_plan` (cola de REQs pendientes), `csda_validate` (gate), `csda_done`, `csda_change_status`, `csda_specops_diff` — expuestas como herramientas del agente con esquema estricto |
| **Comandos slash** | `/req REQ-014` carga el REQ, su `.feature` y su fila de trazabilidad en contexto; `/gate` corre `validate --strict-tdd`; `/change` abre el ciclo de cambio |
| **Memoria** | `AI_RULES.md` y `AGENTS.md` del proyecto generado se cargan como memoria automáticamente — ya existen, ya tienen el formato correcto |
| **Subagentes** | `spec-reviewer` (read-only, Haiku), `gherkin-author`, `pack-linter` — distribuibles **dentro de un pack** |
| **Harness** | `csda-agent` pasa a ser el agente por defecto del `harness run`: en lugar de `--agent "claude -p < {prompt_file}"`, `--agent "csda-agent -p --output-format json < {prompt_file}"`. El harness ya construye el prompt; el CLI solo lo ejecuta con el gate y los permisos correctos |
| **Definition of Done** | Un hook `Stop` que corre `csda validate --strict-tdd` y **bloquea** el fin de turno si falla. El agente no puede declarar "hecho" contra un gate rojo |

Ese último punto es el que ningún clon genérico tiene: el CLI no solo edita
código, sino que **no puede mentir sobre haberlo terminado**.

---

## 10. Plan por fases (~47 PD)

### F1 — Espina dorsal (10 PD)

| Paso | Descripción | PD |
|---|---|---|
| A-1-01 | Scaffolding del paquete, `bin`, parseo de flags, `--version`/`--help` | 1 |
| A-1-02 | Interfaz `AgentEngine` + `sdk-engine.ts` sobre el Agent SDK | 2 |
| A-1-03 | REPL Ink mínimo: composer, scrollback, streaming de texto | 3 |
| A-1-04 | Bucle de herramientas visible: `ToolCard` con start/end | 2 |
| A-1-05 | `Esc` → `AbortController` que aborta la petición HTTP de verdad | 1 |
| A-1-06 | Status line: modelo, contexto, coste desde `usage` | 1 |

**Gate:** editar un fichero del repo por instrucción en lenguaje natural, con
streaming y con interrupción funcionando.

### F2 — Gobierno (9 PD)

| Paso | Descripción | PD |
|---|---|---|
| A-2-01 | Jerarquía de settings con merge y precedencia | 2 |
| A-2-02 | Motor de permisos: `allow`/`ask`/`deny`, patrones de bash y glob | 2.5 |
| A-2-03 | Modos de permiso + ciclado con `Shift+Tab`; modo `plan` read-only | 1.5 |
| A-2-04 | Prompt de permiso modal con "no volver a preguntar" que persiste regla | 1 |
| A-2-05 | Endurecimiento: allowlist de binarios, confinamiento de rutas, deny por defecto de secretos | 2 |

**Gate:** revisión de seguridad propia (`/security-review`) sobre el motor de
permisos, sin hallazgos de severidad alta.

### F3 — Extensibilidad (12 PD)

| Paso | Descripción | PD |
|---|---|---|
| A-3-01 | Comandos slash built-in (tabla §4.2) | 3 |
| A-3-02 | Slash personalizados desde `.csda/commands/*.md` con frontmatter y `$ARGUMENTS` | 2 |
| A-3-03 | Memoria: descubrimiento jerárquico, imports `@`, orden estable, `/init` | 2 |
| A-3-04 | Runner de hooks: 9 eventos, matchers, JSON I/O, exit 2 = bloquear | 3 |
| A-3-05 | Subagentes desde `.csda/agents/*.md`, contexto aislado, modelo por subagente | 2 |

**Gate:** un pack puede distribuir comandos slash, subagentes y hooks, y
`specops sync` los deposita en el proyecto.

### F4 — Sesiones y contexto (8 PD)

| Paso | Descripción | PD |
|---|---|---|
| A-4-01 | Persistencia de sesión, `--continue`, `--resume`, `/resume` | 2 |
| A-4-02 | Compactación (auto + `/compact`), preservando `response.content` íntegro | 2 |
| A-4-03 | Context editing (`clear_tool_uses`) para resultados antiguos | 1 |
| A-4-04 | **Estrategia de caché** + test que falla si `cache_read_input_tokens` es 0 en turnos consecutivos | 2 |
| A-4-05 | Checkpoints y `/rewind` (snapshot de ficheros + conversación) | 1 |

**Gate:** sesión de 2 h y ~200 mensajes que no se degrada, con tasa de acierto
de caché > 80 % medida, no estimada.

### F5 — Integración y salida (8 PD)

| Paso | Descripción | PD |
|---|---|---|
| A-5-01 | Modo `--print` con `text`/`json`/`stream-json`, exit codes documentados | 2 |
| A-5-02 | Cliente MCP: stdio + HTTP, `.mcp.json`, scopes, `/mcp` | 3 |
| A-5-03 | Herramientas y slash de dominio CSDA (§9) | 2 |
| A-5-04 | Hook `Stop` con el gate `validate --strict-tdd`; `csda-agent` como agente por defecto del harness | 1 |

### F6 — Opcional: motor propio (10 PD, solo si hace falta)

`raw-engine.ts` sobre Messages API + `toolRunner`, con herramientas propias de
alcance restringido. Solo se construye si aparece un requisito concreto que el
Agent SDK no cubra. **No lo construyas "por si acaso".**

---

## 11. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Reimplementar Claude Code entero** y no terminar nunca | La opción A recorta ~70 % del trabajo. La frontera `AgentEngine` mantiene abierta la puerta sin pagarla por adelantado. Si en F1 estás escribiendo un bucle `while stop_reason`, has elegido mal. |
| R2 | Caché de prompt rota en silencio → coste ×10 sin aviso | Test automático sobre `cache_read_input_tokens` (A-4-04) y un `/context` que muestra el desglose. Prohibido interpolar nada volátil en el system prompt: regla de lint. |
| R3 | Ejecución de comandos del modelo → ejecución arbitraria | Allowlist + confinamiento de rutas + timeouts, revisados en el gate de F2. `bypassPermissions` solo con flag explícito y aviso en pantalla. |
| R4 | Deriva de la API (betas que cambian de header o de forma) | Todas las betas centralizadas en un módulo `betas.ts` con la fecha exacta y un comentario de qué habilita. Nada de headers dispersos por el código. |
| R5 | Coste de mantener la TUI (Ink, terminales raros, Windows) | Modo `--print` funcional desde F5 como camino de escape: si la TUI falla en un entorno, el CLI sigue siendo usable. |
| R6 | El modelo declara "hecho" con el gate en rojo | El hook `Stop` de A-5-04 lo hace estructuralmente imposible. Es la diferencia entre un asistente y una herramienta de entrega. |

---

## 12. Métricas de éxito

| Métrica | Objetivo |
|---|---|
| Tiempo hasta el primer token en pantalla | < 2 s |
| Tasa de acierto de caché en sesión larga | > 80 % |
| Coste medio por turno interactivo | < $0,05 con Sonnet 5, < $0,15 con Opus 5 |
| Sesión sostenida sin degradación | ≥ 2 h / ≥ 200 mensajes |
| Comandos visibles en `/help` | ≤ 20 built-in |
| `harness run` usando `csda-agent` end-to-end | ✅ |

---

## 13. Checklist

```
F1 — Espina dorsal (10 PD)
[ ] A-1-01  paquete + bin + flags
[ ] A-1-02  AgentEngine + sdk-engine
[ ] A-1-03  REPL Ink con streaming
[ ] A-1-04  tarjetas de herramienta
[ ] A-1-05  Esc → abort real
[ ] A-1-06  status line

F2 — Gobierno (9 PD)
[ ] A-2-01  jerarquía de settings
[ ] A-2-02  motor de permisos
[ ] A-2-03  modos + Shift+Tab
[ ] A-2-04  prompt modal con regla persistente
[ ] A-2-05  endurecimiento bash/rutas/secretos

F3 — Extensibilidad (12 PD)
[ ] A-3-01  slash built-in
[ ] A-3-02  slash de usuario
[ ] A-3-03  memoria jerárquica + /init
[ ] A-3-04  hooks (9 eventos)
[ ] A-3-05  subagentes

F4 — Sesiones y contexto (8 PD)
[ ] A-4-01  persistencia + resume
[ ] A-4-02  compactación
[ ] A-4-03  context editing
[ ] A-4-04  estrategia de caché + test de regresión
[ ] A-4-05  checkpoints + rewind

F5 — Integración (8 PD)
[ ] A-5-01  modo --print + exit codes
[ ] A-5-02  cliente MCP
[ ] A-5-03  herramientas y slash CSDA
[ ] A-5-04  hook Stop con gate + agente por defecto del harness

F6 — Motor propio (10 PD, condicional)
[ ] A-6-01  raw-engine sobre Messages API + toolRunner
```

---

## 14. Arranque recomendado

Rama `feat/agent-cli`. Primer objetivo, en una semana: **A-1-01 → A-1-05**.
El criterio de "vamos bien" es cualitativo y muy concreto: escribes
`csda-agent`, pides "añade un test para `scripts/change/delta.ts`", ves el
texto aparecer token a token, ves la tarjeta de `Read`, la de `Write`, pulsas
`Esc` a mitad y para de verdad. Si eso funciona en la semana 1, el resto es
trabajo incremental. Si en la semana 1 sigues peleando con el bucle de
herramientas, revisa la decisión de la §2 — probablemente estás construyendo
la opción B sin haberlo decidido.
