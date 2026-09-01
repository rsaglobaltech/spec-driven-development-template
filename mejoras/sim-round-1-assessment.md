# Adopción simulada — ronda 1 (GATE-G6)

**Fecha:** 2026-09-01 · **Versión evaluada:** `@rsaglobaltech/specgate@0.8.1` desde npm
público · **Gate:** `GATE-G6`, definido en [ADR-0025](../docs/specs/adr/0025-simulated-adoption-is-not-external-adoption.md)

> **Juramento de procedencia.** Todo lo que hay aquí está medido ejecutando comandos,
> no leído de la documentación. Los tres informes en bruto están comiteados sin editar
> en `mejoras/sim-evidence/`, incluidas las partes que dejan mal a la herramienta y las
> que resultaron ser falsas.

> **Esto no cierra GATE-G3.** Ningún agente tenía un plazo real, un equipo, ni nada en
> juego, y los tres los orquesté yo. G3 compra independencia de las suposiciones del
> autor y la señal de que alguien *sigue* usando la herramienta; nada de eso está aquí.
> #100 sigue abierto.

## Qué tenía cada agente a mano

Un clon fijado de un repositorio ajeno, `npx @rsaglobaltech/specgate@latest`, y la web
publicada. Sin checkout de este repositorio, sin `examples/`, sin `mejoras/`, sin
contexto de la conversación que los lanzó. El encuadre era **ingeniero escéptico con un
plazo**, con permiso explícito para concluir que la herramienta no merece la pena
(`mejoras/sim-evidence/*-brief.md`).

**Aislamiento comprobado, no supuesto:** ningún fichero de los tres sandboxes menciona
la ruta de este repositorio (`grep -rl "mvp-spec-template\|learn-ai-architectures"` →
vacío en los tres). Ninguna corrida queda anulada.

| Empresa | Repositorio | Commit fijado | Stack | Veredicto del agente |
|---|---|---|---|---|
| `acme-clinic` | spring-projects/spring-petclinic | `818c4136` | Java 17 / Spring Boot / Maven | **Adoptar con reservas** |
| `nimbus-billing` | pallets/flask | `c12a5d87` | Python | **No adoptar en 0.8.1** |
| `orbit-inventory` | expressjs/express | `04bc6278` | Node.js | **No adoptar en este estado** |

## El resultado que importa

**Los tres, en tres stacks distintos, corrompieron la matriz de trazabilidad en los
primeros cinco minutos — usando solo los comandos que la propia herramienta les imprimió
como siguiente paso.** Por la regla de la fase 3 del plan («un fallo que aparece en las
tres es de la herramienta, en una sola es del dominio»), eso no admite discusión.

Ninguno lo consiguió forzando nada. La secuencia era la que recomienda la salida de
`adopt`: `onboard` → `adopt` → `req add` → `req link` → `validate`.

## Hallazgos

| id | Qué | Estado |
|---|---|---|
| **H22** | `req add` reemite un id que `adopt` ya había sembrado. `parseTraceabilityRows` deduplicaba con clave `featureFile::scenarioId`, y las filas de propuesta que siembra `adopt` no tienen ninguno de los dos: todas colapsaban en `-::-`, así que el asignador veía REQ-002 como máximo con REQ-003 en el fichero. **`req link` escribe luego *todas* las filas que casan**, de modo que enlazar un requisito nuevo reapunta en silencio el sembrado: en `acme-clinic` el requisito «Vet» acabó declarando `PetValidator.java` como implementación y `PetValidatorTests.java` como prueba, ambas falsas | **Cerrado** `ffa0f9c`. La identidad de una fila incluye su requisito. 3 tests |
| **H23** | `validate` aprobaba una matriz con id de requisito duplicado. Con las **cuatro** puertas estrictas —`--strict-tdd --strict-links --strict-requirements --strict-scenarios`— salida 0. Detectaba escenarios duplicados y no requisitos, que son la clave primaria de la tabla | **Cerrado** `ffa0f9c`. `duplicate_requirement_id`, sin flag para activarlo. 2 tests |
| **H24** | La puerta que genera `ci init` promete en su primer comentario «no PR merges if a requirement loses its feature file, **its test artifact**, or its traceability row» y corría `validate . --strict-tdd`, que no toca el disco. Enlacé un requisito a un test, borré el test, corrí el comando exacto del workflow: `✅ Validation passed`, salida 0. `--strict-links` existe, funciona y sale con 1 — simplemente no estaba en el fichero. Los cuatro proveedores tenían el mismo hueco, y la documentación el extremo débil de la misma contradicción (`validating.md` recomendaba `validate .` pelado; el hook de `automation.md` fijaba `@0.1.0`, versión anterior al renombrado, así que no podía ni ejecutarse) | **Cerrado** `19a15bc`. Test que ata la promesa del comentario al comando, por proveedor |

Cada uno se reprodujo **desde este repositorio con un test que falla** antes de tocar
nada. H22 falló en `tests/unit/adopt-seeded-ids.test.ts` con
`actual: [ 'REQ-001', 'REQ-002' ] / expected: [ 'REQ-001', 'REQ-002', 'REQ-003' ]`.

## Fricción, sin arreglar todavía

| id | Qué | Dónde salió |
|---|---|---|
| `L1` | **Detección de stack solo JS/Java/Go.** Sobre Flask: `stack: unknown`, `detected from none`, y `AI_RULES.md` con `Testing: unknown` dos líneas encima de `Test command: python -m pytest` | nimbus |
| `L2` | `req add` escribe fila en la matriz pero **ninguna sección en `spec.md`**, y mete el título en la columna *Use Case*. `getting-started` dice lo contrario: «Each REQ-NNN you add to spec.md must appear in traceability.md» | las tres |
| `L3` | **Un enlace que existe pero miente pasa limpio.** `--strict-links` es `fs.existsSync` y nada más: un requisito de vets «probado» por `PetTypeFormatterTests` es verde | acme, orbit |
| `L4` | **Nada en la puerta ejecuta la suite.** `done --check` corre `validate`, no los tests | orbit, nimbus |
| `L5` | Detección de comando de test incoherente: `onboard`/`adopt` dan `./mvnw -B test`, `harness init` escribe `mvn -B test`, mismo `pom.xml` — y el harness corre en un worktree pelado, donde `mvn` puede no estar | acme |
| `L6` | `harness prompt REQ-004` emite «# Implement REQ-004», todos los hechos a `-` y «create it from the requirement» — **sin el requisito en el prompt**. El bucle no cierra sobre un `adopt` brownfield | nimbus |
| `L7` | `--help` falla en los subcomandos (`req add`, `req link`, `harness`) pese a que dos textos de ayuda remiten a él; `--strict-links` no aparece en el `--help` de primer nivel; la web lista CircleCI y la CLI lo rechaza | nimbus, acme |
| `L8` | `plan` clasifica REQ-001 bajo «Needs Feature + Test + Code» mostrando `✓ feature:` en la línea siguiente, y lista tres veces una fila duplicada | orbit, nimbus |
| `L9` | No hay `req rm` ni renumerado: al corromperse la matriz, dos agentes la repararon a mano con un script | orbit, acme |

## Lo que la herramienta hizo bien, medido

- **`adopt` no toca el código.** Los tres verificaron con `git status`: solo ficheros
  nuevos sin seguimiento. La promesa se sostiene.
- **`onboard` sobre PetClinic** nombró exactamente los cuatro paquetes que nombraría una
  persona, sin configuración, en un repo sin documentación.
- **El aviso post-adopción** —«This passes, but it certifies the skeleton, not the
  code»— lo señalaron los tres por su cuenta como la línea más útil del día. Uno lo
  llamó «inusualmente honesto». Vale la pena saber que eso es lo que compra confianza.
- Códigos de salida correctos (0/1/2), verificados.

## Una observación que no reproduce

`nimbus-billing` informó de que, tras cuatro enlaces correctos, su `traceability.md` de
Flask contenía **una matriz de Express** — contenido de otra de las empresas. No
reproduce: hoy ese fichero tiene contenido Flask, y el único sitio de todo el sandbox
donde aparece una cadena de Express es el propio informe del agente.

**El fallo del experimento es mío, y se registra como tal:** lancé las tres corridas en
paralelo en la misma máquina, así que estaban aisladas del repositorio pero no entre sí.
No puedo descartar contaminación de mi montaje, y por tanto no puedo atribuirlo a la
herramienta. **La ronda 2 corre secuencialmente.** Queda anotado y sin cerrar, porque un
hallazgo que no reproduce es una anécdota, no un defecto.

## Regla de actualización

Este documento se actualiza cuando cambie lo medido, no cuando cambie la opinión. Cada
fila `L<n>` que se cierre se marca aquí con su commit. La ronda 2 se añade abajo, no
sustituye a ésta.
