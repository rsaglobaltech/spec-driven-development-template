# Plan: cambiar el veredicto

**Abierto:** 2026-09-02 · **Origen:** ronda 1 de `GATE-G6`
([assessment](sim-round-1-assessment.md)) · **Precede a:** cualquier función nueva

Tres ingenieros en frío evaluaron 0.8.1. Dos dijeron **no adoptar**; el tercero,
**adoptar con reservas**. Este plan no existe para cerrar la lista `L1–L9`:
existe para **cambiar esos veredictos**, y sólo se da por bueno cuando tres
agentes nuevos, en las mismas condiciones, dicen otra cosa.

## El estándar

> «La única pregunta que importa es si un `validate` verde significa algo. En
> este repositorio, no.» — `nimbus-billing`

Ese es el criterio. No «cuántos issues cerramos», sino si un verde significa
algo. Todo lo de abajo se ordena por **cuántos veredictos mueve**, no por coste
ni por lo interesante que sea de construir.

**La medida de salida es la ronda 2**: los mismos tres repositorios, los mismos
commits fijados, el mismo brief, agentes nuevos y en frío. La única variable que
cambia es la versión de la herramienta. Si el veredicto no se mueve, el plan
falló, aunque todas las casillas estén marcadas.

## Lo que ya cayó — no se rehace

| Petición explícita | Quién la pidió | Estado |
|---|---|---|
| `req add` no debe reemitir un id existente | los tres | ✅ H22 (`ffa0f9c`) |
| `validate` debe fallar con ids duplicados | nimbus, orbit | ✅ H23 (`ffa0f9c`) |
| `ci init` debe emitir las banderas estrictas | orbit, acme | ✅ H24 (`19a15bc`) |
| El agente no debe poder debilitar el comando de la puerta | — (nuestro) | ✅ #167 (`a367c90`) |
| Un escenario declarado sin test no debe pasar | — (nuestro) | ✅ #168 (`a367c90`) |

Queda pendiente **todo lo demás que pidieron**, y es donde está el veredicto.

---

## Fase 1 — La premisa: la puerta ejecuta lo que dice ejecutar

Es la fase que sola mueve dos de los tres veredictos. Todo lo demás es
acabado.

> «Y en ningún momento nada ejecutó `npm test`.» — `orbit-inventory`
> «La herramienta ha sustituido "una especificación que nadie comprueba" por
> "una especificación que comprueba un `stat` del sistema de ficheros", y en ese
> hueco estaba todo el valor.» — `orbit-inventory`

### 1.1 · `done --check` ejecuta la suite — `L4` — [x] **hecho 2026-09-02**

Hoy `done --check` corre `validate`, que es un comprobador estático. El harness
sí ejecuta el comando de test; nada fuera del harness lo hace. Un equipo que usa
la puerta sin el harness —que es el camino que documentamos— nunca ejecuta nada.

- `done --check` gana `--test-cmd`, y lo lee de `harness.config.yaml` cuando
  está.
- Sin comando de test configurado **lo dice**, no calla: el estado es «no
  verificado», no «verificado».

**Era peor de lo reportado.** `--check` y `--strict` se parseaban a
`DoneOptions` y **no se leían en ninguna parte**: `done --check` era un no-op
que imprimía un tick. Medido sobre una matriz que apunta a ficheros
inexistentes, donde `validate --strict-links` sale 1:
`✔ REQ-001 → Implemented (1 row updated)`, salida 0. Cuatro páginas de
documentación decían «validates first». Cerrado con 7 tests de CLI y 6 de
dominio; `--strict` ahora es `--strict-tdd --strict-links --strict-coverage`,
y `--test-cmd` / `test_cmd:` ejecutan la suite y exigen que pase.

### 1.2 · Un enlace que existe pero miente — `L3` — [x] **hecho 2026-09-02**

`--strict-links` es `fs.existsSync` y nada más. Un requisito de vets «probado»
por `PetTypeFormatterTests` pasa limpio. `--strict-coverage` (#168) ya cierra la
mitad: el escenario tiene que estar **nombrado** en el artefacto de test. Falta
la otra mitad, y hay que decidir con honestidad hasta dónde llega:

- Un artefacto de test que no menciona ni el requisito ni ninguno de sus
  escenarios es un enlace sin evidencia → hallazgo bajo `--strict-coverage`.
- **Lo que no vamos a fingir:** sin ejecutar la suite y leer qué test cubre qué
  línea, «este test prueba este requisito» no es decidible. Se documenta el
  límite en vez de sugerir que lo resolvemos.

### 1.3 · Decidir el nivel de puerta por defecto — [x] **decidido 2026-09-02**

> «La puerta que habría cazado la mitad de lo que rompí, `--strict-links`, está
> apagada por defecto y no aparece en ninguno de los tres sitios que recomiendan
> una invocación de CI.» — `acme-clinic`

Un usuario que sigue la documentación acaba con **una puerta más débil de la que
la herramienta sabe dar**. Eso es un defecto de diseño, no de documentación.

Decidido en [ADR-0026](../docs/specs/adr/0026-the-default-gate-is-the-strong-gate.md):
`validate` pasa a ser estricto por defecto **en la 1.0**, con `--lenient` para
lo antiguo. Tres condiciones: la 0.9 **avisa sin fallar** (nadie debe conocer
este cambio por un build en rojo); cada check promovido lleva línea de arreglo
con fichero y edición; y la medida de la 1.0 incluye **cuánta gente acaba
tecleando `--lenient`** — si es todo el mundo, volvimos al principio con una
bandera de más.

---

## Fase 2 — Las contradicciones

Un agente escéptico pierde la confianza más rápido con una contradicción que con
una carencia. Estas son las que encontraron, cada una es la documentación y el
comportamiento discrepando.

### 2.1 · `--strict-tdd` y lo que promete — `L8` — [x] **hecho 2026-09-02**

> «Dos eran marcadores de posición sin escenario y con artefacto de test `TBD`
> (verdes bajo `--strict-tdd`, que la documentación dice que falla exactamente
> eso).» — `orbit-inventory`

Medido: la regla TDD-1 sólo dispara cuando el estado es `In Dev` o posterior, y
esas filas eran `Draft`. El código es defendible; `getting-started.md:170` dice
otra cosa: *«`validate --strict-tdd` also flags missing scenarios/tests»*.

**Una de las dos miente y hay que elegir cuál.** Recomendación: la
documentación, porque la regla actual es correcta —un borrador todavía no debe
nada—, y lo que falta es que sea **legible**: que `validate` diga cuántas filas
se están saltando la comprobación por estar en `Draft`.

### 2.2 · `plan` se contradice a sí mismo — `L8` — [x] **hecho 2026-09-02**

Clasifica `REQ-001` bajo «Needs Feature + Test + Code» y muestra `✓ feature:` en
la línea siguiente. Un informe que se desmiente en dos líneas consecutivas no se
vuelve a leer.

### 2.3 · Detección de comando de test incoherente — `L5` — [x] **hecho 2026-09-02**

`onboard`/`adopt` dan `./mvnw -B test`; `harness init` escribe `mvn -B test`,
sobre el mismo `pom.xml`. Y el harness corre en un worktree pelado donde `mvn`
puede no estar instalado. Una sola función que resuelve el comando, y todos la
usan.

### 2.4 · La web y la CLI en desacuerdo — `L7` — [x] **hecho 2026-09-02**

La web lista CircleCI; la CLI lo rechaza. `--strict-links` no aparece en el
`--help` de primer nivel. Barrido completo: cada afirmación de la web se
comprueba contra el binario, con un test que lo mantenga así.

---

## Fase 3 — El camino de entrada

Lo que un evaluador toca en los primeros diez minutos.

### 3.1 · `req add` escribe la prosa del requisito — `L2`, `L6` — [x] **hecho 2026-09-02**

Petición explícita de nimbus (nº 3) y causa de dos síntomas distintos:

- `req add` escribe fila en la matriz y **ninguna sección en `spec.md`**, metiendo
  el título en la columna *Use Case*.
- Por eso `harness prompt REQ-004` emite «# Implement REQ-004» con todos los
  hechos a `-` y **sin el requisito dentro**: no hay prosa que leer. *«El bucle
  no cierra sobre un `adopt` brownfield.»*

Además, `validate` debe fallar cuando una fila de la matriz no tiene su sección
`## REQ-NNN` en `spec.md` — es la tercera parte de la petición nº 2 de nimbus.

**Sale como aviso, no como error, y es deliberado.** ADR-0026 compromete a la
línea 0.9 a avisar de lo que será obligatorio en la 1.0. Implementado como
error, rompía 14 tests propios y —lo que importa— habría puesto en rojo a todo
proyecto cuya matriz es anterior a que `req add` escribiera prosa. Un
verde-a-rojo en una minor es cómo se saca una herramienta de un pipeline, así
que mi propio ADR mandaba aquí.

**Cuatro formas de documentar un requisito, no una.** Al construirlo aparecieron
`## REQ-NNN` (lo que escribe `adopt`), `### Requirement: REQ-100 — …` (specs de
capacidad, ADR-0022), la tabla de §8 (lo que escribía `init`, y lo que usa **este
repositorio**) y la prosa en `docs/specs/capabilities/**`. La primera versión
solo aceptaba una y marcaba 14 falsos positivos en nuestro propio repo — el
mismo tipo de puerta que castigaron los tres ingenieros.

### 3.2 · `--help` en los subcomandos — `L7` — [x] **hecho 2026-09-02**, adelantado con la fase 2

> «`--help` falla en cada subcomando que probé (`req add`, `req link`,
> `harness`) pese a que dos textos de ayuda te dicen que lo uses.»

Media hora de trabajo, y es lo primero que toca alguien que evalúa. Petición
explícita de nimbus (nº 5).

**Medido con cuidado, eran tres y no todos**: `req add`, `req link` y `done`
respondían a `--help` con «falta un argumento». `harness run`, `plan`, `adopt`
y `onboard` ya funcionaban. Y uno más que nadie reportó: `validate --help`
contestaba «expects exactly one positional argument» — la puerta principal
negándose a explicarse — y su ayuda no nombraba `--strict-links`, así que la
bandera que habría cazado la mitad de lo que rompieron era invisible.

### 3.3 · El aviso honesto, más arriba — [x] **hecho 2026-09-02**

Los tres señalaron por su cuenta *«This passes, but it certifies the skeleton,
not the code»* como lo mejor del día. Uno lo llamó «lo más intelectualmente
honesto que he visto decir a una herramienta sobre sí misma». **Eso es lo que
compra confianza**, y aparece una vez, tarde. Merece estar en la portada de la
documentación y en la salida de `adopt`.

---

## Fase 4 — Operaciones

### 4.1 · `req rm` y renumerado — `L9` — [x] **hecho 2026-09-02**

Al corromperse la matriz, dos de los tres la repararon con un script a mano
porque no hay forma soportada de deshacer un `req add`. Con H22 cerrado el
disparador desaparece, pero la carencia no: una matriz sin operación de borrado
no es editable por un equipo.

`req rm` quita fila(s) y prosa, con `--dry-run`, y exige `--force` pasado
`Draft` —borrar un requisito entregado elimina el registro de que se entregó, y
`done --status Deprecated` suele ser lo que se quería—. Avisa del `.feature`
que quede sin fila, porque `validate` falla por eso y enterarse por un build en
rojo cuesta una tarde.

**El renumerado no se construye, y es una decisión.** Un id no vive solo en la
matriz: está en tags `@REQ-014`, en nombres de test, en mensajes de commit, en
la rama `harness/REQ-014` que alguien ya empujó y en el tracker del equipo.
Renombrar los dos ficheros que esta herramienta controla dejando el resto con
el id viejo deja el proyecto **peor** que antes — y un renombrado que cubre el
60 % en silencio es exactamente la clase de media promesa que este repositorio
lleva la semana encontrándose. Documentado en `writing-specs.md`.

### 4.2 · Explicar la observación que no reproduce

Petición nº 1 de nimbus, y la primera de su lista: la matriz de Flask que
contenía contenido de Express. **Es mi fallo de experimento** —lancé las tres
corridas en paralelo—, y la respuesta honesta no es un test de regresión sino
correr la ronda 2 en secuencia y decir eso. Si reaparece aislado, entonces es un
defecto y tendrá su reproducción.

---

## Fase 5 — La medida

Ronda 2 de `GATE-G6`, **idéntica**: `spring-petclinic` en `818c4136`, `flask` en
`c12a5d87`, `express` en `04bc6278`; mismo brief, mismo encuadre escéptico, misma
permisión explícita de concluir que no merece la pena. Agentes nuevos, sin
contexto. **En secuencia, no en paralelo.**

Lo que se compara no es «cuántos bugs salieron» sino:

1. **El veredicto**, literal, de cada uno.
2. **Si un verde significa algo**: la lista de cinco puntos con la que
   `nimbus-billing` justificó su «no» — ¿cuántos siguen siendo ciertos?
3. **Los tres cambios de forma** que acme dijo necesitar antes de dárselo a un
   equipo.

Los `FINDINGS.md` de la ronda 2 se comitean igual de crudos que los de la ronda
1, incluidos los que dejen mal a la herramienta.

---

## Después: equipos grandes

Deliberadamente **después** de la ronda 2, no en paralelo. Escalar a 20 personas
una herramienta cuyo verde no significa nada multiplica el problema en vez de
resolverlo.

| | Qué | Por qué es de escala |
|---|---|---|
| `L1` | Detección de stack políglota: Python y .NET como mínimo | Sobre Flask: `stack: unknown` y `AI_RULES.md` con `Testing: unknown` dos líneas encima de `Test command: python -m pytest`. Una organización grande es políglota por definición |
| — | Migración de matriz entre versiones | Sin ella, 20 personas con matrices de formatos distintos |
| — | El harness en la portada | Es lo diferencial y ninguno de los tres agentes llegó a él |
| #103 | Orquestación multi-repo | Ya diferido a v2 por decisión |

---

## Lo que este plan no hace

- **No cierra `GATE-G3`.** La ronda 2 sigue siendo adopción simulada. Un agente
  no tiene plazo, ni equipo, ni nada en juego. `#100` sigue abierto.
- **No sube la versión.** La 0.9.0 se decide con la ronda 2 medida, no antes.
- **No abre funciones nuevas.** `#33` y `#32` ya están; el resto del backlog
  espera. Esa es la instrucción y es la correcta: una función más sobre una
  puerta que no cierra es una función más que no significa nada.

## Regla de actualización

Cada fase se marca `[x]` aquí al cerrarla, en la misma sesión, con su commit.
La ronda 2 se añade al final del assessment de la ronda 1, no lo sustituye.
