# Plan de Implementación – Integración de Grafos (Neo4j)

## Visión General

Incorporar **Neo4j como ciudadano de primera clase** del core de Toketeo: conexión, ejecución de Cypher, introspección del grafo, editor con lenguaje nativo, Graph Explorer, soporte en el Assistant y gamificación coherente — sin acoplar el resto del sistema a un modelo de datos grafos.

> Principio rector (decisión de revisión): _Neo4j primero se convierte en un ciudadano de primera clase del core; después se construyen encima las capacidades específicas de grafos._

---

## Estado Actual (base sobre la que se construye)

Este plan **extiende** lo construido; no reinventa infraestructura existente.

| Área | Path / símbolo | Estado |
|------|----------------|--------|
| Trait `DbDriver` (fetch_*, execute, begin_script…) | `src-tauri/src/db/mod.rs:93-190` | ✅ existe; mecanismo default-Err para capacidades opcionales (`fetch_mongo_structure`, `begin_script`) |
| `DbType` enum (7 motores) | `src-tauri/src/db/mod.rs:8-18` | ✅ falta `Neo4j` |
| Sesiones/módulo de conexión | `AppState` + `ConnectionSession` (`state.rs:58-72`, `application/session_service.rs:104-116`) | ✅ reutilizable tal cual |
| Cifrado de credenciales (AES-256-GCM + master key) | `infrastructure/crypto.rs`, `ConnectionService` (`connection_service.rs:28-115`) | ✅ los secrets nunca viajan al webview (`mask_secrets`) |
| Túnel SSH | `ssh/mod.rs` (`SshTunnel::open`, `:183-349`) + `ConnectionService::connect` (`connection_service.rs:377-402`) | ✅ el driver conecta a `127.0.0.1:0`; **Neo4j lo hereda sin tocar nada** |
| Auditoría de operaciones | `application/audit_service.rs` (`AuditEntry`, `log_query`) → tabla `audit_logs` | ✅ solo falta invocarlo desde el path de ejecución Cypher |
| Caché de metadatos por sesión | `MetadataCache` (`application/session_service.rs:40-102`, TTL, 500 claves) | ✅ reutilizable |
| Caché de esquema para Assistant | `SchemaEngine` (`application/assistant/context/schema_engine.rs`, TTL 300s) | ✅ necesita rama graph |
| Assistant (adapters IA, ContextBuilder, PromptBuilder, SqlFixer) | `application/assistant/` | ✅ se extiende, no se rehace |
| Frontend `DatabaseType` (7 valores) | `frontend/src/types/database.ts:38-46` | ✅ falta `neo4j` |
| `QueryResult` (columns/rows/executionTime) | `frontend/src/types/database.ts:74-85` + `models/mod.rs:177-191` | ✅ se extiende con `graph?` opcional |
| Editor **CodeMirror 6** (no Monaco) | `@uiw/react-codemirror`, `SqlCodeEditor.tsx:34-48` | ✅ lenguaje custom Mongo como patrón (`lib/editor/mongoShellLanguage.ts`) |
| Completions schema-driven | `frontend/src/lib/editor/completions.ts` | ✅ patrón para Cypher |
| Graph UI: **React Flow 12** (`@xyflow/react`) | `frontend/src/components/diagram/` | ✅ reutilizar, no traer otra lib |
| Gamificación (100 % frontend, call-sites) | `frontend/src/lib/gamification/{config,missions,unlocks}.ts` + `store/gamificationStore.ts` | ✅ se extiende por call-site, no se inventa capa de eventos |
| Tests backend (unit, mock driver) | `src-tauri/src/db/mock.rs` (`#[cfg(test)]`) | ✅ falto estrategia de integración Neo4j |

**No existe todavía:** driver Neo4j, `GraphResult`, metadata service de grafo, lenguaje Cypher en el editor, Graph Explorer, contexto graph en el LLM, fixer de Cypher.

---

## Decisiones Técnicas (obligatorias antes de la Fase 1)

### D1. Crate de driver: `neo4rs` 0.9.x-rc (con retro)

- Estado del ecosistema (jun 2026): **no hay driver oficial Rust** (neo4j#13015 sigue abierto); las opciones son `neo4rs` (neo4j-labs, MIT, ~893k descargas, async/tokio, mantenido al día con Bolt 4.x→5.x) y `neo4j` (robsdedude — hobby, **sin soporte async**: descartado).
- **Decisión:** `neo4rs` — con `0.9.0-rc` para Neo4j 5.x (bolt 4.0–4.3 y element IDs vía feature `unstable-bolt-protocol-impl-v2`); si el RC no estabiliza, fijar `0.8.x` y **limitar soporte de Neo4j 5** con warning.
- **Regla de capa:** todo el contacto con `neo4rs` queda aislado en `db/neo4j/driver.rs` — el resto del backend solo conoce DTOs propios.

### D2. IDs de nodo: `elementId(n)` sobre `id(n)`

- Neo4j 5 deprecó los IDs numéricos; para expand/refresh/inspector se debe usar `elementId()`. Si el driver elegido no lo expone (0.8), emitir warning de degradación en Neo4j 5 y migrar en cuanto se estabilice 0.9.
- En Cypher generado dinámicamente: los IDs **siempre por parámetro** (`WHERE elementId(n) = $id`), y las **labels no son parametrizables** → validar/sanear idententes con regex `^[A-Za-z_][A-Za-z0-9_]*$` y escapar con backticks cuando haya caracteres especiales.

---

## Arquitectura General

```
src-tauri/src/
├── db/
│   ├── mod.rs              # DbType::Neo4j + trait GraphDriver (aditivo)
│   ├── neo4j/
│   │   ├── driver.rs       # envuelve neo4rs (único punto de contacto)
│   │   ├── connection.rs    # sesión/pool/auth (reusa ConnectionService y túnel)
│   │   ├── metadata.rs      # db.labels(), db.relationshipTypes(), db.propertyKeys(), SHOW …
│   │   ├── query.rs         # execute_cypher (params, paginate, cancel)
│   │   └── result.rs        # ValueReceive → GraphNode/GraphRelationship (neutrales)
│   ├── mongodb.rs …         # sin cambio
│   └── …
├── application/
│   ├── query/
│   │   └── cypher/          # CypherQueryService (validate / execute / explain / profile / cancel)
│   ├── graph/               # Neo4jMetadataService (introspección acotada)
│   └── assistant/           # rama graph de ContextBuilder / PromptBuilder
├── infrastructure/          # intacto (SSH tunnel + audit + crypto reusados)
└── models/                  # + GraphResult, GraphNode, GraphRelationship, GraphMetadata

frontend/src/
├── lib/editor/cypherLanguage.ts        # lenguaje CodeMirror (patrón MongoShell)
├── lib/editor/completions.ts           # + CypherCompletions (labels/rels/props del schema)
├── services/neo4j.service.ts           # IPC ejecución + metadata
├── components/explorer/graph/          # GraphExplorer (React Flow 12)
├── components/query/results/          # tabla normal + vista GraphResult cuando trae `graph`
└── lib/gamification/config.ts          # rama complejidad Cypher + XP call-sites
```

---

## Fases de Implementación

### Fase 0 — Contratos aditivos (sin refactor) ✅ **Completada** (commits `51abd64` backend, `57a460f` frontend)

**Nada de reestructurar `db/`.** Los drivers actuales (postgres, mysql, sqlite, sqlserver, mongodb, redis) no se mueven ni se tocan.

1. `DbType::Neo4j` en `src-tauri/src/db/mod.rs` (enum + factoría `DriverFactory::create` + builders).
2. Nuevo trait `GraphDriver` (separado de `DbDriver`) — implementado solo por `Neo4jDriver`:
   ```
   node_labels(), relationship_types(), graph_metadata(), execute_cypher(...)
   ```
   Regla: el core **no** asume que toda BD es relacional, pero tampoco obliga a motores relacionales a exponer capacidades de grafo en el trait base.
3. DTOs neutrales en `models/`: `GraphResult { nodes, relationships, paths }`, `GraphNode { id (elementId), labels[], properties }`, `GraphRelationship { id, type, source, target, properties }`, `GraphMetadata`.
4. Frontend: `DatabaseType.NEO4J` (`frontend/src/types/database.ts`, misma lista que la nº7) + formulario de conexión (host, puerto 7687, user, password, database name — default `neo4j`), con URLs `bolt://`, `bolt+s://`, `bolt+ssc://` si se desea (o delegar siempre al túnel local — el driver nunca debe saber que existe SSSH).
   - El flujo de guardado: columnas genéricas existentes + `options` extra si hace falta (database name).

**Aceptación:** `cargo build` + `cargo test --lib` verdes sin cambios en drivers existentes; `DatabaseType` en ambos lados con `neo4j`.

---

### Fase 1 — `Neo4jDriver` y conectividad ✅ **Completada** (commits `3b7d32c` driver, `1378749` test Docker)

Contrato de responsabilidades (decisiones D1/D2):

- Conexión Bolt con `neo4rs` (auth basic, sesión con database default), pooling si el crate lo permite; `connection_timeout`, `connection_acquisition_timeout`, TTL.
- `verify_connectivity` / ping; error tipado (`Neo4jError`) conectado al `AppError`.
- Parámetros tipados; **siempre** parametrizar valores de usuario en Cypher generado internamente.
- Cancelación: cancel token/cierre de sesión del driver — definir en el PR de esta fase (si `neo4rs` no lo expone, dar prioridad a bloquear el run completo en el runner).
- Túnel: hereda `ConnectionService::connect` (al abrirse, obligado a `127.0.0.1:7687`).
- Auditoría: invocar `AuditService::log_query` en cada ejecución (no loguear secretos; nunca queries de sistema/huevos).
- Testing: unit tests con `neo4rs` mock; **integration test con testcontainers** (imagen `neo4j` Community) en CI — el repo ya permite Docker para testing.

**Aceptación:** conectar/desconectar/ping contra contenedor Neo4j; `cront de ejecutar Cypher simple; cipher params; el driver no conoce SSH.

---

### Fase 2 — Modelo de resultados de grafo (neutral) ✅ **Completada** (commits `39101c6` backend, `a9abc9b` frontend)

- Normalización en `result.rs`: `ValueReceive::{Node, Relationship, Path, List, Map, Scalar}` → `GraphResult` (con topología de la query `RETURN`).
- `QueryResult` se extiende con `graph?: GraphResult` (campo opcional — frontend `types/database.ts` y backend `models/mod.rs`), No acoplar el frontend a las estructuras de `neo4rs`.
- Decisión D2 (elementId) fijada aquí: el `GraphNode.id` usado en UI y en Cypher generado.
- `JsonResultsView` y `ResultsPanelTable` siguen funcionando para respuestas tabulares; el `graph` visible solo cuando venga.

**Aceptación:** SELECT → tabla normal sin cambios; `MATCH … RETURN n, r` → `QueryResult.graph` poblado; unit tests de `result.rs`.

---

### Fase 3+4 — Introspección y esquema

`Neo4jMetadataService` (en `application/graph/`):

- Usa **catálogos nativos** — nunca recorrer el grafo: `CALL db.labels()`, `CALL db.relationshipTypes()`, `CALL db.propertyKeys()`, `SHOW INDEXES`, `SHOW CONSTRAINTS` (5.x) / `db.constraints()`; counts con `call db.stats.retrieve('graph counts')` si está disponible.
- Resultado: `GraphMetadata` (DTO propio de Neo4j — **no** modelo `DatabaseSchema` unificado; doctrina del repo: preservar metadata nativa, no normalizize).
- Cache: usar `MetadataCache` existente (`session_service.rs`) con kind nuevo; y para el Assistant, el `SchemaEngine` existente (TTL 300s) con un `GraphSchemaContext`.
- `clear_metadata_cache` inválida también graph; comando `refresh` para el explore.

**Aceptación:** explorer de esquema de grafo (labels / rel types / property keys / indexes / constraints) con ≤6 queries nativas; caché funciona.

---

### Fase 4 — Editor Cypher (CodeMirror, no Monaco)

- Nuevo lenguaje `cypherLanguage` (CodeMirror Lezer) a lo `mongoShellLanguage.ts`: keywords, operadores, comentarios `//`, strings simples/backtick.
- Snippets: `MATCH / RETURN`, `CREATE`, `MERGE`, `OPTIONAL MATCH`, `WITH/LIMIT/SKIP`, `EXPLAIN/PROFILE prefix`.
- Completions schema-driven (`completions.ts`): labels conocidas al escribir `(:La|`, rels al escribir `-[rr/ -, propiedades dentro de `WHERE`/`RETURN`, autocompletado `$param` de los parámetros vistos.
- El selector de lenguaje en `SqlCodeEditor` mapea `DatabaseType.NEO4J` → `cypher`.

> Nota: docs existentes que mencionan "Monaco" (README, `docs/frontend-modules.md`) son **obsoletos**; no hay tipo unknown con este plan.

**Aceptación:** resaltado/autocompletado correct of the schema en 1 query ejemplo.

---

### Fase 5 — Ejecución de consultas (CypherQueryService)

- Comandos Tauri tipados (reuse el patrón de `execute_query`): `execute_cypher(input, params)` y, opcionalmente, dentro del mismo (detección por `DbType` en una sola ruta de comando — decisión del PR).
- Capacidades: `validate` (una statement, `;` final opcional), `execute`, `paginate` (`SKIP/LIMIT` con el mismo `LIMIT_OPTIONS` de la UI), `cancel`, `explain/profile`.
- **EXPLAIN/PROFILE son keywords del lenguaje en Cypher** (`EXPLAIN MATCH…`, `PROFILE MATCH…`): botón que prefija la query, con aviso de coste real para `PROFILE` (se ejecuta realmente).
- Timeout por consulta (config de sesión), proteger el caso de query sin fin (no `RETURN` limit).
- Resultado: `QueryResult` extendido (Fase 2); auditoría (Fase 1); gamificación call-site (Fase 9).

**Aceptación:** e2e contra contenedor: ejecutar + limit + explain + perfil; cancelación funciona; `checkDangerousQuery` NO aplica (es SQL) — se valida por parser local del CypherQueryService (rechazo de `:auto`/`CALL admin` de riesgo en modo read-only).

---

### Fase 6 — Graph Explorer (React Flow)

- Flujo: `Query → GraphResult → GraphModel → GraphRenderer` (React Flow 12 ya instalado).
- Canvas + pan/zoom + fit; Inspector (propiedades/labels/type del nodo/arista dentro de la vista `graph`).
- `Expand node`: `MATCH (a)-[r]->(b) WHERE elementId(a) = $id RETURN r, b LIMIT n` (n default 50, botón "load more" en vez de todo).
- `Collapse`, `Filter` by label/type, `Search` (full-text over labels/properties con `LIMIT`).
- Seguridad D2 (parametrize ids; sanitize identifiers).
- Rendimiento: límite de nodos visibles (≈500) + LRU de renderización.

**Gate comercial:** el Explorer vuelve dependiente de `GraphResult` (Fase 2). El bloqueo por nivel puede hacerse con `FeatureGate` (componente existente) para ocultar al nuevo usuario; **no** se co-describe la infraestructura — el código del explorer vive completo desde Fase 2, solo cambia el gate.

**Aceptación:** completo e2e expand-inspect en contenedor; no se congela con grafo mediano.

---

### Fase 7 — Assistant / Graph Knowledge

- `ContextBuilder` rama grafos: si la conexión es Neo4j se inyecta `GraphSchemaContext` (labels + rel types + property keys) formateado en el mismo estilo:
  ```
  User -[:BOUGHT]-> Product
  Company <-[:MANUFACTURED_BY]- Product
  ```
- `PromptBuilder`**: `si connection.type == neo4j → genera Cypher, no SQL`** — hoy inyectarí schema relacional y el LLM inventa. Es el riesgo #1 si no se acota.
- Chat + `assistant_fix_sql` reusan el nuevo contexto; `SchemaCache` del assistant ya con la rama graph.

**Aceptación:** el LLM genera Cypher válido sobre el grafo demo sin haber visto el schema en el prompt; explicación de trayectos (`User → WORKS_AT → Company`) apoyada en los ~rel types.

---

### Fase 8 — Error Fixer (doble vía)

- `application/query/` → `sql/` (fijer existente) + `cypher/fixer.rs` + `common/`.
- `Neo4jErrorParser`: mapea errores Bolt a categorías (`SyntaxError`, `ConstraintValidation`, `Unauthorized`…) con sugerencia de contexto + `GraphSchema` (p. ej. `Unknown label` → completar con labels reales).
- El usuario decide aplicar; **nunca** autocorrección silenciosa (regla del repo).

**Aceptación:** fixer cypher devuelve sugerencia accionable en 3 casos de error típicos sin romper `SqlFixer` actual.

---

### Fase 9 — Gamificación (por call-site, sin capa de eventos)

Los eventos/frases **no existen en backend**; la XP se suma en call sites frontend (`useQueryEditor`, `MainLayout`, `ResultsPanelHeader`):

1. `calculateQueryXp` obtiene rama Cypher: complexityScore adaptado (MATCH/OPTIONAL MATCH/aggregation/MERGE/propiedades…) — el hash `isQueryFirstTime` ya funciona para Cypher.
2. Nuevo `trackAction('GRAPH_EXPANDED')` en el expand del Explorer (+20 XP primera vez); `CREATE_CONNECTION` ya cubre Neo4j (automáticamente).
3. `EXPLAIN/PROFILE` → `trackAction` + XP primera vez (ej. `+15/20`).
4. Ninguna XP vinculada a condiciones de complejidad arbitraria del Cypher (depls.).

**Aceptación:** unidades de gamification verde; XP por acciones graph consistentes con la tabla del README.

---

### Fase 10 — Operaciones administrativas

- TODO Neo4j 5: `SHOW DATABASES`, `SHOW USERS`/`SHOW ROLES`/`SHOW PRIVILEGES` — **`SHOW USERS/ROLES` requiere Enterprise** (Community fails; detectar edition al conectar y gate de UI).
- gestiones de indexes/constraints (create/drop) con UI driven por labios; drop con confirmación (patrón `safe delete` del repo).
- estadística básica: counts por label/reltype (si el contenedor permite `graph counts`).

### Fase 11 — Estrategia de test integral

Aunque se aplica en cada fase, traza un checklist común:

| Nivel | Qué | Cómo |
|-------|-----|------|
| Unit | `metadata.rs` (queries nativas), `result.rs` (normalización), fixer | `cargo test --lib` con mock driver |
| Integration | driver + metadata + CypherQueryService + explorer | Docker `neo4j:5-community` + contenedor de datos demo → script `scripts/neo4j-test.ps1` (optativo, CI) |
| e2e | editor → execute → graph → expand | Docker + `bun run test` (vs test E2E si exist) |
| Fechas | Contratos (F0—F2) sin break de el sistema actual | CI actual (`cargo fmt/clippy/test + bun lint/tsc/test`) en cada PR |

---

## Orden Real de Ejecución

Como Tech Leader, se fusionan estos packs (2 PRs de mayor contexto):

**PR A (Core / integración de máquina):** F0 ✅ → F1 ✅ → F2 ✅ → F3 → F5 (con tests integrados Docker desde F1). **Pendiente:** F3 (introspección) y F5 (ejecución Cypher).

**PR B (UX / interacción):** F4 (editor) → F6 (explorer) → F7 (assistant) → F8 (fixer) → F9 (gamif) → F10 (admin). **Sin empezar.**

Con esto el Explorer (F6) **no se bloquea** detrás de Fases tardías técnicamente; solo se "declara" - nunca se reescribe.

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| `neo4rs 0.9` RC inestable / sin API async estable | Capa `driver.rs` es la única interfaz del crate; retro `0.8` con restricción Neo4j 5 |
| No existen ids estables frente a reorganizaciones del grafo | D2: `elementId` desde F2, flag de préstamo en F1 |
| MySQL de projecope de queries costosas (PROFILE, expand) | límites default (50 nodos / 250 render), `SKIP/LIMIT`, timeout, advertencia `PROFILE` |
| Enterprise-only admin ops | detección de edition en sesión + gate UI |
| Contaminación del assistant con contexto relacional en Neo4j | PrompBuilder ramificado desde F7 |
| Perder la regla "no normalize engines" | GraphMetadata propio; **no `DatabaseSchema` unificado+** |

---

## Criterios de Aceptación global (Definition of Done del proyecto)

- [x] Conexión Neo4j desde el mismo flujo de conexión que el resto (credenciales cifradas, túnel SSH transparente) — **F0–F1**
- [x] `DbType`/`DatabaseType` = `neo4j` en ambos lados; `GraphDriver` trait separado; drivers existentes intactos (test verdes) — **F0**
- [ ] Ejecución Cypher livrable: params tipados, pagination, cancel, EXPLAIN/PROFILE, auditoría — **F5**
- [x] `QueryResult.graph` neutral (sin types de crate); vista Grafos React Flow funcionando — **F2** (vista básica; Graph Explorer completo en F6)
- [ ] Editor CodeMirror con lenguaje Cypher + autocompletado del schema real
- [ ] Assistant con contexto grafos y generación de Cypher correcta
- [ ] Fixer de Cypher con sugerencias + permiso explícita
- [ ] Gamificación con XP Cypher-relevantes sin capa de eventos inventada
- [ ] Admin ops con edition gating
- [ ] Suite de CI completo: `cargo fmt --all -- --check && cargo clippy --lib --all-targets -- -D warnings && cargo test --lib` (backend) + `bun run lint && bunx tsc -b && bun run test` (frontend) + tests de integración Neo4j en Docker donde aplique