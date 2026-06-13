# Test Plan: Rust Backend & Tauri IPC

## Objective
Validate the correctness, performance, and reliability of the new Rust-based backend and its communication with the frontend via Tauri IPC.

## Scope
1. **Core Rust Logic**: Error handling and model serialization.
2. **Database Drivers**: PostgreSQL and MySQL connection and query execution.
3. **Application State**: Connection management (add/get/remove).
4. **Tauri Commands**: Integration of IPC commands (`connect`, `execute_query`, etc.).

## Test Suites

### 1. Unit Tests (Rust)
- **Location**: `src-tauri/src/tests/` (or inline in modules).
- **Cases**:
    - `AppError` serialization to JSON.
    - `AppState` thread-safe operations (concurrent adds/removes).
    - URL construction for different DB types.

### 2. Integration Tests (Database)
- **Requirement**: Local or Dockerized Postgres/MySQL instances.
- **Cases**:
    - Connection success/failure (invalid credentials).
    - Basic `SELECT 1` execution.
    - Result mapping (columns and rows to `QueryResult`).
    - Table listing (`get_tables`).

### 3. IPC Integration Tests
- **Requirement**: `tauri-test` utilities.
- **Cases**:
    - `invoke('connect', ...)` returns a valid UUID.
    - `invoke('execute_query', ...)` handles database errors gracefully.

## Execution Strategy
1. Implement Rust unit tests for `AppState` and `AppError`.
2. Implement mock-based tests for `DbDriver` traits.
3. (Optional) Run `cargo test` once the environment allows.
