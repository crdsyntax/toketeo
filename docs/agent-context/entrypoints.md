# Entrypoints

## Process / build

| Path | Role |
|------|------|
| `package.json` | Root scripts (`dev`, `build`, `lint`, …) |
| `src-tauri/Cargo.toml` | Rust crate + Tauri config linkage |
| `src-tauri/tauri.conf.json` (or equivalent) | Tauri app config |
| `frontend/package.json` | Frontend scripts and deps |
| `src-tauri/src/main.rs` | Binary entry |
| `src-tauri/src/lib.rs` | App setup + **command registration** |
| `frontend/src/main.tsx` | UI bootstrap |
| `frontend/src/App.tsx` | Route table |

## IPC (backend)

All desktop DB operations enter through:

```
presentation/tauri/commands.rs
```

Registered in `lib.rs` via `invoke_handler`.

### Compare commands (representative)

| Command | Service |
|---------|---------|
| `compare_schemas` | `CompareService::compare_schemas` |
| `compare_data` | `CompareService::compare_data` (and related) |
| `generate_sync_script` | Script generators under `application/compare/script_generator/` |
| `pause_compare` / `resume_compare` / `cancel_compare` | `SyncController` in `state.rs` |

Other domains (non-exhaustive): connection CRUD/connect, query execute, schema/explorer metadata, dump/restore, scheduler CRUD, sync pipeline, audit, auth/session/totp.

## UI routes (`App.tsx`)

| Route | Page |
|-------|------|
| `/` | Connections |
| `/explorer` | Explorer |
| `/query` | Query editor |
| `/diagram` | Diagram |
| `/compare` | **DB Compare** |
| `/cross-db-sync` | Cross-DB sync |
| `/scheduler` | Scheduler |
| `/assistant` | Assistant |
| `/audit` | Audit |
| `/settings`, `/security` | Settings |

## Suggested starting points for agents

1. Identify layer: UI vs command vs application vs driver.
2. Read matching doc: `docs/backend-modules.md` or `docs/frontend-modules.md`.
3. Trace one vertical (e.g. Compare): `ComparePage` → `compareStore` → `compare.service` → command → `CompareService` → `db::*`.
4. Keep DTO parity: `models/compare.rs` ↔ `types/compare.ts`.
5. Verify with `cargo check --lib` and frontend typecheck/lint before finishing.
)
