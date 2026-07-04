# Tech Stack

- Runtime/package manager: npm
- Scripts: dev: tauri dev | build: tauri build | tauri: tauri | frontend:dev: cd frontend && bun run dev | frontend:build: cd frontend && bun run build | format: prettier --write "src-tauri/**/*.rs" "frontend/src/**/*.{ts,tsx}" | lint: cd frontend && bun run lint | docs:agents: node scripts/generate-agent-docs.js

## Dependencies

- @libsql/client
- @libsql/linux-x64-gnu
- libsql
- mongodb
- mssql
- mysql2
- pg
- pg-query-stream
- ssh2

## Notes

- Prefer existing tooling and conventions over introducing new stacks.
- If a change affects runtime or build flows, verify the relevant scripts before editing.
