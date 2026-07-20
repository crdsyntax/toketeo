# Database Driver System

Toketeo database access is implemented in **Rust** under `src-tauri/src/db/`. Drivers implement shared traits and are selected per connection. The frontend never talks to engine client libraries directly.

> Legacy docs referring to `src/connection/drivers/*.ts` or NestJS `DatabaseDriver` are obsolete.

## Traits

**Path:** `src-tauri/src/db/mod.rs`

### `DbType`

`postgres` | `mariadb` | `mysql` | `sqlite` | `mongodb` | `sqlserver` | `redis`

### `DataReader`

- `fetch_rows` — keyset/paginated read
- `count_rows`

### `DataWriter`

- `upsert_rows` → `UpsertResult { affected, skipped }`

### `DbDriver` (`DataReader + DataWriter`)

Core capabilities (engine support varies; unsupported ops must fail clearly, not fake success):

| Capability | Typical use |
|------------|-------------|
| `db_type()` | Engine identity |
| `execute` / `execute_with_schema` | Ad-hoc SQL / commands |
| `fetch_tables` / `fetch_columns` / `fetch_indexes` | Explorer + Compare |
| `fetch_schemas` / `fetch_views` / `fetch_procedures` / `fetch_functions` / `fetch_triggers` | Metadata |
| `fetch_foreign_keys` / `fetch_constraints` | Schema compare |
| `fetch_ddl` | DDL display / routine compare |
| Sync helpers | Capabilities via `DriverCapabilities` where applicable |

Exact method signatures live in `db/mod.rs` — always read the trait before extending it.

## Implementations

| Engine | File | Notes |
|--------|------|--------|
| PostgreSQL | `db/postgres.rs` | Schemas are first-class; no special-case “public only” in UI |
| MySQL / MariaDB | `db/mysql.rs` | Shared implementation path |
| SQLite | `db/sqlite.rs` | File DB; limited ALTER semantics for sync scripts |
| SQL Server | `db/sqlserver.rs` | TDS |
| MongoDB | `db/mongodb.rs` | Collections/documents; not relational metadata parity |
| Redis | `db/redis.rs` | Key-value; limited relational compare applicability |

Factory / wiring: `infrastructure/drivers/` + connection application services. Sessions held as `Arc<dyn DbDriver>` in `AppState`.

## Design rules (Tech Leader)

1. **Engine fidelity** — preserve native metadata; do not force a universal schema model.
2. **Trait segregation** — optional capabilities stay optional; do not stub lying implementations.
3. **No driver exposure to UI** — only DTOs cross IPC.
4. **No SQL in command handlers** — commands call application services that use drivers.
5. **Identifier safety** — quote identifiers per engine when building dynamic metadata/compare SQL.
6. **Isolation** — no shared mutable connection state across engines.

## Consumers

| Consumer | How drivers are used |
|----------|----------------------|
| Explorer / query | Metadata fetch + `execute` |
| Dump / restore | DDL + data extraction via explorer service |
| **DB Compare** | Dual drivers (source/target); schema comparators + row hash SQL |
| Cross-DB Sync | `DataReader` / `DataWriter` pipelines |
| Scheduler backup | Often external CLI tools, not always `DbDriver` |

## Adding a new engine

1. Add `DbType` variant (serde + display).
2. Implement `DbDriver` (+ reader/writer) in `db/<engine>.rs`.
3. Register in driver factory / connection connect path.
4. Extend frontend `DatabaseType` / connection form icons only as labels — no metadata invention.
5. Decide Compare/Sync support explicitly (schema compare may be N/A for non-relational engines).
6. Update this doc + `docs/backend-modules.md`.
7. `cargo check --lib` and a manual connect smoke test.

## Adding a capability to existing engines

1. Extend the trait with a default that returns a clear `AppError` if not applicable.
2. Implement for engines that support it.
3. Thread through application service + command + TS types if IPC-visible.
4. Avoid “lowest common denominator” APIs that erase engine behavior.

## Golden Rule

Drivers are **engine-specific execution adapters**. Orchestration lives in `application/`; abstraction stops at the trait boundary.
)
