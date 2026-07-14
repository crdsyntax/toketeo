# Roadmap (Toketeo DBA Client)

## Context (Current System State)

The system already includes:

* SSH tunneling support
* MariaDB fully functional (schemas, tables, queries, metadata)
* PostgreSQL connection (full metadata: databases → schemas → tables/objects)
* MongoDB connection implemented
* SQL Server support not validated
* Redis planned (full plan: [`redis-integration-plan.md`](./redis-integration-plan.md))
* Monaco-based SQL editor
* Column inspector (types, defaults, nullability, PK detection)
* Index / FK / constraints visualization
* Table DDL extraction
* Row-level data viewer with inline editing (double-click)
* Transaction support for production-marked connections
* Connection testing (with "Test Connection" button)
* Import / export of connections
* Database restore functionality
* Explorer tab state persistence

---

## Current Architectural Issues (Must Fix First)

* (None - Core stabilization completed)

---

## Phase 1: Core Stabilization (Critical Path)

* [x] Fix PostgreSQL metadata introspection (schemas → tables → columns)
* [x] Normalize cross-engine schema discovery layer (without losing engine fidelity)
* [x] Stabilize Explorer tab state (no reload on tab switch)
* [x] Introduce persistent UI session state per connection

---

## Phase 2: Explorer UX Completion

* [x] Add "WHERE filter input" in Data tab:

  * SQL fragment input (`WHERE <user_input>`)
  * execute on Enter key
  * example: `id = 1 AND status = 'active'`
* [x] Preserve query state when switching tabs:

  * Explorer ↔ Query Editor ↔ Data Viewer
* [x] Cache last executed query per tab/session

---

## Phase 3: Row-Level SQL Generation Engine

* [x] Right-click on row → actions:

### SELECT Builder

* [x] Generate `SELECT col1, col2, col3 FROM table WHERE primary_key = X`
* [x] Never use `SELECT *`

### UPDATE Builder

* [x] Generate parameterized UPDATE statement:

  * only changed fields included
  * WHERE based on primary key(s)

### INSERT Builder

* [x] Generate full insert statement (all columns explicit)
* [x] Optional: exclude null/default columns toggle

### DELETE Builder

* [x] Generate safe DELETE with PK-based WHERE clause

### JSON Export

* [x] Export selected row as structured JSON
* [x] Respect type decoding rules from driver layer

### Model export

* [x] Export model for moongose on node express and nestjs
* [x] Export model for typeORM
* [x] Export model for Prisma
* [x] Export model for Sequelize


---

## Phase 4: Multi-Driver Completion

* [x] Validate SQL Server driver behavior:
  * Fixed `isPrimaryKey` in `fetch_columns` (LEFT JOIN with `INFORMATION_SCHEMA.TABLE_CONSTRAINTS`)
  * DDL fallback for tables documented
* [x] MongoDB full explorer support:
  * Collections listed in sidebar (via TABLES tab renamed to "Collections")
  * Documents viewable in Data tab with `_id` as PK
  * Schema inference (best-effort) via `fetch_columns` sampling 5 documents
  * Indexes support via `list_indexes()`
  * FK / Constraints / DDL tabs hidden (not applicable to MongoDB)
  * `get_db_type` command exposes engine type to frontend
  * Engine-aware UI: Sidebar and ObjectDetail adapt per motor
* [ ] SQLite integration for local persistence layer (if required)

---

## Phase 14: Redis Engine Integration

Full plan: [`redis-integration-plan.md`](./redis-integration-plan.md)

### Backend

* [ ] Add `fred = "9"` dependency to `Cargo.toml`
* [ ] Add `DbType::Redis` variant to `DbType` enum + `Display` impl
* [ ] Add `UpsertStrategy::Hset` variant
* [ ] Implement `RedisDriver` (`src-tauri/src/db/redis.rs`):
  * [ ] `DbDriver` trait — `fetch_databases()` via `INFO KEYSPACE`, `fetch_tables()` via `SCAN`, `execute()` for free Redis commands
  * [ ] `DataReader` trait — keyset-based pagination adapted to SCAN cursor
  * [ ] `DataWriter` trait — `SET`/`HSET`/`LPUSH`/`SADD` depending on key type
  * [ ] `CapabilityProvider` — `supports_transactions: false`, `supports_keyset_pagination: false`
  * [ ] `redis_value_to_json()` converter (String, Integer, Double, Array, Boolean, Nil)
  * [ ] Output normalization for `execute()` — GET→1 row, HGETALL→N rows, LRANGE→N rows, etc.
* [ ] Add Redis arm to `DriverFactory::create()`
* [ ] Add `redis://` URL format to `ConnectionStringBuilder`
* [ ] Skip transaction `BEGIN` for Redis in `state.rs` + `connection_service.rs`
* [ ] Add `PING` connection test in `commands.rs`

### Frontend

* [ ] Add `REDIS = 'redis'` to `DatabaseType` enum (also add missing `MYSQL`)
* [ ] Add Redis to Connection Wizard (icon: `⚡`, color: amber, port: 6379, database number field)
* [ ] Add Redis sidebar color (`text-amber-400`)
* [ ] Create `redisLanguage.ts` for Monaco syntax highlighting
* [ ] Adapt `DataTab.tsx` for Redis mode:
  * [ ] SCAN pattern input replacing WHERE clause
  * [ ] Dynamic columns based on key type (String, Hash, List, Set, Sorted Set)
  * [ ] Hide DDL/FK/Constraints/Index tabs
* [ ] Adapt Query Editor for Redis command mode
* [ ] Add Redis functions to `schema.service.ts`
* [ ] Update `EngineCapabilities` for Redis (no schemas, no views, no procedures, etc.)

### Tests

* [ ] Unit tests for `redis_value_to_json()` converter
* [ ] Unit tests for output normalization in `execute()`
* [ ] Integration test: connect to local Redis, list databases, scan keys, execute commands

---

## Phase 5: Advanced Explorer Engine

* [x] Unified Explorer abstraction layer (engine-aware, not normalized)
  * Implemented `EngineCapabilities` helper in frontend for motor-specific UI tweaks
* [x] Metadata caching per connection session
  * Backend now caches columns, indexes, FKs, and constraints with a 5-min TTL
  * Cache is automatically invalidated upon DDL execution
* [x] Lazy-loading of schema trees
  * Sidebar tabs (Tables, Views, Procedures, etc.) are lazy-loaded via `enabled` condition on `useQuery`
* [x] Pagination for large tables (mandatory >1000 rows rule enforced)
  * Server enforces a hard cap of `MAX_PAGE_SIZE = 1000`
  * Frontend UI allows explicit selection up to 1000 (Max)

---

## Phase 6: Query Editor Enhancements

* [x] Persist Monaco editor state per tab
* [x] Multi-query session support (tabs independent)
* [x] Query execution history per connection
* [ ] Result diffing between executions (optional advanced feature)
* [x] **MongoDB Shell Syntax in Query Editor** (`db.collection.find({...})`)
  - Client-side JS/TS parser detects `db.<collection>.<method>(...)` syntax in Monaco
  - Transforms parsed AST into internal JSON protocol (`{ collection, find, sort, project, limit, skip, collation, hint }`)
  - Supports chained methods: `.find()`, `.findOne()`, `.sort()`, `.project()`, `.limit()`, `.skip()`, `.count()`, `.aggregate()`, `.insertOne/Many()`, `.updateOne/Many()`, `.deleteOne/Many()`, `.distinct()`, `.createIndex()`
  - Visual badge indicator ("Shell Mode" / "JSON Protocol") in the editor header
  - Custom Monaco language `mongodb-shell` with syntax highlighting and autocomplete
  - Filter bar values (MongoFilterBar) are merged on top of parsed shell queries

---

## Phase 7: Security & Transaction Layer

* [x] Validate transaction safety for production connections
* [x] Enforce read-only mode toggles per connection
* [ ] Add query execution guardrails:

  * [x] destructive query detection (DELETE/UPDATE without WHERE warning)
* [x] Audit logging for all row-level modifications

---

## Phase 8: Performance & Stability

* [x] Fix unnecessary re-fetch on tab switching
* [x] Introduce memoized metadata layer
* [x] Prevent duplicated schema queries
* [x] Reduce driver round-trips on explorer navigation
  * `get_connection()` downgraded from `write().await` to `read().await` for driver retrieval
  * Separate minimal `write().await` only for `touch()` — eliminates read-lock contention
* [x] Connection pool reuse optimization per engine
  * `PostgresDriver` + `MySqlDriver` non-transactional pools now use explicit `PoolOptions`:
    * `min_connections = 1` (one warm connection, eliminates cold-start latency)
    * `max_connections = 5` (caps concurrent DBA load)
    * `idle_timeout = 10 min` (releases idle connections to avoid exhausting server limits)
    * `acquire_timeout = 5 s` (fail-fast on congestion instead of hanging)
  * Transactional pools also get explicit `acquire_timeout = 5 s`

---

## Phase 9: UX Enhancements

* [x] Context-aware right-click menu per entity type:

  * table
  * row
  * column
  * index
* [x] Inline SQL preview panel for generated queries
* [x] Visual diff for row edits before commit

---

# Phase 10: Gamification Engine (Toketeo RPG)

## Backend (Rust)

### Core Architecture

Nueva estructura:

```txt
crates/
│
├── toketeo-core
│   ├── sql-analyzer
│   ├── event-engine
│   ├── xp-engine
│   ├── achievement-engine
│   ├── class-engine
│   └── mission-engine
│
├── toketeo-storage
│   ├── sqlite
│   └── repositories
│
└── toketeo-api
```

---

### SQLite Progress Database

Archivo:

```txt
data/gamification.db
```

Tablas:

```txt
achievements
user_achievements
user_stats
user_events
missions
user_missions
user_class
```

---

### Event Engine

Todo debe generarse mediante eventos.

```rust
pub enum DomainEvent {
    QueryExecuted(QueryAnalysis),
    QuerySucceeded,
    QueryFailed,
    ViewCreated,
    IndexCreated,
    TableCreated,
    AchievementUnlocked(String),
    LevelUp(u32),
}
```

---

### SQL Analyzer

Basado en:

```toml
sqlparser = "*"
```

Detectar:

```txt
SELECT
INSERT
UPDATE
DELETE
JOIN
UNION
CTE
WINDOW
SUBQUERY
GROUP BY
```

Clasificar:

```txt
Simple
Intermediate
Complex
Expert
```

---

### XP Engine

Reglas iniciales:

```txt
Simple Query          +1 XP
Intermediate Query    +3 XP
Complex Query         +5 XP
Expert Query          +10 XP

JOIN                  +1 XP
CTE                   +3 XP
WINDOW                +5 XP
```

---

### Achievement Engine

Configuración mediante JSON.

```json
{
  "id": "DRUID_SIMPLE",
  "title": "Druida de los Hechizos Simples",
  "condition": {
    "simple_queries": 10
  },
  "xp_reward": 50
}
```

---

### Class Engine

Determina especialización.

```txt
Druida
Hechicero
Alquimista
Nigromante
Guardián
Arquimago
```

Ejemplo:

```txt
80% SELECT
```

↓

```txt
Druida
```

---

### Mission Engine

Misiones dinámicas.

Ejemplos:

```txt
Realiza 5 JOINs
```

```txt
Crea tu primera VIEW
```

```txt
Optimiza una consulta
```

---

## Frontend

### Player Profile

Nueva sección lateral:

```txt
Explorer
Connections
Queries
RPG Profile
Settings
```

---

### Profile Panel

Mostrar:

```txt
Nivel

XP Actual

Clase

Título

Logros
```

Ejemplo:

```txt
Nivel 8

Clase:
Hechicero

Título:
Tejedor de Tablas
```

---

### XP Bar

Visible en la barra superior.

```txt
[████████░░░░]
420 / 600 XP
```

---

### Achievement Toasts

Cuando se desbloquee un logro.

```txt
═══════════════════════
 LOGRO DESBLOQUEADO

 Druida de los
 Hechizos Simples

 +50 XP
═══════════════════════
```

---

### Achievements View

Categorías:

```txt
Consultas
Modelado
Performance
Producción
Ocultos
```

---

### Missions Panel

Mostrar:

```txt
Misiones activas

[3/5] Ejecuta JOINs

[1/1] Crea una VIEW
```

---

### Query Result Integration

Después de ejecutar una consulta:

```txt
Consulta ejecutada

+5 XP

Complejidad:
Complex

Nivel actual:
7
```

---

### Statistics Dashboard

Mostrar:

```txt
Total Queries

Simple Queries

Complex Queries

JOIN Count

Views Created

Indexes Created

Achievements Unlocked
```

---

## Hidden Achievements

Ejemplos:

```txt
DELETE sin WHERE
```

↓

```txt
Invocador del Caos
```

---

```txt
100 SELECT *
```

↓

```txt
Bárbaro de Producción
```

---

```txt
Consulta a las 3 AM
```

↓

```txt
Necromante Nocturno
```

---

## Constraints

* Gamificación nunca debe bloquear ejecución SQL.
* SQLite debe ser completamente independiente de las conexiones de usuario.
* Toda la lógica debe ejecutarse de forma asíncrona.
* Logros deben ser configurables sin recompilar.
* El sistema debe funcionar offline.

---

# Phase 11: Data Visualizer

## Overview

Convertir resultados de consultas SQL en gráficos interactivos. El visualizador se despliega como un tercer modo de vista (junto a Table y JSON) en el panel de resultados, accesible desde la tab `Visualize` en el header de resultados.

## Features

- [ ] **Chart Types**: Bar, Line, Pie, Area, Scatter, Doughnut
- [ ] **Auto-detection**: Column classification (numeric / categorical / temporal / id) + chart type suggestion
- [ ] **Column Picker**: Select X axis, Y axis (multi-series), and Group by columns
- [ ] **Chart Customization**: Orientation toggle, stacked mode, chart title
- [ ] **Theme**: Dark/light mode integration with ECharts theme
- [ ] **Export PNG**: Save chart as image via Tauri file dialog
- [ ] **Performance**: Handle up to 5000 data points per series
- [ ] **Empty/Error states**: Graceful handling of non-plottable data

## Stack

- **Library**: Apache ECharts (`echarts` + `echarts-for-react`)
- **Store**: `visualizerStore.ts` (Zustand, config per tab)
- **Gate**: Unlocked at level 15 via perk `data_visualizer`

## Architecture

```
components/query/panels/
├── VisualizePanel.tsx              # Orquestador (usa subcomponentes de visualize/)
└── visualize/                      # Sub-módulo autocontenido
    ├── ChartRenderer.tsx           # Renderiza ECharts
    ├── ChartTypeSelector.tsx       # Bar / Line / Pie / Area / Scatter
    ├── ColumnPicker.tsx            # Selectores de eje X, Y, Group
    ├── ChartControls.tsx           # Orientación, stacked, título
    └── ChartEmptyState.tsx         # Sin datos o columnas no graficables

store/
└── visualizerStore.ts              # ChartConfig por tabId (store del módulo)

lib/
├── chart-types.ts                  # Constantes + config de tipos de gráfico
└── column-detection.ts             # Clasificación de columnas
```

## Tasks

### 5.1 Install Dependencies
- [ ] Install `echarts` and `echarts-for-react`

### 5.2 Visualizer Store
- [ ] `visualizerStore.ts` — ChartConfig (chartType, xColumn, yColumns, groupColumn, orientation, stacked, title) + setters por tabId

### 5.3 Column Detection Engine
- [ ] `column-detection.ts` — ColumnProfile con role detection (numeric, categorical, temporal, id) + chart type suggestion algorithm

### 5.4 Chart Renderer
- [ ] `ChartRenderer.tsx` — Construye option de ECharts desde ColumnConfig + rows; soporta bar, line, pie, area, scatter, doughnut; integra tema dark/light

### 5.5 UI Controls
- [ ] `ChartTypeSelector.tsx` — Botones de selección con suggested badge
- [ ] `ColumnPicker.tsx` — Dropdowns X, Y (multi), Group
- [ ] `ChartControls.tsx` — Orientation, stacked toggle, title input

### 5.6 Refactor VisualizePanel
- [ ] Reemplazar placeholder actual con layout completo de controles + ChartRenderer

### 5.7 Integration
- [ ] Extraer `columns` de `activeTab.results.columns` y pasar a VisualizePanel
- [ ] Inicializar ChartConfig automático al cambiar a visualize mode
- [ ] Export PNG via Tauri invoke

### 5.8 Perk Update
- [ ] Cambiar `requiredLevel` de `data_visualizer` de 1 a 15 en `unlocks.ts`

---

# Phase 12: Smart Assistant Hub

## Overview

El Smart Assistant Hub unifica 5 áreas de ayuda en una sola interfaz accesible desde un botón flotante `Sparkles` en QueryEditor o desde la ruta `/assistant`. El asistente se expande progresivamente según el nivel del usuario.

### Architecture

```
frontend/src/
├── components/
│   ├── assistant/
│   │   ├── AssistantLayout.tsx      # Hub layout (sidebar + 5 pestañas)
│   │   └── panels/
│   │       ├── QueriesPanel.tsx     # Conversacional AI (reemplaza AIAssistantPanel)
│   │       ├── PerformancePanel.tsx  # Dashboard de rendimiento
│   │       ├── StructuresPanel.tsx   # Insights de estructura
│   │       ├── UsagePanel.tsx        # Tips + stats de uso + gamificación
│   │       └── ConnectHelpPanel.tsx  # FAQ + ayuda de conexión
│   ├── connections/
│   │   └── ConnectionWizard.tsx     # Wizard de conexión guiada (3 pasos)
│   ├── layout/
│   │   └── OnboardingTour.tsx       # Tour guiado de 7 pasos al primer inicio
│   └── ui/
│       ├── ContextualTip.tsx        # Tips contextuales en línea (reutilizable)
│       └── KeyboardShortcutsModal.tsx # Modal de atajos de teclado (reutilizable)
├── store/
│   ├── assistantStore.ts            # Estado del asistente (persist partial)
│   └── performanceStore.ts          # Registro de rendimiento de queries
```

### Features Implemented

- [x] **AssistantLayout** — Hub con 5 tabs (Queries, Performance, Structures, Usage, Connect) + FeatureGate por perk
- [x] **Queries Panel** — Chat conversacional con ejemplos predefinidos, respuestas SQL, botón copiar, sugerencias de ejemplo
- [x] **Performance Panel** — Dashboard con avg/max duration, slow queries, total rows, historial reciente por query
- [x] **Structures Panel** — Insights de esquema, checklist de salud (PKs, FKs, índices), acceso al Schema Explorer
- [x] **Usage Panel** — Stats de gamificación (level, XP, streak, queries), tips rápidos de uso
- [x] **ConnectHelp Panel** — FAQ expandible, acceso al Connection Wizard
- [x] **Connection Wizard** — Modal multi-paso (3 pasos: engine → credentials → test & confirm)
- [x] **Onboarding Tour** — 7 pasos guiados al primer inicio con recompensa XP
- [x] **Contextual Tips** — Tips inline en QueryEditor (SELECT *, etc.) con dismiss persistente
- [x] **Keyboard Shortcuts** — Modal con atajos (`?` para abrir, `Ctrl+I` para toggle assistant)
- [x] **Performance Tracking** — Registro automático de duración, filas, SQL en performanceStore
- [x] **Assistant nav entry** — Ruta `/assistant` + nav item gated por perk `ai_assistant`
- [x] **Ruta /assistant** — Página full con AssistantLayout lateral

### Gatificación por Perk

| Perk | Nivel | Desbloquea |
|---|---|---|
| `theme_customizer` | 5 | Tips contextuales + ConnectHelp |
| `ai_assistant` | 10 | Pestaña Queries (conversacional) + nav Assistant + ruta /assistant |
| `data_visualizer` | 15 | Pestañas Performance + Structures |

### Dependencias

- Sin dependencias externas nuevas (react-joyride no necesario, tour implementado con estado local + modales)
- Reutiliza stores Zustand existentes (gamificationStore, useAppStore)

---

# Phase 13: Community Features (Future)

## Rankings

```txt
Top XP
Top Druidas
Top Guardianes
Top Logros
```

---

## Cloud Sync

Sincronización opcional.

```txt
SQLite Local
      ↓
 Sync
      ↓
 Cloud
```

---

## Guilds

```txt
Orden de los JOINs
Hijos del Índice
Hermandad del Explain Analyze
```

---

## Challenge Dungeons

Bases de datos simuladas con problemas reales.

```txt
Deadlocks
Missing Indexes
N+1 Queries
Slow Queries
```

---


---




## Golden Rule

This is not a CRUD tool.

It is a **multi-engine database orchestration client with deterministic query control, metadata introspection, and safe mutation tooling**.
