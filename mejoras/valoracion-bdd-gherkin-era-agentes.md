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
| **F3** | Paridad con Cucumber en `pack lint` y `validate`                   | Bajo  | Alta          |
| **F4** | Trazabilidad por etiquetas `@REQ-NNN` / `@SCN-NNN`                 | Medio | Media         |
| **F5** | El gate del harness sobre el protocolo de mensajes                 | Medio | Alta          |
| **F6** | EARS opcional en la línea de requisito                             | Bajo  | Baja          |

## F2 · Arreglar los 27 ficheros y blindar la regresión — primero

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

## F1 · Un solo parser, con la tabla oficial de dialectos

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

## F3 · Paridad con Cucumber en el linter

Con F1 en su sitio, dos reglas nuevas, **error siempre, no advertencia**:

- `scenario_has_no_steps` — Cucumber vería este escenario vacío. No es cuestión
  de estilo: es un test que no prueba nada y pasa.
- `keyword_case_invalid` — `GIVEN`, `SCENARIO`, `Feature :`… con el `fix`
  literal. Cucumber los descarta en silencio; nosotros los nombramos.

Y una **advertencia** de deriva: escenario declarado en `pack.yaml` que no
aparece en su plantilla con ese título — la regla de deriva de nombre ya existe,
pero hoy la ejecuta un parser que no ve la mitad de los títulos posibles.

## F4 · Trazabilidad por etiquetas

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

## F5 · El gate del harness sobre el protocolo de mensajes

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
