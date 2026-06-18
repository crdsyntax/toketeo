# Test Engineer (Toketeo DBA Client)

## Purpose

Define and enforce testing strategy for a **Rust + Tauri multi-database orchestration runtime**, covering:

* Tauri IPC command layer
* application orchestration layer
* database drivers (PostgreSQL, MariaDB, SQLite, MongoDB, SQL Server)
* frontend (React + TypeScript)

---

## Core Responsibility

Ensure system correctness through:

* deterministic unit tests (Rust)
* integration tests for database drivers
* IPC contract validation tests (Tauri commands)
* frontend type and UI behavior tests (where applicable)

---

## Testing Strategy

### 1. Unit Tests (Rust Core)

Scope:

* application orchestration logic
* query execution helpers
* metadata parsing
* error handling (`AppError`)

Rules:

* test must be deterministic
* no dependency on external DB unless mocked
* engine-specific behavior must be tested in isolation

---

### 2. Integration Tests (Database Drivers)

Scope:

* MariaDB driver correctness (fully supported baseline)
* PostgreSQL metadata extraction (schemas, tables, columns)
* MongoDB collection/document handling
* SQLite embedded execution
* SQL Server compatibility layer (if enabled)

Rules:

* each engine must have isolated test suite
* no cross-engine assumptions allowed
* connection pooling must be tested under load conditions

---

### 3. IPC Contract Tests (Tauri Layer)

Scope:

* validate all commands:

  * input validation
  * output structure
  * error mapping

Rules:

* all Tauri commands must be tested as black-box interfaces
* payloads must be strictly typed
* invalid input must be explicitly tested (fail-fast behavior)

---

### 4. Frontend Tests (React + TypeScript)

Scope:

* UI rendering correctness
* state transitions (Zustand / TanStack Query)
* Monaco editor integration behavior
* explorer state persistence

Rules:

* no business logic testing in UI components
* services must be tested separately
* hooks must be tested in isolation

---

## Critical Testing Rules

### Regression Policy

* every bug fix MUST include a regression test
* no exception
* regression test must reproduce original failure condition

---

### Feature Coverage Policy

* every new feature MUST include:

  * unit tests (Rust or TS depending on layer)
  * integration test if DB interaction exists
  * IPC validation test if command is affected

---

### Isolation Rules

* tests must not depend on shared global state
* database tests must use isolated connections or containers
* no test may rely on execution order

---

## Database Testing Strategy

### MariaDB (Primary Baseline)

* schema introspection validation
* query execution correctness
* transaction integrity tests

---

### PostgreSQL

* schema discovery correctness (critical current gap)
* pg_catalog + information_schema validation
* partial metadata fallback handling

---

### MongoDB

* collection listing
* document structure inference
* query execution correctness (find, aggregate)

---

### SQLite

* embedded execution correctness
* local persistence validation
* transaction handling

---

### SQL Server

* connectivity validation
* query execution smoke tests
* metadata compatibility checks

---

## Performance Testing

Must validate:

* large dataset rendering (>1000 rows pagination rule)
* metadata caching effectiveness
* connection pool stability under load
* query execution latency thresholds

---

## Error Handling Tests

Must cover:

* invalid SQL queries
* malformed IPC payloads
* missing schema/table scenarios
* connection failures
* transaction rollback scenarios

---

## Coverage Requirements

* critical backend logic: high coverage mandatory
* database drivers: at least functional coverage for core operations
* IPC layer: full contract coverage required
* UI: behavior-based coverage, not implementation coverage

---

## Anti-Pattern Rules

Reject tests that:

* depend on real production databases
* rely on execution order
* do not assert meaningful outcomes
* test implementation instead of behavior
* mix multiple engine behaviors in one test case

---

## Tooling Expectations

* Rust:

  * `cargo test`
  * optional integration test harness with dockerized DBs

* Frontend:

  * Vitest / Jest (as applicable)
  * React Testing Library for UI behavior
  * MSW for API/IPC mocking

---

## Golden Rule

Tests must validate **deterministic correctness of a multi-engine database orchestration system**, not framework behavior or UI implementation details.
