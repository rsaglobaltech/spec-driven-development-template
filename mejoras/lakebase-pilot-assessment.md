# 🌊 Lakebase — valoración como piloto de inferencia brownfield

> **Escrito el 2026-08-18** contra `create-spec-driven-app` v0.6.0.
> **Repo evaluado:** `https://github.com/rsaglobaltech/lakebase-platform`, commit
> `6736055` («feat: real CDC with embedded Debezium»).
> **Todo lo que sigue está medido ejecutando comandos sobre el clon**, no leído
> de su documentación. Donde cito su documentación lo digo.

---

## Veredicto

**Es mejor caso de prueba que HIE para lo que queremos probar** (inferir specs
desde código existente), y ya destapó un defecto real del CLI sin escribir una
sola línea de spec. No sustituye a HIE: prueban cosas distintas.

| | HIE | Lakebase |
|---|---|---|
| Orden de llegada | Pack escrito primero, código después | **Código primero, sin specs** |
| Qué prueba | ¿Sirve un pack de dominio regulado sobre código ajeno? | **¿Se pueden inferir specs de código complejo?** |
| Verdad de referencia | 16 requisitos escritos a mano | Auditoría propia con IDs + inventario medido por módulo |

---

## Qué es, medido

Plataforma de datos unificada (Data Lake · Lakehouse · Lakebase OLTP) sobre
Iceberg, Trino, Temporal, Keycloak, MinIO y Postgres.

```
Java 21 · Spring Boot · Gradle multi-módulo
  services/platform    38 ficheros java   (Spring Modulith)
  services/catalog     16                 (Iceberg REST Catalog + gobierno)
  services/engine      16                 (medallion, mantenimiento, sync)
  services/ingestion    8                 (conectores + escritores)
  libs/common                             (compartida)
  services/sql-engine                     (solo configuración de Trino)
Python
  sdk/python           ~1.350 líneas · 11 módulos
  cli                    ~880 líneas ·  5 módulos
frontend               maqueta estática, 0 llamadas a API

87 ficheros java de producción · 16 de test · 104 @Test
41 tests de Python
CI: 3 jobs — gradle test · uv (sdk+cli) · Trivy
```

Su documentación es **inusualmente honesta**: `docs/PENDIENTE.md` es un
inventario de lo no construido con recuentos de ficheros («se mide, no se
supone»), y `docs/ANALISIS_Y_MEJORAS.md` es una auditoría con hallazgos
identificados (`P0-*`, `S-*`, `D-*`, `T-*`) y su estado. Eso importa mucho para
lo que viene.

---

## Por qué es el mejor espécimen que tenemos

**1. Sus nombres de test ya son enunciados de requisito.** No parafraseo:

```
selectExigeSelect            herenciaNoAsciende
autenticadoSinConcesionesDenegado     tablaNuevaNoAccesible
crearEsquemaExigeCreateSchema         selectImplicaTransito
detectaManipulacion                   capturaElCicloCompleto
unValorNoNumericoBastaParaTexto       vaciosSonNulos
```

Eso es exactamente la **etapa 2 determinista** del diseño de inferencia
(cosechar nombres de test), y aquí llega servida: nombres de dominio, en
lenguaje de negocio, sin `testShouldReturnTrue`. Un cosechador sin LLM saca
valor real de este repo el primer día.

**2. Tiene verdad de referencia parcial, escrita por humanos y antes que
nosotros.** `PENDIENTE.md` mide capacidad por capacidad; `ANALISIS_Y_MEJORAS.md`
lista hallazgos con ID. Se puede medir si la inferencia **redescubre** lo que un
humano ya midió, en vez de opinar sobre si lo inferido «suena bien».

**3. Es complejo de verdad y no lo escribimos nosotros.** Cuatro desplegables,
dos lenguajes, Modulith con fronteras verificadas (`ModularityTests`),
Testcontainers, CDC con Debezium embebido. Nada de esto se puede simular en un
proyecto de demo.

---

## Lo que pasó al ejecutar el CLI (2026-08-18)

### `csda onboard` — acierta el stack, falla el tamaño

```
stack:  Java, Spring Boot, Gradle      ✔ detectado de build.gradle
tests:  ./gradlew test                 ✔
capacidades: Catalog(2) · Ingestion(2) · Engine(1) · Platform(1)
```

**Los recuentos son basura en cualquier layout Java** — defecto **H14**, anotado
en el plan §12.11. `countFiles` (`scripts/onboard.ts`) poda los directorios de
`NOT_DOMAIN`, que incluye `src`, `main` y `java`, así que en un proyecto Maven o
Gradle no llega nunca al código. Reales frente a reportados:

| Módulo | Reportado | Real (.java de producción) | Toques en git |
|---|---:|---:|---:|
| Platform | 1 | **38** | 63 |
| Catalog | 2 | 16 | 40 |
| Engine | 1 | 16 | 35 |
| Ingestion | 2 | 8 | 24 |

Como la lista **se ordena por ese recuento**, el orden sale casi invertido: el
módulo mayor y el más tocado aparece el último. En un repo Node la heurística
funciona; en Java miente con confianza, que es el peor modo de fallar.

### Las capacidades propuestas son desplegables, no capacidades

`onboard` para en `services/*` porque `services` está en `DOMAIN_ROOTS` y ese
nivel ya tiene ≥2 hijos. Las capacidades de dominio están **un nivel más abajo**,
y el propio repo las tiene medidas:

```
catalog/governance      14      platform/lakebase        22
engine/medallion         7      platform/orchestration   10
engine/sync              5      ingestion/connector       3
engine/maintenance       2      platform/auth             1  (vacío)
```

No es un fallo de la heurística —el equipo *sí* llamó a eso `services`— sino el
límite de inferir del layout: **un desplegable no es una capacidad**. Es
justamente el hueco que un pase de agente debe rellenar, y aquí se ve cuánto
vale: pasar de 4 nombres genéricos a 8 capacidades con recuento y evidencia.

### `csda adopt --dry-run` — limpio

5 ficheros, 0 colisiones (`spec.md`, `AI_RULES.md`,
`features/adoption/baseline.feature`, `docs/specs/traceability.md`,
`docs/specs/adr/README.md`). El repo ya tiene `docs/`, y no hay choque. **L1 es
viable hoy mismo, sin tocar código.**

---

## Lo que este repo rompe y HIE no

| # | Fricción | Detalle |
|---|---|---|
| L1 | **Políglota bajo una sola puerta** | `adopt` deja un único `TEST_CMD` = `./gradlew test`, que no ejecuta **ni uno** de los 41 tests de Python. La puerta nacería ciega al SDK y a la CLI, que es un 28 % de los tests del repo |
| L2 | **Monorepo, y `adopt` no lo sabe** | El modo monorepo de `validate` (B8) existe, pero exige un `specops.config.yaml` con `projects:` escrito a mano y un `adopt` por módulo. No hay `adopt --monorepo` que lo genere → **P6** |
| L3 | **Requisitos transversales sin sitio** | Los dos riesgos rojos de su `PENDIENTE.md` —endpoint OPA sin autenticar, TLS solo en Trino— no pertenecen a ningún módulo. En modo monorepo cada proyecto valida solo: no existe el requisito de raíz. Es **P1 dentro de un mismo repo**, y confirma que P1 no es solo multi-repo |
| L4 | **Sin cobertura instrumentada** | `build.gradle` trae spotless, no JaCoCo. La métrica «% de código especificado» exigiría añadirlo antes de poder medir nada |
| L5 | **La puerta necesita Docker** | `CatalogIntegrationTest` usa Testcontainers y `make up` pide ~8 GB. Un gate de caracterización sobre esos tests no corre en cualquier máquina ni en cualquier runner |

---

## Cómo lo pilotaría, en orden

1. **L1 sobre `services/catalog`, no sobre la raíz.** Dominio acotado, 16
   ficheros, 14 de ellos en `governance`, y tests unitarios puros. Evita L1, L2 y
   L5 de golpe.
2. **Cosecha determinista de nombres de test → requisitos candidatos.** Métrica
   honesta: de los ~104 `@Test`, cuántos producen un enunciado utilizable **sin
   LLM**. Ese número decide si la etapa 2 justifica existir sola.
3. **Pase de agente sobre `catalog/governance`** con la puerta de
   caracterización: el escenario generado debe pasar contra el código intacto.
4. **Contraste contra `PENDIENTE.md` y `ANALISIS_Y_MEJORAS.md`.** Precisión y
   recall frente a lo que un humano ya escribió del mismo código.

---

## Riesgos propios de este piloto

- **Es un repo vivo y ajeno.** Fijar el commit `6736055` en cada medida, o los
  números no se podrán repetir.
- **Idioma mezclado.** Tests y documentación en castellano, código e
  identificadores en inglés. Sin fijar el idioma en `AI_RULES.md`, el agente
  emitirá Gherkin mestizo.
- **Módulos vacíos con frontera declarada.** `auth`, `compute`, `notebook` y
  `observability` son un `package-info` cada uno. Un inferidor ingenuo propondrá
  cuatro capacidades que no existen: son fronteras del Modulith, no
  comportamiento. Buen caso negativo para la puerta — **no debe pasar nada de
  ahí**.
- **Repo fuera de este árbol.** Igual que HIE: si el piloto arranca, el clon vive
  en `~/sandbox/projects/`, nunca dentro de este repositorio.

---

## Regla de actualización

Como el resto de documentos vivos de `mejoras/`: al cerrar un paso se marca aquí
en la misma sesión, con el commit que lo cierra. Y este fichero **se comitea**.
