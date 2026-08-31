# 🪞 Lixi — el caso bluefield, y una adopción que se murió sola

> **Escrito el 2026-08-18** contra `create-spec-driven-app` v0.6.0.
> **Repo evaluado:** `https://github.com/rsaglobaltech/lixi-platform`, clon local en
> `~/sandbox/projects/mvps/lixi-platform`, HEAD `55fa632`, rama
> `claude/nextjs-spring-webflux-migration-c7Bd8`, 110 commits, **árbol sucio**.
> **Todo lo que sigue está medido ejecutando comandos sobre el clon.**
> Solo lectura: no se tocó nada del repo.

---

## Corrección de premisa (misma sesión)

La primera versión de este documento trataba el repo como **bluefield con dos
mitades vivas**. No lo es: **el TypeScript de la raíz es código muerto**. Lo que
importa, y lo único que seguirá existiendo, es `lixy-api/`.

Eso no ablanda los hallazgos — los agrava, y cambia la categoría:

> Lixi no es bluefield. Es **greenfield con contrato**: una implementación nueva
> cuyos criterios de aceptación vienen de un sistema difunto. El TS no es un
> codebase que especificar; es la **fuente de la especificación**. Los 12 fixtures
> dorados son la spec que el equipo ya extrajo a mano.

Y con esa lectura, lo que hace nuestra herramienta hoy es exactamente lo
contrario de lo que hace falta: **describe el cadáver e ignora al vivo** (H16,
H17, abajo).

---

## Veredicto

Este repo no es un candidato a piloto. Es **la prueba**, ya ocurrida, de las dos
cosas que veníamos suponiendo:

1. **`csda adopt` ya se ejecutó aquí, y la adopción se murió en el esqueleto.**
   Nadie retro-rellenó un solo requisito, y nada de ello llegó a git.
2. **Es un bluefield de manual** — API legacy en Next.js congelada, API nueva en
   Spring WebFlux, misma base de datos, corte único — y **el equipo inventó a
   mano la misma puerta que §12.14 propone**: fixtures dorados congelados desde
   la implementación vieja.

Lakebase demuestra que la inferencia *se puede medir*. Lixi demuestra que **hace
falta**, y de paso enseña cómo debe ser la puerta.

---

## Qué es, medido

Marketplace de reservas de belleza (Uruguay, es-UY, UYU; roles cliente y
profesional; seña del 30 % con escrow liberado 48 h post-servicio).

```
raíz — Next.js 15 + TypeScript, hexagonal de verdad
  domain/         7 contextos: booking, business, identity,
                  notifications, review, subscription, wallet
  application/    casos de uso
  infrastructure/ TypeORM, Supabase, pagos, geocoding, storage
  app/api/**      74 route handlers          ← API LEGACY, en feature-freeze
  tests/          32 ficheros · 171 casos (Vitest)

lixy-api/ — Java 21 · Spring Boot 3 · WebFlux · R2DBC · Gradle 4 módulos
  domain 101 · infrastructure 84 · application 57 · bootstrap 57  = 299 .java
  37 ficheros de test · 126 @Test
  12 fixtures dorados de paridad            ← LA API NUEVA

apps/mobile_flutter/ — 90 .dart · 13 ficheros de test (migrada desde React Native)
```

Tres stacks, dos backends vivos a la vez contra **la misma base Postgres**, y
27 documentos de planificación en la raíz.

---

## 1. La adopción se murió en el esqueleto

`spec.md` empieza literalmente así:

> *«Adopted into Spec-Driven Development on an existing codebase (brownfield).
> Existing behaviour is retro-filled requirement by requirement.»*

Y esto es todo lo que hay, meses después:

```
spec.md                    1 requisito: REQ-001 «Existing behaviour is preserved»
features/                  1 fichero:   adoption/baseline.feature
docs/specs/traceability.md 1 fila, estado Draft
```

**Y nada de eso está en git.** `spec.md`, `AI_RULES.md`, `features/` y `docs/`
salen como `??` en `git status`. La adopción no solo no avanzó: **nunca se
comiteó**, así que para el repositorio no ha ocurrido.

Mientras tanto el repo tiene **297 casos de test** (171 TS + 126 Java) y 12
contratos JSON congelados. La matriz describe **cero** de ellos.

> Esto es el argumento de P5 en su forma más cruda: `adopt` funciona —el
> esqueleto está bien puesto y `validate` pasa— y aun así la adopción no arranca,
> porque el paso siguiente es «siéntate a escribir requisitos a mano» y eso no
> sucede. **No es un fallo de disciplina del equipo. Es el producto pidiendo
> trabajo que puede automatizar.**

### Defecto que sale de aquí: la puerta dice ✅ sobre la nada (H15)

```
$ csda validate .
✅ Validation passed
   - Features detected: 1
   - Base SDD structure: complete
   - Traceability mode: rich
```

Verde. Con un requisito de relleno que no describe ni una línea de las 297
pruebas del repo. `status` sí es honesto (`1 total · 1 pending`), pero **el
comando que la gente pone en CI es `validate`**, y ahí no hay diferencia
observable entre *«adoptado y especificado»* y *«adoptado y abandonado»*.

Arreglo barato: `validate` conoce el `baseline.feature` que él mismo escribe. Si
la única feature del proyecto es esa, debe emitir un aviso — «adopción sin
requisitos propios» — no un verde limpio.

---

## 2. Bluefield real, y el equipo ya construyó la puerta

`AGENTS.md` lo dice sin ambigüedad: *«This repository contains **two independent
projects** with **different rules**»*. API vieja en la raíz, API nueva en
`lixy-api/`, misma base, corte único (`CUTOVER.md`), TS en feature-freeze.

Y en `lixy-api/bootstrap/src/test/java/com/lixy/api/parity/ContractParityTest.java`:

> *«the JSON the Spring DTOs serialize to must have the exact key set the Next.js
> API returns. The expected keys are frozen as golden fixtures under
> `resources/parity/` (captured from the TS handlers — the source of truth during
> the migration).»*

Doce ficheros: `appointment.keys.json`, `wallet.keys.json`,
`business-search.keys.json`, `payment-intent.keys.json`… Cada uno es el conjunto
exacto de claves que devuelve la implementación vieja.

**Eso es exactamente la puerta de caracterización de §12.14**, construida a mano
por un equipo que no sabía que la estábamos diseñando. Y la escalonaron mejor que
nosotros:

| Nivel | Qué comprueba | Coste |
|---|---|---|
| 1 | **Forma** del JSON (nombres de campo) contra el fixture dorado | Hermético, rápido, en CI ya |
| 2 | **Valores** byte a byte contra la API TS viva (tráfico sombra) | Necesita ambos backends arriba |

Lección de producto: **la puerta de caracterización tiene dos niveles, no uno.**
El nivel 1 es hermético y da el 80 %. Nuestro diseño solo contemplaba el nivel 2
(«ejecutar el escenario contra el código intacto»), que es el caro.

### Y esos 12 contratos son requisitos que la matriz no ve

«El payload de una cita tiene exactamente estas 20 claves» es un requisito. Está
congelado, versionado y verificado en CI. **No aparece en `spec.md`.** Es el
hueco P5 con nombre, ruta y número de fichero.

---

## 3. Lo que el CLI ve, y lo que no

### `onboard` sobre TypeScript: acierta

```
stack: Node.js, TypeScript, react, next   ✔ de package.json
Booking(15) · Business(14) · Subscription(7) · Wallet(4) ·
Identity(3) · Review(3) · Notifications(1)
```

Siete contextos acotados reales, con recuentos correctos. **Contraste directo con
Lakebase**, donde el mismo comando reportó `Platform 1 fichero` habiendo 38 (H14):
la heurística es sólida en layouts JS/TS y ciega en Maven/Gradle.

### Pero solo ve la mitad vieja del repo

`DOMAIN_ROOTS` devuelve la **primera** raíz que existe con ≥2 hijos. Aquí es
`domain/`, la del backend legacy. Así que `onboard`:

- **ignora `lixy-api/`** — 299 ficheros Java, el backend que se está construyendo;
- **ignora `apps/mobile_flutter/`** — 90 ficheros Dart.

Y el `Next` que propone es `csda change new describe-booking`: describir el
sistema **que está siendo retirado**.

> **Corrige una predicción de §12.13.** Ahí escribí que en un bluefield `onboard`
> propondría capacidades **duplicadas** (`billing/` y `billing-v2/`). Medido, hace
> algo peor: **elige una mitad en silencio**, y —sabiendo ahora que el TS está
> muerto— elige **la mitad que no existirá**. Un duplicado se ve; una omisión no.

### Y desde dentro de `lixy-api/` es peor todavía

```
$ cd lixy-api && csda onboard
  🧭 onboarding  /Users/…/lixi-platform          ← el PADRE, no lixy-api
     stack: Node.js, TypeScript, react, next     ← el stack muerto
     ✔ already adopted — spec.md is here         ← falso para lixy-api
     Booking · Business · Subscription …         ← contextos del código muerto
```

**H16.** `onboard` usa `resolveProjectDir`, que sube por el árbol buscando
`spec.md`. Desde un subproyecto no adoptado se escapa al ancestro adoptado y
analiza **otro proyecto** sin decirlo. En el mismo directorio, `csda adopt`
**sí** acierta (`Java, Spring Boot, Gradle`, de `build.gradle.kts`): dos comandos
en la misma carpeta discrepan sobre en qué proyecto estás.

**H17.** Y apuntando explícitamente:

```
$ csda onboard --project-dir lixy-api
     stack: Java, Spring Boot, Gradle            ✔
     Nothing obvious from the layout.            ← 299 ficheros, hexagonal puro
```

**Cero capacidades sobre un proyecto hexagonal con `domain/` en la raíz.** Causa
exacta: `descendThroughWrappers` solo desciende cuando hay **un** hijo, y
`lixy-api/domain` tiene dos —`src` y el `build/` de Gradle—, así que para en seco;
y aunque bajara, `src` tiene `main` y `test`. Los tres nombres están en
`NOT_DOMAIN`, y el filtro final deja la lista vacía. **Un directorio de salida de
compilación basta para cegar el comando.**

Arreglo, verificado ejecutando la variante parcheada sobre este repo — (a) saltar
el envoltorio `src/main/{java,kotlin}` cuando existe y (b) ignorar salidas de
build (`build`, `target`, `dist`, `out`) al decidir «hijo único»:

| Módulo | Capacidades que aparecen |
|---|---|
| `domain` | booking, business, favorites, identity, notifications, review, subscription, wallet (+ error, event, shared, a descartar) |
| `application` | booking, business, identity, notifications, review, subscription, wallet |
| `infrastructure` | events, geocoding, http, payment, persistence, storage, notifications |
| `bootstrap` | controller, cron, error, ratelimit, security, web, webhook |

De **cero** a **ocho contextos de dominio correctos**, con dos condiciones en una
función. Y esos 8 son los 7 del TS más `favorites`: **el port Java es fiel**, lo
que confirma que el TS sirve como fuente de spec y no como sistema a describir.

### Las reglas de agente chocan

| Fichero | Origen | Contenido |
|---|---|---|
| `AGENTS.md` (46 líneas) | del equipo, versionado | Reglas **por ruta**: unas para la raíz TS, otras para `lixy-api/`. Explica la migración |
| `CLAUDE.md` (1 línea) | del equipo | `@AGENTS.md` |
| `AI_RULES.md` (27 líneas) | **nuestro `adopt`**, sin comitear | Genérico, raíz, huérfano — nada lo referencia |

`csda agents init` sí escribe `AGENTS.md`, pero `adopt` escribe `AI_RULES.md` sin
mirar si el repo ya tiene una convención de reglas. Resultado: un tercer fichero
de reglas que nadie lee, junto a dos que sí se leen.

Peor de fondo: **nuestras reglas son de raíz; las suyas son por ruta**. En un
repo con dos backends bajo reglas opuestas —«nunca bloquees el event loop» vale
para `lixy-api/` y no significa nada en la raíz— un `AI_RULES.md` único no puede
ser correcto. → **P7**

---

## 4. Qué se lleva el producto de aquí

| # | Aprendizaje | Dónde va |
|---|---|---|
| 1 | La adopción muere en el esqueleto si el retro-relleno es manual | Evidencia de **P5** |
| 2 | La puerta de caracterización tiene **dos niveles**: forma (hermético) y valores (tráfico sombra) | Diseño de **P5**, etapa 4 |
| 3 | Los contratos congelados de una migración **son** requisitos y la matriz no los ve | **P5** |
| 4 | `onboard` **omite en silencio** la mitad nueva, y desde el subproyecto se escapa al padre (**H16**) | Corrige **P3** |
| 4b | Un `build/` de Gradle deja `onboard` en **cero capacidades** sobre un hexagonal de 299 ficheros (**H17**) | Defecto, arreglo verificado |
| 5 | `validate` da verde sobre una adopción abandonada | Defecto **H15** |
| 6 | `adopt` ignora `AGENTS.md`/`CLAUDE.md` y las reglas no pueden ser por ruta | **P7** |

---

## 5. Si se convirtiera en piloto

Con el TS muerto, el orden es otro y es más simple. **El proyecto es `lixy-api/`,
no la raíz.**

1. **Arreglar H16 y H17 primero.** Sin eso, la herramienta no puede ni nombrar lo
   que hay que especificar. Son las dos condiciones de una función.
2. **`csda adopt` dentro de `lixy-api/`.** Ya detecta bien el stack. La adopción
   de la raíz que hay hoy sin comitear se descarta: describe código muerto.
3. **Los 12 fixtures de paridad → 12 requisitos.** Están verificados en CI contra
   el código Java: es `csda req link` sin escribir un test nuevo. De 0 a 12 filas
   verdaderas en una tarde.
4. **El TS como fuente, no como objetivo.** Los 74 route handlers y sus 171 tests
   son de dónde se extraen los requisitos que aún no tienen fixture — el caso de
   uso más limpio de P5 que hemos visto: hay un oráculo ejecutable del
   comportamiento esperado, y un destino distinto donde verificarlo.

Que es, además, el mejor argumento para P5: **aquí la inferencia no adivina.
Traduce.**

---

## Regla de actualización

Como el resto de documentos vivos de `mejoras/`: al cerrar un paso se marca aquí
en la misma sesión, con el commit que lo cierra. Y este fichero **se comitea**.
