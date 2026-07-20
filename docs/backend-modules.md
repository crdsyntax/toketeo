# Backend Architecture & Modules

Toketeo's backend is a **Rust + Tauri orchestration runtime** for multi-engine database interaction. It is not a traditional application server (no NestJS, no HTTP API). The frontend invokes typed Tauri commands; the backend orchestrates drivers and returns structured results.

## Architectural Layers

```
Presentation  →  presentation/tauri/commands.rs   # IPC boundary, input validation
Application   →  application/*                     # Use-case orchestration
Infrastructure→  infrastructure/*, db/*, ssh/      # Drivers, crypto, scheduler, tunnels
Domain (min.) →  models/*                          # Shared DTOs only (no business entities)
```

**Rules (Tech Leader):**

- Commands are thin: validate → delegate → return.
- No SQL execution inside command handlers.
- Drivers are not exposed to the frontend.
- Engines are bounded contexts; metadata is not normalized across engines.
- Prefer `Result<T, AppError>` on all fallible paths.

---

## Layout

```
src-tauri/src/
├── presentation/tauri/commands.rs   # All #[tauri::command] entry points
├── application/
│   ├── connection_service.rs
│   ├── explorer_service.rs          # Dump, restore, integrity, object ops
│   ├── auth_service.rs / session_service.rs / keyring_service.rs / totp_service.rs
│   ├── audit_service.rs
│   ├── sql_generator_service.rs / model_generator_service.rs
│   ├── compare/                     # DB Compare module
│   └── sync/                        # Cross-DB data sync pipelines
├── db/                              # DbDriver trait + engine implementations
├── infrastructure/
│   ├── scheduler/                   # Cron jobs (backup, report, CSV)
│   ├── drivers/                     # Driver factory helpers
│   ├── database/                    # Connection string builders
│   └── crypto.rs
├── models/                          # Shared structs (compare, sync, query, etc.)
├── ssh/                             # SSH tunnel lifecycle
├── state.rs                         # AppState, connection sessions, SyncController
├── storage.rs                       # Local SQLite persistence
├── error.rs                         # AppError / AppResult
├── lib.rs                           # Plugin + invoke_handler registration
└── main.rs
```

---

## Core Modules

### 1. Presentation — Tauri Commands

**Path:** `presentation/tauri/commands.rs`

**Responsibility:** IPC boundary only.

- Deserializes strongly typed DTOs from the frontend.
- Resolves `AppState` connections (`Arc<dyn DbDriver>`).
- Delegates to application services.
- Never embeds engine-specific SQL or UI concerns.

Compare-related commands:

| Command | Role |
|---------|------|
| `compare_schemas` | Schema diff (tables, views, routines, indexes, FKs, constraints) |
| `compare_data` | Row-level data diff via per-row hashes |
| `generate_sync_script` | SQL sync script from schema report + options |
| `pause_compare` / `resume_compare` / `cancel_compare` | Long-running job control via `SyncController` |

---

### 2. Connection & Session

**Paths:** `application/connection_service.rs`, `application/session_service.rs`, `state.rs`

**Responsibility:** Connection lifecycle and in-memory sessions.

- Creates engine-specific drivers through infrastructure factories.
- Optional SSH tunnel before connect (`ssh/`).
- Credentials decrypted only in backend (`infrastructure/crypto.rs`, keyring).
- Active sessions held in `AppState` as `ConnectionSession` → `Arc<dyn DbDriver>`.

---

### 3. Database Drivers

**Path:** `db/`

**Trait:** `DbDriver` (+ `DataReader` / `DataWriter`)

| Engine | File | Notes |
|--------|------|--------|
| PostgreSQL | `postgres.rs` | Schemas are first-class |
| MySQL / MariaDB | `mysql.rs` | Shared driver path |
| SQLite | `sqlite.rs` | File-based |
| SQL Server | `sqlserver.rs` | TDS |
| MongoDB | `mongodb.rs` | Collections / documents |
| Redis | `redis.rs` | Key-value capabilities |

**Capabilities (representative):** `execute`, `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_ddl`, `fetch_schemas`, `fetch_views`, `fetch_procedures`, `fetch_functions`, `fetch_triggers`, `fetch_foreign_keys`, `fetch_constraints`, keyset `fetch_rows` / `upsert_rows`.

Drivers preserve engine fidelity. Abstraction stops at the trait boundary.

---

### 4. Explorer Service

**Path:** `application/explorer_service.rs`

**Responsibility:** Object browsing support, dump/restore, integrity checks, SQL helpers.

- Selective dump (tables + data; views/triggers/procedures/functions DDL-only).
- Restore orchestration.
- Table size / integrity utilities used by the UI explorer.

---

### 5. DB Compare Module

**Path:** `application/compare/`

**Orchestrator:** `compare_service.rs` (`CompareService`)

Three use-cases:

1. **Schema Compare** — structural diff between two live connections.
2. **Data Compare** — content diff using PK + row hashes (chunked).
3. **Sync Script Generator** — engine-specific SQL from schema diffs.

```
application/compare/
├── compare_service.rs          # Orchestration + progress events + control checks
├── schema/
│   ├── normalizer.rs           # SQL normalize (DEFINER, whitespace, comments)
│   ├── table_comparator.rs     # Columns, engine, charset, collation
│   ├── index_comparator.rs
│   ├── fk_comparator.rs
│   ├── constraint_comparator.rs
│   ├── view_comparator.rs
│   ├── routine_comparator.rs   # Procedures + functions
│   └── trigger_comparator.rs
├── data/
│   ├── pk_resolver.rs          # PK or UNIQUE key for row identity
│   ├── hash_generator.rs       # Engine SQL for MD5/SHA row hashes
│   ├── row_comparator.rs       # Column-level diff for modified rows
│   └── diff_builder.rs         # Assemble DataReport
├── report/
│   └── generator.rs            # Full JSON report assembly
└── script_generator/
    └── generators/
        ├── mysql_generator.rs
        ├── postgres_generator.rs
        └── sqlite_generator.rs
```

#### Schema Compare flow

1. Resolve source/target drivers from connection IDs.
2. Compare tables → columns/metadata; then indexes, FKs, constraints per table.
3. Compare views, procedures, functions, triggers (normalized DDL hash where applicable).
4. Emit progress events; honor pause/cancel via `SyncController`.
5. Return `SchemaReport` (`models/compare.rs`).

`CompareStatus`: `equal` | `modified` | `missing` | `new`.

#### Data Compare flow

1. Resolve PK (or fallback unique key) per table (`pk_resolver`).
2. Compute row hashes in chunks on both sides (`hash_generator`) — table/column identifiers quoted per engine.
3. Classify rows: only-in-source, only-in-target, hash-mismatch.
4. For mismatches, fetch single rows and diff **common columns only** (`row_comparator`) so schema drift does not break SQL.
5. Build `DataReport` / `TableDataDiff`.

#### Sync Script generation

- Input: `SchemaReport` + `ScriptOptions`.
- Output: `SyncScript` with selectable `ScriptStatement`s.
- Generators are engine-specific (MySQL/MariaDB, PostgreSQL, SQLite).
- Frontend may prepend header comments (`USE` target, source/target names, timestamp); generation logic stays backend-owned.

#### Control plane

`SyncController` (`state.rs`): `RwLock<HashMap<String, SyncControl>>` shared pattern with Cross-DB Sync for pause / resume / cancel of long compare jobs.

---

### 6. Cross-DB Sync

**Path:** `application/sync/`

**Responsibility:** Pipeline-based data movement between engines (extract → transform → load), distinct from Compare’s schema/script focus.

- Strategies: full / incremental.
- Extractors: SQL / Mongo.
- Validators: schema diff + pipeline validation.
- Shares `SyncController` for job control.

---

### 7. Scheduler

**Path:** `infrastructure/scheduler/`

| File | Role |
|------|------|
| `job_engine.rs` | Poll loop, cron next-run, event emission |
| `executors.rs` | Backup, Report (JSON), CSV Export |

Jobs persisted via `storage.rs`; notifications emitted to the UI on completion/failure.

---

### 8. Storage & Audit

| Module | Path | Role |
|--------|------|------|
| Storage | `storage.rs` | Local SQLite: connections metadata, jobs, logs |
| Audit | `application/audit_service.rs` | Action / query audit trail |
| Auth / TOTP / Keyring | `auth_service`, `totp_service`, `keyring_service` | Local desktop security |

Credentials must never be logged or sent to the frontend in plaintext.

---

### 9. Models

**Path:** `models/`

Shared IPC DTOs only, including:

- Query / column / execution types
- `models/compare.rs` — `SchemaReport`, `DataReport`, `SyncScript`, diffs, options
- `models/sync.rs` — pipeline and capability types

No business-domain entities.

---

## Error Handling

- Unified `AppError` / `AppResult` (`error.rs`).
- Preserve engine context; do not leak stack traces or raw secrets over IPC.
- Fail fast at command boundary on invalid input.

---

## Security Boundaries

- Validate all command inputs at the IPC layer.
- Prefer parameterized queries; quote identifiers when dynamic SQL is required for metadata/compare.
- SSH credentials and DB passwords stay in Rust runtime only.
- No shared mutable connection state across engines.

---

## Golden Rule

The backend is a **deterministic multi-engine database orchestration runtime** exposed via Tauri commands — not an HTTP application backend.
)
