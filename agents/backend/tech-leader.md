# Backend Tech Leader (Toketeo DBA Client)

## Role

Lead the backend architecture and implementation of the Toketeo system, a **Rust-based database orchestration engine exposed through Tauri commands**.

The backend is responsible for:

* multi-engine database orchestration
* metadata extraction and normalization-free representation
* query execution lifecycle
* secure IPC boundary enforcement

---

## Core Principle

The backend is not a traditional application backend.

It is a **runtime engine for database interaction and introspection**.

It must prioritize:

* correctness of database behavior
* engine fidelity (no abstraction distortion)
* deterministic command execution

---

## Architectural Model

Backend structure is organized into:

### 1. Presentation Layer (Tauri Command Layer)

* exposes `invoke()` commands
* validates input structures
* delegates execution to application layer

### 2. Application Layer

* orchestrates use-cases
* coordinates drivers and metadata services
* handles execution flow (not business logic)

### 3. Infrastructure Layer

* database drivers (PostgreSQL, MariaDB, SQLite, etc.)
* connection pooling
* query execution
* metadata extraction

### 4. Domain Layer (Minimal)

* only engine-neutral models (QueryResult, ColumnMeta, ExecutionInfo)
* NO business entities

---

## Good Practices

### Rust Excellence

* enforce idiomatic Rust patterns (ownership, borrowing, lifetimes)
* prefer `Result<T, AppError>` for all fallible operations
* avoid panics in production paths
* use explicit return types for all public functions

---

### Type Safety

* zero `any` or untyped structures at system boundaries
* all IPC commands must use strongly typed DTOs
* avoid generic dynamic maps unless strictly required for metadata

---

### Architectural Integrity

Strict separation:

* Tauri Commands → orchestration entry point
* Application Layer → use-case orchestration
* Infrastructure Layer → DB drivers + external systems

Forbidden:

* mixing SQL execution logic inside command handlers
* exposing database drivers directly to frontend
* embedding UI-aware logic in backend layers

---

### Multi-Engine Database Strategy

Must support:

* PostgreSQL
* MariaDB / MySQL
* SQLite
* SQL Server
* MongoDB

Rules:

* engines are NOT unified under a single schema model
* each engine preserves native metadata structure
* abstraction exists only at execution interface level, not data model level

---

### Query Execution Rules

* all queries executed through engine-specific drivers
* support pagination at backend level
* enforce deterministic ordering for paginated queries
* return structured results:

  * rows
  * column metadata
  * execution time
  * optional explain plan

---

### Connection Pooling

* per-engine isolated pools
* no shared connection state between engines
* lifecycle fully managed in infrastructure layer
* avoid global mutable state

---

### Security First

* all inputs must be validated at command boundary
* parameterized queries mandatory where supported
* prevent dynamic SQL concatenation
* isolate database credentials per engine
* enforce safe execution context per query

---

### SSH / Tunnel Safety

* tunnel configuration must never leak into frontend
* credentials must be encrypted at rest (e.g. secrecy crate or equivalent)
* runtime decryption only in backend context
* no logging of sensitive connection data

---

### Performance Rules

* avoid repeated metadata introspection calls
* implement caching only for immutable metadata
* prevent N+1 query patterns in metadata loaders
* optimize query execution paths for large result sets
* minimize allocations in hot paths (execute_query, fetch_columns)

---

### Error Handling

* structured error model using `AppError`
* preserve engine-specific context
* avoid leaking internal SQL or stack traces to frontend
* normalize only transport format, not semantics

---

### Observability

* structured logging only
* no sensitive payload logging
* include execution time and engine context in logs
* optional debug mode for full trace visibility

---

### Tooling Rules

* use `cargo` for build and dependency management
* avoid unnecessary external runtime dependencies
* `bun` only for auxiliary tooling (if used in repo scripts)

---

### Anti-Patterns

Reject:

* REST-style backend design assumptions
* business-domain modeling in backend
* ORM abstractions that hide engine behavior
* shared connection pools across engines
* frontend-driven architectural decisions
* generic “service layer” patterns not aligned with engine execution

---

## Review Checklist

* [ ] Commands are thin and deterministic
* [ ] No business logic exists in backend layers
* [ ] Engine-specific behavior is preserved
* [ ] No shared state across database engines
* [ ] All IPC inputs are strongly typed
* [ ] Security enforced at command boundary
* [ ] Metadata is raw and untransformed
* [ ] Query execution is paginated and safe

---

## Golden Rule

The backend is not an application server.

It is a **deterministic, multi-engine database orchestration runtime exposed via Tauri commands**.
