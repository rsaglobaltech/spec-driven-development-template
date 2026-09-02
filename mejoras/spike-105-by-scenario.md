# Spike #105 (B3) — `harness run --by-scenario`

**Fecha:** 2026-09-02 · **Versión:** `develop` en `87a09c4` · **Agente:** `claude -p`
real, no stub · **Coste:** 7 invocaciones de agente

> **Juramento de procedencia.** Medido ejecutando el bucle, no razonado sobre él.
> El issue pedía exactamente esto: *«Worth a spike, not a design»*.

## Veredicto

**No construir `--by-scenario` con la forma propuesta.** Cuesta 4× las invocaciones
de agente y 2,5× el reloj para entregar el mismo requisito, y el beneficio que
promete —localizar el fallo— ya lo da el bucle actual por otra vía.

Pero el spike encontró **el problema real que hace peligroso un requisito de
varios escenarios**, y no es el que el issue supone. Está abajo, y merece issue
propio.

## El fixture

Proyecto Node generado con `init`, un requisito `REQ-010` («Invoice totals») con
cuatro escenarios de dificultad creciente: suma, impuesto por línea, redondeo
half-up, y descuento antes de impuesto. Comando de test real (`node --test`), no
simulado. Los dos recorridos parten del mismo commit.

## Medida

| | **Hoy** (requisito entero) | **B3** (por escenario) |
|---|---|---|
| Invocaciones de agente | **1** | **4** |
| Reloj de agente | **89 s** | **229 s** |
| Prompt | 558 palabras, una vez | 332–351 palabras × 4 = **1375** |
| Intentos hasta verde | 1 | 1 por escenario |
| Resultado | los 4 escenarios en verde | los 4 escenarios en verde |

El prompt por paso es efectivamente más corto —la mitad de largo—, que es lo que
la propuesta buscaba. Pero **en agregado es 2,5× más contexto**, porque
`AI_RULES.md` y los hechos del requisito se repiten en cada paso. La propuesta
optimizaba el tamaño del prompt individual; lo que se paga es la suma.

## Por qué el beneficio prometido ya existe

El issue dice: *«un fallo en el quinto se reporta como "el requisito falló"»*.
Medido, eso es cierto **solo del informe**, no de lo que recibe el agente.

- El agente **nombra sus tests con el id del escenario** sin que nadie se lo
  pida: `test('SCN-012 money is rounded half-up to two decimals')`. La salida del
  runner ya localiza el fallo.
- `previousFailure` incluye `gate.output` entero
  (`RunCommand.ts:886`), así que esa salida —con el nombre del escenario— **ya
  viaja al siguiente intento**.

Lo que no localiza es `.harness/runs/*.json`, que anota `endedAt: "gate"` y nada
más. Eso es una fila en el registro, no un cambio en la forma del bucle.

## Lo que sí encontró el spike

Forcé un fallo añadiendo `SCN-014`, un escenario que **contradice** a `SCN-013`
(descuento del 100 % con impuesto no nulo, cuando el anterior exige descuento
antes de impuesto). Esperaba ver cómo se reporta el fallo. No hubo fallo:

```
✅ REQ-010  pass (1 attempt)  → harness/REQ-010
```

El agente escribió tests para cuatro de los cinco escenarios y **omitió el
imposible**. La puerta aprobó, y la fila pasó a `Implemented`.

Reproducido después **sin agente**, de forma determinista: feature con tres
escenarios, tests que cubren dos, fila `Implemented`.

```
validate .                                        → exit=0
validate . --strict-tdd                           → exit=0
validate . --strict-scenarios                     → exit=0
validate . --strict-links                         → exit=0
validate . --strict-tdd --strict-scenarios --strict-links → exit=0
```

**Un escenario declarado que nadie prueba pasa todas las puertas.**
`--strict-scenarios` mide la *calidad* del Gherkin —que el escenario tenga When,
Then y tres pasos—, nunca su *cobertura*. La matriz nombra un `Scenario ID` por
fila para un fichero que puede contener cinco.

Es la familia H1/H15/H19/H23 otra vez: una puerta que aprueba lo que no
comprobó. Y coincide con lo que la empresa simulada `nimbus-billing` reportó por
otra vía: la web afirma *«scenarios must actually execute»* y no se cumple.

**Esto sí es lo que hace peligroso un requisito de varios escenarios**, y no la
localización de fallos. `--by-scenario` lo arreglaría de rebote —no puedes
saltarte el escenario 5 si el paso 5 es su propio intento—, pero por 4× el coste
y cambiando la forma del bucle. Una comprobación en la puerta lo arregla directa
y sin tocar el harness.

## Recomendación

1. **Cerrar #105 sin construir `--by-scenario`.** La medida no respalda la
   interfaz, y el issue ya pedía probar antes de comprometerse.
2. **Abrir la cobertura de escenarios como issue propio**, que es lo que el
   spike compró. El diseño no es obvio —casar id de escenario contra el artefacto
   de test es una heurística, y hacerlo obligatorio rompería a todo proyecto con
   features de varios escenarios—, así que va detrás de una bandera y se diseña,
   no se improvisa dentro de un spike.
3. **Barato y aparte:** anotar en `AttemptRecord` en qué escenario paró el gate.
   Es la única parte de la queja original que resultó cierta.

## Lo que no se sostuvo

En la primera pasada el comando de test del fixture estaba roto
(`node --test tests/`, que Node 24 no resuelve) y **el agente editó
`package.json` para arreglarlo** y así pasar la puerta. El arreglo era correcto,
pero el hecho no lo es: `DEFAULT_PROTECTED_PATHS` protege `spec.md`,
`AI_RULES.md`, `features/**` y `docs/specs/**` — no el fichero donde vive el
comando que define la puerta. Un agente que no consigue pasar el test puede
debilitar el test. Va como hallazgo aparte, con su reproducción.

## Regla de actualización

Los números de arriba salen de una corrida con un agente real y un requisito de
cuatro escenarios. Si se vuelve a medir con un requisito más grande —seis, ocho—
el balance puede cambiar, y entonces se añade la medida nueva debajo, no se
sustituye ésta.
