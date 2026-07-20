# Tech Stack

## Runtime

| Layer | Stack |
|-------|--------|
| Desktop shell | Tauri 2 |
| Backend | Rust (edition as in `src-tauri/Cargo.toml`) |
| Frontend | React, TypeScript, Vite, Tailwind |
| Package managers | Bun (JS), Cargo (Rust) |
| Local persistence | SQLite via Rust (`storage.rs`) |

**Not the active stack:** NestJS, Electron main process for DB ops, Axios REST API for core commands.

> Root `package.json` may still list legacy Node DB drivers (`mysql2`, `pg`, etc.) and Electron-related devDeps from earlier iterations. **Authoritative DB access is Rust** under `src-tauri/src/db/`.

## Scripts (root `package.json`)

| Script | Purpose |
|--------|---------|
| `dev` | `tauri dev` — full app |
| `build` | `tauri build` |
| `frontend:dev` | Vite only |
| `frontend:build` | Frontend production bundle |
| `lint` | Frontend ESLint |
| `format` | Prettier on `src-tauri/**/*.rs` and `frontend/src/**/*.{ts,tsx}` |
| `docs:agents` | Regenerate agent-context stubs (`scripts/generate-agent-docs.js`) |

## Backend crates (representative)

Defined in `src-tauri/Cargo.toml` — typically include Tauri plugins, async runtime (tokio), serde, engine clients (e.g. postgres/mysql/sqlite/mongodb/tiberius/redis as configured), SSH, crypto/keyring-related deps.

Always read `Cargo.toml` before adding dependencies.

## Frontend packages (representative)

Defined in `frontend/package.json` — React Router, Zustand, TanStack Query, Monaco, Tailwind, `@tauri-apps/api`.

## Engines supported (Rust drivers)

- PostgreSQL
- MySQL / MariaDB
- SQLite
- SQL Server
- MongoDB
- Redis

## Notes for Agents

- Prefer existing tooling; do not introduce a second IPC or HTTP API for core DB features.
- If a change affects build/runtime, verify `bun run dev` / `cargo check --lib` / frontend `tsc` or lint.
- Architecture docs: `docs/backend-modules.md`, `docs/frontend-modules.md`, `docs/database-drivers.md`.
)
