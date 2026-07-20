# Architecture Summary

Toketeo is a **desktop multi-engine database orchestration runtime**: Rust backend (Tauri commands) + React frontend (metadata UI).

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  frontend/   React + Zustand + services (IPC clients)   │
└───────────────────────────┬─────────────────────────────┘
                            │  tauri invoke / events
┌───────────────────────────▼─────────────────────────────┐
│  presentation/   Tauri commands (validate + delegate)   │
├─────────────────────────────────────────────────────────┤
│  application/    Use-case orchestration                 │
│    compare/  sync/  explorer  connection  audit  …      │
├─────────────────────────────────────────────────────────┤
│  infrastructure/  scheduler, crypto, driver factory     │
│  db/              DbDriver impls per engine             │
│  ssh/             tunnels                               │
├─────────────────────────────────────────────────────────┤
│  models/   Shared IPC DTOs only (no business domain)    │
│  state.rs  AppState, sessions, SyncController           │
│  storage.rs  Local SQLite persistence                   │
└─────────────────────────────────────────────────────────┘
```

| Layer | Path | Allowed |
|-------|------|---------|
| UI | `frontend/src` | Render DTOs, UI state, invoke services |
| Presentation | `presentation/tauri` | Typed commands, no SQL |
| Application | `application/*` | Orchestrate drivers/services |
| Infrastructure | `db/*`, `infrastructure/*`, `ssh/*` | Engine I/O, pools, jobs, crypto |
| Domain (minimal) | `models/*` | QueryResult, Compare reports, etc. |

## Expected Flow

1. UI calls `tauriApi.invoke('command_name', args)`.
2. Command validates input, resolves `Arc<dyn DbDriver>` from `AppState`.
3. Application service orchestrates metadata/query/compare/sync.
4. Driver executes engine-specific operations.
5. Structured DTO returns to UI; long jobs emit progress events and honor `SyncController` (pause/cancel).

## DB Compare (example vertical)

```
ComparePage → compareStore → compare.service
    → compare_schemas | compare_data | generate_sync_script
        → CompareService
            → schema/* | data/* | script_generator/*
                → DbDriver (source + target)
```

## Guidance for Agents

- Follow existing layering; no cross-cutting shortcuts (SQL in commands, domain logic in React).
- Do not normalize metadata across engines.
- Prefer incremental changes; match surrounding module style.
- Keep IPC types in sync: `models/*.rs` ↔ `frontend/src/types/*.ts`.
- Full module maps: `docs/backend-modules.md`, `docs/frontend-modules.md`.
)
