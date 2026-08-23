# Valoración — BDD con Cucumber en la era de agentes

**Abierto:** 2026-08-22 · **Alcance:** `main` · **Estado:** valoración + hallazgo verificado

Dos preguntas, respondidas por separado: **¿sigue siendo BDD la apuesta correcta
ahora que quien escribe el código es un agente?** y **¿hay versiones o sintaxis
de Cucumber que no soportamos?**

La segunda destapó un defecto grave en los packs curados. Va con reproducción
exacta, porque no es una opinión.

---

## Veredicto en una frase

**BDD no es el problema — nuestro Gherkin sí.** Cucumber está más vivo y es más
apto para agentes que nunca (protocolo de mensajes, plugins, ejecución en hilos);
la sintaxis lleva estable desde 2018; y nosotros no soportamos ni lo de 2018.
Peor: **27 de los 28 escenarios de los packs curados son escenarios vacíos para
Cucumber, y pasan en verde sin ejecutar un solo paso.**

---

# Parte 1 — ¿Es BDD «moderno» para la era de agentes?

## 1.1 La pregunta detrás de la pregunta

La duda razonable es: si un agente puede leer una spec en prosa y escribir el
test él mismo, ¿para qué una capa intermedia con `Given/When/Then`, ficheros
`.feature` y pegamento de step definitions?

La respuesta no está en la elegancia del formato. Está en **qué necesita el
harness**. `docs/specs/harness.md` lo dice: el escenario Gherkin es la señal de
recompensa del bucle. Y una señal de recompensa tiene que cumplir tres cosas que
la prosa no cumple:

| Requisito de la señal                                            | Gherkin                                                    | Spec en prosa + juicio de LLM                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| **Determinista** — el mismo código da el mismo veredicto siempre | Sí                                                         | No: el juez varía entre ejecuciones             |
| **No auto-modificable** — el agente no puede ablandarla          | Sí, si se protege el fichero (A1 de la propuesta anterior) | No: el criterio es reinterpretable en cada pase |
| **Legible por quien no programa**                                | Sí, es su motivo de existir                                | Sí                                              |

En el momento en que el juez del bucle es una IA, el bucle deja de tener un gate
y pasa a tener una opinión. Esa es exactamente la crítica que este repositorio ya
le hace al artículo de InfoQ, y es la misma aquí: **la era de agentes no hace
menos necesaria una comprobación mecánica, la hace más.**

## 1.2 Lo que sí hay que conceder

Tres críticas a BDD son ciertas y conviene decirlas:

1. **La capa de pegamento cuesta.** Un escenario no corre sin step definitions.
   El agente paga ese coste en cada requisito nuevo. Mitigación real y ya
   presente: cuando un paso no está definido, Cucumber **imprime el snippet**, y
   el harness ya reinyecta la salida del gate fallido en el prompt del siguiente
   intento. Es decir: el bucle de reintento ya enseña al agente cómo cerrar el
   hueco. Es una de las cosas que mejor funcionan hoy sin que nadie lo diseñara
   así.
2. **Gherkin generado por IA se degrada de forma predecible** hacia `Then` vagos,
   escenarios con varias conductas y ejemplos de relleno. Es literalmente lo que
   miden las reglas de calidad de `pack lint`. El problema no es que la crítica
   sea falsa, es que nuestra defensa contra ella **solo se aplica a los packs**
   (propuesta A3).
3. **La sintaxis es verbosa** comparada con un test unitario. Cierto, y es el
   precio de que la lea un product owner. Ese sigue siendo el hueco P2.

## 1.3 Dónde sí conviene modernizar: la línea de requisito, no el escenario

Lo que ha madurado en los últimos años no es un sustituto de Gherkin, es una
sintaxis más estricta **para la capa de encima**: la frase del requisito.

Hoy `change/delta.ts` exige una palabra clave RFC 2119 (`no_rfc2119_keyword`),
que es un buen suelo pero un suelo bajo: «El sistema DEBE gestionar los pagos»
lo cumple y no es verificable.

**EARS** (_Easy Approach to Requirements Syntax_) impone plantilla:

```
Cuando <disparador>, el <sistema> DEBERÁ <respuesta observable>
Mientras <estado>, el <sistema> DEBERÁ <respuesta observable>
Si <condición no deseada>, entonces el <sistema> DEBERÁ <respuesta>
```

Encaja como **complemento, no como sustituto**: EARS disciplina el requisito,
Gherkin lo ejemplifica, y la matriz los une — que es la estructura que ya
tenemos. Propuesta F6 abajo, opcional y de bajo coste.

## 1.4 Conclusión de la parte 1

Mantener Gherkin. La decisión no necesita revisarse; **su implementación sí, y
con urgencia**. Lo que sigue explica por qué.

---

# Parte 2 — Qué de Cucumber no soportamos

## 2.1 El hallazgo: los packs curados producen escenarios vacíos

**27 de los 28 escenarios que Cucumber ve en `packs/**` tienen cero pasos.**
El único sano es `packs/auth/backend/templates/features/auth/register.feature.tpl`.
`templates/**` está limpio: 11 escenarios, 0 vacíos.

**Causa.** Las plantillas de los packs escriben las palabras clave en
mayúsculas:

```gherkin
Feature: Evaluation respects rollout percentage
  Scenario: Evaluation respects rollout percentage
    GIVEN a flag with 50% rollout in production
    WHEN 100 users are evaluated
    THEN approximately half receive value=true
```

**Las palabras clave de Gherkin distinguen mayúsculas de minúsculas.** `GIVEN` no
es una palabra clave: el parser real la absorbe como parte de la _descripción_
del escenario. No hay error de sintaxis. El escenario existe, y está vacío.

**Y un escenario vacío pasa.** Reproducido con el Cucumber que este repo tiene
instalado:

```
1 scenario (1 passed)
0 steps
exit=0
```

**Por qué esto es grave y no cosmético.** Es H1 otra vez, con otro disfraz: H1
era «el gate no ejecutaba el escenario que supervisaba»; esto es «el escenario
que supervisa no contiene nada que ejecutar». Cualquier proyecto sembrado con
`csda specops add` recibe una señal de recompensa que aprueba lo que sea. El
harness corriendo sobre esos requisitos no está verificando: está firmando.

**Y nuestro propio linter dice que está bien:**

```
$ csda pack lint --pack-root ./packs --pack feature-flags/backend --strict
ℹ️  Pack 'feature-flags/backend' passed all lint checks.
exit=0
```

Porque el mini-parser de `lint_pack.ts` usa `/^(Scenario Outline|Scenario):/i` y
`/(Given|When|Then|And|But)/i` — **insensible a mayúsculas**. Ve tres pasos donde
Cucumber ve cero. Las reglas de calidad de escenario, escritas expresamente para
proteger al harness, dan verde a un escenario que no ejecuta nada.

Un linter que aprueba lo que el runner ignora es peor que no tener linter: da
una garantía que no existe. Es la misma frase que este repositorio se aplica a sí
mismo en `AI_RULES.md` sobre los documentos que mienten.

## 2.2 El segundo agujero silencioso: un filtro que no casa nada sale 0

```
$ cucumber-js --tags "@NO-EXISTE"
0 scenarios
0 steps
exit=0
```

El gate del harness sustituye `{scenario}` y `{feature_file}` en `test_cmd`
(`scripts/harness/run.ts:222-233`). Si el escenario se renombra, el filtro deja
de casar, **el gate sale verde sin ejecutar nada** y `csda done` marca el
requisito como implementado.

Hoy lo único que hay contra esto es `filterHint` (`run.ts:236-263`), que busca
con una expresión regular `/(\d+)\s+(scenarios|tests|examples|specs)/i` en la
salida de texto y **solo avisa cuando cuenta de más**, nunca cuando cuenta cero.
Es una heurística sobre prosa. La solución correcta existe y es F5.

Nota comprobada y a favor de Cucumber: un paso **sin definir** sí sale 1 (modo
estricto por defecto). Cucumber protege bien todos los casos salvo el escenario
vacío y el filtro que no casa — y nosotros hemos caído justo en los dos.

## 2.3 Sintaxis de Gherkin que no soportamos

Comprobado contra la tabla de dialectos del propio parser instalado
(`@cucumber/gherkin` 42, 80 dialectos):

| Sintaxis                                              | Cucumber    | `lint_pack` | `infer_pack` | `as_change` |
| ----------------------------------------------------- | ----------- | ----------- | ------------ | ----------- |
| `Scenario:`                                           | Sí          | Sí          | Sí           | Sí          |
| `Example:` — **sinónimo oficial de `Scenario:`**      | Sí          | **No**      | **No**       | **No**      |
| `Scenario Outline:`                                   | Sí          | Sí          | Sí           | Sí          |
| `Scenario Template:` — sinónimo oficial               | Sí          | **No**      | **No**       | **No**      |
| `Examples:`                                           | Sí          | Sí          | n/a          | n/a         |
| `Scenarios:` — sinónimo oficial                       | Sí          | **No**      | n/a          | n/a         |
| `Rule:` — **añadida en Gherkin 6 (2018)**             | Sí          | **No**      | **No**       | **No**      |
| `Background:`                                         | Sí          | **No**      | **No**       | **No**      |
| `*` como palabra clave de paso                        | Sí          | **No**      | **No**       | **No**      |
| Etiquetas `@tag`                                      | Sí          | **No**      | Sí           | **No**      |
| 80 dialectos (`# language: es` → `Escenario`, `Dado`) | Sí          | **No**      | **No**       | Parcial     |
| Mayúsculas (`GIVEN`, `SCENARIO`)                      | **Rechaza** | **Acepta**  | **Acepta**   | **Acepta**  |

Las dos últimas filas son las que hacen daño en direcciones opuestas:
**rechazamos sintaxis que Cucumber acepta, y aceptamos sintaxis que Cucumber
descarta en silencio.**

Consecuencias concretas, más allá del hallazgo de §2.1:

- **`Background:` ignorado ⇒ falsos positivos.** Un escenario cuyo `Given` vive
  en el `Background` se marca «menos de 3 pasos» y «sin paso Given». La regla
  castiga precisamente la forma bien factorizada de escribir Gherkin.
- **`Example:` ignorado ⇒ falso silencio.** Un feature escrito con la palabra
  clave moderna produce cero escenarios para el linter: no avisa de nada porque
  no ve nada. Y `isGenericTitle` penaliza además los títulos que empiezan por
  «example».
- **Dialectos ⇒ el linter es ciego en español.** El CLI ofrece
  `csda config set language es|pt`, y un equipo con features en español no
  recibe ninguna comprobación de calidad de escenario.

## 2.4 Tres parsers propios que no se ponen de acuerdo

| Fichero                            | Palabras clave de escenario             | Mayúsculas   | Etiquetas |
| ---------------------------------- | --------------------------------------- | ------------ | --------- |
| `scripts/lint_pack.ts:250`         | `Scenario Outline\|Scenario`            | insensible   | no        |
| `scripts/infer_pack.ts:93`         | `Scenario Outline\|Scenario`            | insensible   | **sí**    |
| `scripts/specops/as_change.ts:112` | `Scenario\|Scenario Outline\|Escenario` | **sensible** | no        |

Tres respuestas distintas a la misma pregunta, en el mismo repositorio, sobre el
mismo fichero. Es el mismo diagnóstico que ya motivó unificar el escáner de
placeholders en `scripts/lib/placeholders.ts` —«dos comprobadores que responden
distinto a la misma pregunta es peor que uno imperfecto»— y aquí son tres.

## 2.5 Versiones: no vamos atrasados en dependencias, vamos atrasados en 2018

|                                  | Nuestro   | Último publicado |
| -------------------------------- | --------- | ---------------- |
| `@cucumber/cucumber`             | `^13.2.1` | **13.2.1**       |
| `@cucumber/gherkin` (transitiva) | 42.0.0    | 42.0.1           |

Estamos al día. Y **la sintaxis de Gherkin no ha cambiado desde `Rule` en
2018** — Gherkin 6. O sea: la respuesta literal a «¿hay sintaxis nueva que no
soportamos?» es **no hay sintaxis nueva; hay sintaxis de hace ocho años que
nunca soportamos.** La deuda no llegó, siempre estuvo.

Un aviso operativo de la versión sí importa: **cucumber-js 13.0.0 (2026-06-02)
retiró el soporte de Node 20**. Nuestro suelo es Node 22 (D11), así que no nos
afecta — pero un proyecto generado que siga en 20 no puede subir a 13, y merece
una línea en la documentación.

## 2.6 Lo que sí ha cambiado en Cucumber, y no usamos

Aquí está la respuesta de verdad a «¿es esto moderno para agentes?». Cucumber ha
evolucionado justo hacia donde un harness lo necesita:

| Capacidad                                              | Desde  | Qué nos daría                                                                                                                                      |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Protocolo de mensajes** (`--format message`, NDJSON) | maduro | Resultado **estructurado**: qué pickles se ejecutaron, con qué etiquetas, cuántos pasos y con qué estado. Sustituye el raspado de prosa por hechos |
| **Plugins externos**                                   | 12.5.0 | Un plugin `csda` que emita el veredicto por requisito sin envolver el comando                                                                      |
| **Sharding de ejecución**                              | 12.2.0 | Reparto de la suite entre procesos — encaja con C1                                                                                                 |
| **Paralelismo con hilos**                              | 13.0.0 | Gate más rápido por worktree                                                                                                                       |
| **Config en TypeScript**                               | 12.4.0 | Config de proyecto tipada                                                                                                                          |

Comprobado en esta sesión: `--format message` emite `gherkinDocument`, `pickle`,
`testCase`, `testStepFinished`, `testRunFinished`… y **cada `pickle` lleva sus
etiquetas**:

```
pickles: a real scenario here tags=@REQ-001,@SCN-001
```

Con eso, «¿se ejecutó de verdad el escenario de REQ-001 y pasó?» deja de ser una
heurística sobre texto y pasa a ser una consulta sobre datos.

---

# Parte 3 — Propuestas

| ID     | Propuesta                                                          | Coste | Urgencia      |
| ------ | ------------------------------------------------------------------ | ----- | ------------- |
| **F1** | Un solo parser de Gherkin, con la tabla oficial de dialectos       | Medio | Alta          |
| **F2** | Arreglar los 27 ficheros y blindar la regresión con el parser real | Bajo  | **Inmediata** |
| ~~**F3**~~ | Paridad con Cucumber en `pack lint` — **hecho (2026-08-22)**   | Bajo  | Alta          |
| ~~**F4**~~ | Trazabilidad por etiquetas — **hecho (2026-08-23)**              | Medio | Media |
| ~~**F5**~~ | El gate del harness sobre el protocolo de mensajes — **hecho (2026-08-22)** | Medio | Alta |
| **F6** | EARS opcional en la línea de requisito                             | Bajo  | Baja          |

## F2 · Arreglar los 27 ficheros y blindar la regresión — **hecho (2026-08-22)**

> Los 27 ficheros pasan a palabras clave canónicas y
> `tests/unit/shipped-gherkin.test.ts` parsea con el parser de referencia cada
> Gherkin publicado, fallando si un escenario tiene cero pasos. Medido antes y
> después sobre el mismo fichero: `0 steps · exit 0` → `3 steps · exit 1`.
> El guarda se escribió **antes** de la corrección, para verlo fallar.

Dos partes, y la segunda importa más que la primera:

1. Pasar las palabras clave a la forma canónica (`Given`/`When`/`Then`/`And`) en
   los 27 ficheros. Es mecánico.
2. **Un test que parsee cada `.feature` y `.feature.tpl` enviado con el parser
   de referencia y falle si un escenario tiene cero pasos.**
   `@cucumber/gherkin` ya está instalado como dependencia de desarrollo, así que
   el test no cuesta ninguna dependencia nueva.

Sin la parte 2, esto vuelve. Con la parte 2, no puede volver — y encaja con la
regla de la casa: no debilitar una comprobación para que pase, escribirla.

**Ojo con el orden de publicación.** Los packs corregidos cambian el contenido
renderizado, así que un proyecto que ya los tenga instalados verá deriva en
`specops diff`. Es exactamente el caso de uso de `specops diff --as-change`: la
corrección se revisa como intención, no como diff de ficheros. Merece una línea
en el CHANGELOG diciendo que los escenarios de los packs **no se ejecutaban**.

## F1 · Un solo parser, con la tabla oficial de dialectos — **hecho (2026-08-22)**

> Implementado por el camino **(b)**, el recomendado: parser propio en
> `packages/core/src/domain/Gherkin.ts` (dominio puro) con la tabla vendorizada
> en `GherkinDialects.ts`, **generada** desde `gherkin-languages.json` en vez de
> transcrita. Cero dependencias de runtime. Dos guardas contra la deriva: la
> tabla contra la oficial, y el parser contra `@cucumber/gherkin` sobre los 38
> ficheros publicados más ocho casos construidos (Rule, Background, etiquetas,
> outline, doc strings, herencia de `And`/`*`, es y pt). Atribución MIT en
> `THIRD-PARTY-NOTICES.md`. Los tres parsers de §2.4 quedan en uno.
>
> **Efecto colateral:** `pack lint` gana la paridad de `F3` — el fichero que
> aprobaba ahora falla con `only 0 step(s)` y exit 1. Lo que queda de `F3` es
> nombrar el defecto en el mensaje.

`scripts/lib/gherkin.ts`: un módulo puro que devuelva feature, reglas, fondo,
escenarios, pasos, etiquetas y ejemplos, y que consuman los tres sitios de §2.4.

**Con la restricción de la casa: cero dependencias en tiempo de ejecución**
(`package.json` no tiene `dependencies`, y `AI_RULES.md` exige un ADR para
añadir una). Dos caminos:

| Camino                                                                                                                                                         | A favor                                                           | En contra                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **(a)** Depender de `@cucumber/gherkin` en producción                                                                                                          | Corrección total y gratis                                         | Rompe la promesa de cero dependencias; exige ADR |
| **(b)** Parser propio + **tabla `gherkin-languages.json` vendorizada** (datos, no código), con un **test diferencial** contra `@cucumber/gherkin` como oráculo | Mantiene cero dependencias; el oráculo garantiza que no derivamos | Hay que escribir el parser y mantener la tabla   |

**Recomiendo (b).** La promesa de cero dependencias es estructural en este
producto —el CLI se ejecuta con `npx` en máquinas ajenas— y el riesgo real que
tiene un parser propio es la deriva, que es justo lo que el test diferencial
elimina. La tabla es MIT y hay que registrarla en la puerta de licencias
(`scripts/license_check.ts`) con su atribución.

**Alcance mínimo suficiente:** `Rule`, `Background`, `Example`,
`Scenario Template`, `Scenarios`, `*`, etiquetas, y las palabras clave de los
dialectos que el CLI ofrece (`en`, `es`, `pt`) — no los 80.

## F3 · Paridad con Cucumber en el linter — **hecho (2026-08-22)**

Con F1 en su sitio, dos reglas nuevas, **error siempre, no advertencia**:

- `scenario_has_no_steps` — Cucumber vería este escenario vacío. No es cuestión
  de estilo: es un test que no prueba nada y pasa.
- `keyword_case_invalid` — `GIVEN`, `SCENARIO`, `Feature :`… con el `fix`
  literal. Cucumber los descarta en silencio; nosotros los nombramos.

Y una **advertencia** de deriva: escenario declarado en `pack.yaml` que no
aparece en su plantilla con ese título — la regla de deriva de nombre ya existe,
pero hoy la ejecuta un parser que no ve la mitad de los títulos posibles.

### Lo que se hizo

Las dos reglas son **error por sí solas, sin `--strict`**. Eso era el punto:
antes eran opiniones de estilo que `--strict` ascendía, CI usaba `--strict`, y
los packs salieron igualmente con 27 escenarios que no ejecutaban nada. Un
ascenso condicional no era la protección que parecía.

```
❌ [ERROR] templates/features/example.feature.tpl:3: keyword_case_invalid —
   `GIVEN` is not a Gherkin keyword; write `Given`. Cucumber reads it as prose,
   so the line does nothing.
❌ [ERROR] SCN-001 → "…": scenario_has_no_steps — Cucumber sees no steps here,
   so this scenario passes without testing anything. If the steps look like they
   are there, check their keywords: Gherkin is case-sensitive.
```

`findKeywordCaseIssues()` vive en `packages/core/src/domain/Gherkin.ts`, sin
E/S, junto al parser cuya tabla de dialectos usa — de modo que reconoce el fallo
en español y portugués igual que en inglés, y **no** marca `Givenchy` ni
palabras dentro de doc strings, comentarios, etiquetas o tablas. Los 11 packs
curados siguen pasando `--strict`: cero falsos positivos.

La advertencia de deriva de nombre no hacía falta escribirla — ya existía. Lo
que cambió es que ahora la ejecuta un parser que ve los títulos.

### Lo que destapó al ejecutarlo

**`pack init` seguía generando `GIVEN / WHEN / THEN`.** `F2` arregló los 27
ficheros ya escritos; nadie miró el fichero que escribe ficheros nuevos, así que
cada pack creado desde entonces nacía con un escenario de ejemplo que Cucumber
veía vacío — y un escenario vacío pasa. El defecto estaba corregido en los packs
y vivo en su generador.

Corregido en `scripts/cli/commands/pack/InitPackCommand.ts`, y con la guarda que
faltaba: un test que ejecuta el CLI real para **los cuatro tipos de proyecto**,
exige que el pack recién generado pase `pack lint` con exit 0, y lee su Gherkin
con el parser de Cucumber para comprobar que cada escenario tiene pasos.
Verificado por mutación: al devolver las mayúsculas, ambos tests fallan.

Es el mismo patrón que `H14` una vez más — arreglar el dato y no la fuente que
lo produce — y la razón de que la guarda apunte al generador y no al resultado.

## F4 · Trazabilidad por etiquetas — **hecho (2026-08-23)**

Hoy la matriz enlaza `SCN-001` con un fichero `.feature`, y **nada comprueba que
ese escenario exista dentro**: `validate` verifica que el fichero esté en la
matriz, no que la matriz apunte a algo real. El texto de ayuda ya lo pide («dale
a la fila un Scenario ID que coincida con un escenario de su feature»), sin
comprobarlo.

Cucumber tiene la forma idiomática de expresar ese enlace, y son las etiquetas:

```gherkin
@REQ-001 @SCN-001
Scenario: Evaluation respects the rollout percentage
```

Qué desbloquea:

1. `validate` comprueba de verdad que `SCN-001` existe en el fichero declarado.
   Hoy no puede.
2. El gate del harness filtra por `--tags "@REQ-001"` en vez de por nombre —
   **robusto a que el agente renombre el escenario**, que hoy convierte el gate
   en verde vacío (§2.2).
3. `expand` y `change archive` pueden emitir las etiquetas solos: nadie las
   escribe a mano.

Es la propuesta que más acerca la matriz y los ficheros, y la que mejor
aprovecha algo que Cucumber ya hace y nosotros ignoramos.

### Lo que se midió primero

La premisa, comprobada antes de escribir nada. Se renombra el escenario que la
matriz declara:

```
matriz:  | REQ-000 | SCN-000 | `features/core/health.feature` | …
fichero: Scenario: Something else entirely

validate --strict-tdd        exit 0
validate --strict-scenarios  exit 0
```

Las dos puertas pasan con la matriz apuntando a algo que no está. El texto de
ayuda llevaba pidiendo un Scenario ID «que coincida con un escenario de su
feature» sin que nada comparara jamás las dos cosas.

### Los tres puntos

1. **`validate` lo comprueba de verdad.** Por etiqueta, no por título: la matriz
   guarda un **id**, no un nombre, así que no hay otra cosa que comparar — y una
   etiqueta sobrevive al renombrado, que es exactamente lo que un agente hace y
   deja la puerta verde y vacía.
2. **El gate filtra por etiqueta… y eso ya funcionaba.** `{req}` y `{scenario}`
   se sustituyen desde antes, así que `--test-cmd "npx cucumber-js --tags
   '@{req}'"` funciona el día que existen las etiquetas. No había que construir
   nada; había que comprobarlo y documentarlo. Y `F5` ya prefería las etiquetas
   al emparejar un escenario con su requisito.
3. **Nadie las escribe a mano.** `expand` las emite, y el andamio de `init` las
   trae, así que un proyecto nuevo tiene la comprobación activa desde el primer
   día.

### La decisión que sostiene la adopción

**Solo se comprueban los ficheros que llevan nuestras etiquetas.** Un repo
traído con `adopt`, o generado antes de esto, no tiene ninguna — fallarle aquí
sería castigarlo por un enlace que nunca se le dio forma de hacer. En cuanto un
fichero está etiquetado, una fila que apunte dentro tiene que ser correcta.

Y `@slow` no es una etiqueta nuestra: tratarla como tal haría que un fichero sin
trazabilidad pareciera tenerla, y la comprobación se quedaría muda justo donde
hace falta.

### Etiquetar es idempotente, y tenía que serlo

`expand` corre más de una vez sobre el mismo proyecto y `change archive`
reescribe features en su sitio. Una etiqueta ya presente se deja, no se
duplica, y las que escribió una persona se conservan. Hay test de la segunda
ejecución.

### Lo que rompió, y por qué está bien

Los fixtures de `C1` copiaban el feature del andamio para fabricar tres
requisitos. Al llevar ahora etiquetas, las copias declaraban ser el escenario de
`REQ-000` mientras su fila decía otra cosa — y la comprobación nueva lo cazó.
Era el test mintiendo, no la herramienta: arreglado reetiquetando las copias.

## F5 · El gate del harness sobre el protocolo de mensajes — **hecho (2026-08-22)**

Cuando el comando de test es Cucumber, ejecutarlo con `--format message` y leer
el NDJSON. El gate deja de preguntar «¿salió 0?» y pasa a comprobar:

- que **existe** un pickle con la etiqueta del requisito bajo prueba;
- que **se ejecutó** (`testCaseStarted`);
- que **tenía pasos** y todos terminaron en `PASSED`;
- cuántos pickles corrieron en total — lo que `filterHint` hoy adivina con una
  expresión regular sobre prosa, aquí es un dato.

Esto cierra los dos agujeros silenciosos de §2.1 y §2.2 y convierte H10 de
heurística en comprobación. Sigue siendo opcional: un proyecto que no use
Cucumber mantiene el gate por código de salida, y el harness sigue siendo
neutral respecto del runner.

**Es la respuesta concreta a «¿es esto moderno para agentes?»**: Cucumber lleva
años publicando un canal legible por máquina y nosotros seguimos leyendo su
salida para humanos con una expresión regular.

### Lo que se midió

El agujero de §2.2, reproducido antes de escribir nada. Comando de test
`cucumber-js --tags '@does-not-exist'`:

```
$ npx cucumber-js --tags '@does-not-exist'
0 scenarios
0 steps
exit 0
```

Y el harness, con ese comando:

```
1 passed · 0 failed · 0 skipped
```

Rama publicada, requisito cerrado, escenario jamás ejecutado. Con el flujo de
mensajes leído, la misma ejecución falla:

```
Gate failed at: cucumber messages
  The test command exited 0, but the run it reported does not support that verdict:
    "API reports service as healthy" exists but never ran, so nothing about
    REQ-000 was verified.
    fix: Check the runner's filter and tags.
```

### Construido contra un flujo real

Las formas de los sobres se sacaron de `npx cucumber-js --format message` sobre
la suite de este propio repositorio (protocolo 33.0.4, cucumber-js 13.2.1), no
de memoria. Un detalle que **solo aparece así**: `testCase.testSteps` incluye
los pasos de *hook*, que no llevan `pickleStepId`. Contarlos como pasos dejaría
que un escenario vacío con un `Before` pasara por cubierto — es decir,
reconstruiría `H14` en un sitio nuevo. Hay test, y quitar el filtro lo rompe.

### Cómo entra, sin adivinar

| Vía | Para quién |
|---|---|
| `message_report:` en `harness.config.yaml` | Cualquier runner y cualquier comando: el proyecto escribe el flujo donde quiera y dice dónde |
| Invocación **directa** de `cucumber-js` | El harness le añade `--format message:<tmp>` él mismo |

La detección es deliberadamente estrecha: `npm test` puede perfectamente
ejecutar Cucumber y desde aquí no hay forma de saberlo, así que no se toca.
Añadirle una bandera sería, en el mejor caso, ignorado.

**Y no falla a quien no le aplica.** Si el flujo no se entiende, la
comprobación devuelve cero hallazgos: la puerta sigue siendo el código de
salida y el harness sigue siendo neutral respecto del runner.

### Lo que queda para F4

El emparejamiento usa **etiquetas primero** (`@REQ-000` / `@SCN-000`) y cae a la
ruta del feature cuando no las hay. Eso lo hace útil ya, antes de `F4`, porque
la fila de la matriz nombra un fichero por requisito — y hará que `F4` funcione
sin tocar este módulo el día que las etiquetas existan.

## F6 · EARS opcional en la línea de requisito

`csda validate --strict-requirements`: comprobar que la frase del requisito
sigue una de las plantillas EARS, además del RFC 2119 que ya se exige. Opcional
y opt-in, por la misma razón que A3: un proyecto adoptado con `adopt` no puede
reescribir sus requisitos de golpe.

---

## 4. Qué cambia de la propuesta anterior

**A3 cambia de forma.** Decía «extraer las reglas de calidad de `lint_pack` a un
módulo compartido y aplicarlas también en `validate`». Sigue siendo correcto,
pero ahora se sabe que **extraer las reglas sobre el parser actual propagaría el
defecto a `validate`**: aplicaríamos a los proyectos un linter que aprueba
escenarios que Cucumber ignora.

Orden correcto: **F2 → F1 → F3 → A3**. Primero que el parser diga la verdad;
después extender su alcance.

**F5 refuerza A1 y A2.** Las tres atacan lo mismo desde ángulos distintos: que el
gate compruebe lo que dice comprobar.

## 5. Reproducción

```bash
npm ci && npm run build

# 1. Los 27 escenarios vacíos de los packs
node -e "
const fs=require('fs'),path=require('path');
const {Parser,AstBuilder,GherkinClassicTokenMatcher}=require('@cucumber/gherkin');
const {IdGenerator}=require('@cucumber/messages');
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){
 const p=path.join(d,e.name); e.isDirectory()?walk(p,a):p.endsWith('.feature.tpl')&&a.push(p);} return a;}
let t=0,z=0;
for(const f of walk('packs')){
 const doc=new Parser(new AstBuilder(IdGenerator.uuid()),new GherkinClassicTokenMatcher()).parse(fs.readFileSync(f,'utf8'));
 for(const c of (doc.feature?.children||[])) if(c.scenario){t++; if(!c.scenario.steps.length)z++;}}
console.log('escenarios',t,'| sin pasos',z);"
# => escenarios 28 | sin pasos 27

# 2. Un escenario vacío pasa
mkdir -p /tmp/cuke/features
cp packs/feature-flags/backend/templates/features/evaluation_respects_rollout_percentage.feature.tpl \
   /tmp/cuke/features/x.feature
(cd /tmp/cuke && npx cucumber-js --format summary)
# => 1 scenario (1 passed) · 0 steps · exit 0

# 3. Y el linter lo aprueba en modo estricto
csda pack lint --pack-root ./packs --pack feature-flags/backend --strict
# => passed all lint checks · exit 0

# 4. Un filtro que no casa nada también sale 0
(cd /tmp/cuke && npx cucumber-js --tags "@NO-EXISTE")
# => 0 scenarios · exit 0
```

## 6. Fuentes

- Tabla de dialectos y palabras clave: `@cucumber/gherkin` 42 instalado
  (`node_modules/@cucumber/gherkin/dist/gherkin-languages.json`), 80 dialectos
- [Referencia de Gherkin — cucumber.io](https://cucumber.io/docs/gherkin/reference/)
- [`Rule`, añadida en Gherkin 6 (2018) — cucumber.io](https://cucumber.io/blog/bdd/gherkin-rules/)
- [CHANGELOG de cucumber-js](https://github.com/cucumber/cucumber-js/blob/main/CHANGELOG.md) — 13.0.0 (2026-06-02), sharding en 12.2.0, plugins en 12.5.0
- Versiones publicadas consultadas con `npm view` el 2026-08-22
