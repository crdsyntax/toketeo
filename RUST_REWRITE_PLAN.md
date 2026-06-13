# Implementation Plan: Toketeo Rust Rewrite (Tauri Migration)

## Objective
Rewrite the Toketeo database client and administration panel using **Rust** and **Tauri** to improve performance, reduce memory footprint, and leverage Rust's type safety and concurrency model.

## Current Architecture
- **Desktop Shell**: Electron
- **Backend**: NestJS (Node.js) running as a sidecar process.
- **Frontend**: React (TypeScript) + Vite.
- **Communication**: HTTP REST + Socket.io.

## Target Architecture
- **Desktop Shell**: Tauri 2.0
- **Backend (Core)**: Rust (Tauri Commands & IPC).
- **Frontend**: React (TypeScript) + Vite (kept from the original project, with API migration).
- **Communication**: Tauri IPC (Commands/Events).

---

## Phase 1: Environment Setup & Foundation
1.  **Initialize Tauri**:
    - Run `bun tauri init` in the root.
    - Configure `tauri.conf.json` to point to the `frontend/` directory.
2.  **Rust Workspace Setup**:
    - Organize the `src-tauri` directory.
    - Add essential crates: `tokio`, `serde`, `serde_json`, `sqlx`, `tracing`, `tauri-plugin-shell`, `tauri-plugin-log`.
3.  **Project Restructuring**:
    - Move NestJS source to `backup/backend`.
    - Prepare `src-tauri/src` for modular Rust implementation.

## Phase 2: Core Backend Implementation (Rust)
1.  **State Management**:
    - Implement a thread-safe global state for managing database connections and SSH tunnels using `std::sync::Arc` and `tokio::sync::Mutex`.
2.  **Database Driver Layer**:
    - Implement a generic database interface (Trait) in Rust.
    - Implement specialized drivers using:
        - `sqlx` for MySQL, PostgreSQL, and SQLite.
        - `mongodb` crate for MongoDB support.
        - `tiberius` for Microsoft SQL Server.
3.  **SSH Tunneling**:
    - Port SSH logic using the `ssh2` or `russh` crate.
    - Ensure tunnels can be established and maintained as background tasks.
4.  **Logging & Audit**:
    - Use `tracing` for structured logging.
    - Implement the audit trail logic directly in Rust.

## Phase 3: Tauri Commands & API Layer
1.  **Porting Controllers**:
    - Convert NestJS controllers into Tauri Commands (`#[tauri::command]`).
    - Key command groups:
        - `connection_commands`: Create, test, and manage DB connections.
        - `query_commands`: Execute SQL/NoSQL queries.
        - `explorer_commands`: Fetch schemas, tables, and metadata.
        - `auth_commands`: Handle local authentication (if needed).
2.  **Error Handling**:
    - Define a custom `Result` type and `Error` enum that implements `serde::Serialize` for seamless IPC error reporting.

## Phase 4: Frontend Migration
1.  **API Client Refactoring**:
    - Replace `axios` calls with `@tauri-apps/api/core` (invoke).
    - Adapt stores (Zustand) to use Tauri Commands.
2.  **Socket.io to Tauri Events**:
    - Replace Socket.io logic with Tauri Events (`emit`, `listen`) for real-time updates (e.g., query progress, logs).
3.  **Monaco Editor Integration**:
    - Ensure Monaco continues to work within the Tauri WebView (WebKit/WebView2).

## Phase 5: Security & Optimization
1.  **Security DevOps**:
    - Use Tauri's allowlist to restrict access to system APIs.
    - Implement secure credential storage using `keyring-rs`.
2.  **Performance Tuning**:
    - Optimize memory usage by leveraging Rust's ownership model.
    - Use `tokio` streams for large dataset exports (CSV/JSON).

## Phase 6: Testing & Validation (QA)
1.  **Unit Testing**:
    - Comprehensive Rust unit tests for database drivers and SSH logic.
2.  **Integration Testing**:
    - Use Tauri's testing framework to simulate IPC commands.
3.  **E2E Testing**:
    - Update Playwright/Cypress tests to work with the Tauri environment.

---

## Technical Stack Recommendation
- **Framework**: Tauri 2.0
- **Database**: `sqlx` (Async, Compile-time checked queries).
- **SSH**: `ssh2-rs`
- **Frontend**: React 19 + TypeScript (Shared).
- **State**: `tokio::sync::RwLock` for shared connection pool.
- **Serialization**: `serde`
