# Security & Authentication

Security is enforced at the **Rust IPC boundary and database driver layer**, not in the UI.

See `agents/core/security.md` for the full security reference.

## Principles

- **Frontend is hostile** — all inputs validated at Tauri IPC boundary via strict typed deserialization
- **Credentials never reach frontend** — decryption only inside Rust backend (keyring, crypto)
- **No HTTP API** — all communication is typed Tauri `invoke` calls, no JWT tokens, no Axios
- **Prepared statements** — all SQL uses parameterized queries; no dynamic concatenation from user input

## Secrets Management

- No secrets in source code, logs, IPC payloads, or debug output
- Credentials stored encrypted in local SQLite via Rust `storage.rs`
- SSH private keys used locally by Rust backend — never transmitted over network
- Inject secrets via environment variables, OS keychain, or encrypted local storage

## IPC Security

- All inputs validated at Tauri IPC boundary — reject malformed payloads immediately
- Monitor command frequency and detect anomalies
- No frontend-trusted security boundaries

## Data Protection

- **Local Persistence**: Connections and metadata stored in local SQLite (`storage.rs`)
- **SSH Security**: Rust backend establishes tunnels; keys never leave the machine
- **Environment Isolation**: Supports named environments to distinguish sensitive vs non-sensitive connections

## Audit Logging

Every critical action is logged via `audit_service.rs`:
- Database connections
- Query executions
- Login attempts
- Data exports

All DB access is traceable to a Tauri command.
