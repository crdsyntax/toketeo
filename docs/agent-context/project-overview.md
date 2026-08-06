# Project Overview

- **Name:** Toketeo
- **Type:** Cross-platform desktop database client (Tauri)
- **Tagline:** Database administration with optional RPG-style progression (XP, levels, unlocks)
- **Root:** repository root (`package.json`, `src-tauri/`, `frontend/`)
- **Package managers:** Bun (JS), Cargo (Rust)

## Main entry files

| File | Role |
|------|------|
| `src-tauri/src/main.rs` | Process entry |
| `src-tauri/src/lib.rs` | Tauri builder, plugins, `invoke_handler` |
| `frontend/src/main.tsx` | React mount |
| `frontend/src/App.tsx` | Routes |
| `package.json` / `frontend/package.json` / `src-tauri/Cargo.toml` | Tooling & deps |

## Top-level folders

| Folder | Role |
|--------|------|
| `src-tauri/` | Rust backend (commands, drivers, compare, sync, scheduler) |
| `frontend/` | React UI |
| `docs/` | Human + agent documentation |
| `agents/` | AI role instructions (tech leader, engineer, QA, …) |
| `scripts/` | Aux tooling (e.g. agent doc generation) |
| `data/` | Local/runtime data if present |

## Feature surface (high level)

- Multi-engine connections + SSH tunnels
- Object explorer, query editor (Monaco), dump/restore
- **DB Compare** — schema compare, data compare, sync script generator
- Cross-DB sync pipelines
- Query scheduler (backup / report / CSV)
- Audit log, assistant hub, gamification unlocks
- Schema diagram

## Important context for agents

- Prefer existing architecture over new abstractions.
- Backend is an orchestration runtime, not a Nest/HTTP app.
- Frontend must not invent database semantics.
- Load only relevant files under `agents/` per `AGENTS.md`.
- Process: analyze → plan → list files → wait approval → one change → stop.
)
