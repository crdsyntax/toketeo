# Frontend Architecture & Components

The frontend is a **React + TypeScript + Vite** SPA embedded in a **Tauri** desktop shell. It is a **metadata rendering layer**: all database semantics come from the Rust backend. The UI must not invent schema hierarchies, normalize engines, or infer domain structure.

## Stack

| Piece | Role |
|-------|------|
| React 18 + TypeScript | UI |
| Vite | Dev server / bundler |
| Tauri v2 (`@tauri-apps/api`) | IPC to Rust (`invoke`, events) |
| Zustand | UI + session state |
| TanStack Query | Optional request caching of raw backend responses |
| Monaco | SQL editor |
| Tailwind CSS | Styling |
| React Router | In-app routes |

**Not used:** Electron, Axios REST API, NestJS JWT HTTP clients.

---

## Absolute Rules (Tech Leader)

1. **Backend is source of truth** — types and trees mirror Rust DTOs (`types/*`).
2. **Zero domain inference** — no hardcoded “Tables/Views” taxonomy unless the backend provided that node.
3. **Engine-agnostic UI** — render differences; do not unify PostgreSQL/MySQL/Mongo into one model.
4. **No credentials in UI state** — passwords stay in Rust/keyring.
5. **Components are presentational** — orchestration lives in stores/services calling `tauriApi.invoke`.

---

## Layout

```
frontend/src/
├── App.tsx / main.tsx
├── layouts/MainLayout.tsx
├── pages/                    # Route-level screens
├── components/
│   ├── compare/              # DB Compare UI
│   ├── connections/
│   ├── query/
│   ├── scheduler/
│   ├── sync/
│   ├── assistant/
│   ├── gamification/
│   ├── layout/
│   └── ui/
├── store/                    # Zustand stores
├── services/                 # Thin Tauri IPC wrappers
├── hooks/                    # useExplorer, useQueryEditor, …
├── types/                    # Mirrors Rust IPC DTOs
├── lib/                      # api, gamification, utils
└── diagram/                  # Schema diagram feature
```

---

## IPC Layer

**Path:** `lib/api.ts` → `tauriApi.invoke(command, args)`

- Wraps `@tauri-apps/api/core` `invoke`.
- Normalizes Rust `AppError` shapes into user-facing strings.
- **No HTTP base URL, no JWT interceptors.**

Domain services (`services/*.ts`) map 1:1 to command names and pass through typed payloads. Example: `services/compare.service.ts` → `compare_schemas`, `compare_data`, `generate_sync_script`, `pause_compare`, `resume_compare`, `cancel_compare`.

---

## State Management (Zustand)

| Store | Responsibility |
|-------|----------------|
| `useAppStore` | Connections list, active connection IDs, theme/sidebar UI |
| `compareStore` | Schema/data reports, sync script, progress, pause/resume/cancel |
| `syncStore` | Cross-DB sync pipelines |
| `schedulerStore` | Scheduled jobs |
| `gamificationStore` | XP, level, quests, unlocks (persisted) |
| `assistantStore` | Assistant hub UI |
| `performanceStore` | Query timing metrics |
| `visualizerStore` | Chart/visualizer UI |

### Compare store rules

- Holds **raw** `SchemaReport` / `DataReport` / `SyncScript` from backend.
- Tracks `loading`, `error`, `compareId`, `status` (`idle` \| `running` \| `paused` \| `cancelled`), `progress`.
- Starting a new schema compare **does not wipe** previous reports until replaced (results stay visible while re-running).
- `clear()` is the only full reset.
- Statement selection for scripts is UI state on top of backend-generated SQL.

**Forbidden in stores:** derived schema graphs, cross-engine normalization, inventing object categories.

---

## Routes

Defined in `App.tsx` under `MainLayout`:

| Path | Page |
|------|------|
| `/` | Connections |
| `/explorer` | Object explorer |
| `/query` | SQL editor |
| `/diagram` | Schema diagram |
| `/compare` | **DB Compare** |
| `/cross-db-sync` | Cross-DB sync |
| `/scheduler` | Job scheduler |
| `/assistant` | Smart assistant hub |
| `/audit` | Audit log |
| `/settings`, `/security` | Settings |

---

## Core Hooks

| Hook | Role |
|------|------|
| `useQueryEditor` | Tabs, execute via Tauri, results, export |
| `useExplorer` | Lazy tree expansion; metadata fetch on demand |
| `useSchemas` | Database/schema lists for selectors |

Explorer is a **generic recursive renderer**: children load when expanded; structure is whatever the backend returns.

---

## Key Feature Modules

### 1. Connections

**Components:** `ConnectionModal`, `ConnectionWizard`, `ConnectionsSidebar`, `DumpRestoreModal`, …

- Connection CRUD and test via `connection.service`.
- SSH fields collected in UI; tunnel establishment is backend-only.
- Dump/restore selection UI; execution and file dialogs via Tauri plugins/backend.

### 2. Query Editor

**Components:** `SqlEditorPanel` (Monaco), results grid, export.

- Execution through query Tauri commands.
- No business SQL rewriting in the frontend beyond editor convenience.

### 3. DB Compare

**Page:** `pages/ComparePage.tsx`  
**Store:** `store/compareStore.ts`  
**Service:** `services/compare.service.ts`  
**Types:** `types/compare.ts` (mirrors `models/compare.rs`)

| Component | Role |
|-----------|------|
| `SchemaDiffTree` | Expandable schema diffs + human-readable descriptions; column pills (−/+/~) |
| `DataDiffTable` | Per-table data diffs; expandable row/column details |
| `ScriptPreview` | Toggle statements, options, copy/download SQL; header with source/target names |
| `FullscreenModal` | Fullscreen overlay for large diffs (minimize → floating pill) |

**UI flow:**

1. Select source/target **connected** connections + optional schemas/tables.
2. Run schema and/or data compare → progress from backend events.
3. Inspect diffs (tree/table); optional fullscreen.
4. Generate sync script for target engine; select statements; copy/download.

**UI must not:**

- Compute structural diffs client-side.
- Generate engine SQL for schema sync (backend generators own that).
- Assume PK/column sets beyond what the report contains.

Presentation-only helpers (e.g. script header comment, `USE \`db\``) may decorate backend SQL for readability.

### 4. Cross-DB Sync

**Page:** `CrossDbSyncPage` + `components/sync/*`  
Pipeline editor and history; distinct from Compare (data movement vs. diff + script).

### 5. Scheduler

**Page:** `SchedulerPage` + `JobCard` / `JobFormModal`  
Cron jobs: backup, report, CSV export — definitions and status from backend.

### 6. Gamification & Assistant

- XP/levels/quests/unlocks in `lib/gamification` + `gamificationStore`.
- `FeatureGate` locks UI by level when required.
- Assistant hub: tips, AI query help, performance panels — still no invented DB structure.

### 7. Diagram

**Path:** `diagram/`  
Visual schema graph fed by backend metadata; layout is UI-only.

---

## Component Strategy

- Prefer small presentational components driven by typed props from stores/pages.
- Loading and error states are explicit and local to the feature.
- Virtualize large lists/trees when needed; never change data semantics for performance.
- Reuse `components/ui/*` primitives (tooltip, context menu, shortcuts).

---

## Types

`types/compare.ts`, `types/database.ts`, `types/sync.ts`, etc. must stay aligned with Rust `serde` shapes (`snake_case` fields as serialized).

When backend DTOs change → update TS types in the same change set.

---

## Anti-Patterns

Reject:

- REST/Axios assumptions or “API base URL” for core DB ops.
- Frontend schema comparison algorithms.
- Hardcoded engine hierarchies (e.g. always nest schema → public).
- Storing decrypted passwords in Zustand/localStorage.
- Transforming backend metadata into a “universal” model.

---

## Golden Rule

If Rust does not define it, the frontend must not invent it. Faithful rendering of backend metadata and reports is the entire job of this layer.
)
