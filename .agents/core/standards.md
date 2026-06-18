# Global Standards (Toketeo DBA Client)

## Principles

These standards apply to the entire **Rust + Tauri + multi-database orchestration runtime**, including:

* frontend (React)
* IPC boundary (Tauri commands)
* backend runtime (Rust)
* database drivers (PostgreSQL, MariaDB, SQLite, MongoDB, SQL Server)

---

### SOLID (Adapted to Multi-Engine Runtime)

* **Single Responsibility Principle**
  Each component must have one responsibility:

  * Tauri commands → IPC boundary only
  * Application layer → orchestration only
  * Infrastructure layer → database execution only

* **Open/Closed Principle**
  System must be extensible via:

  * new database drivers
  * new Tauri commands
    without modifying existing engine implementations

* **Liskov Substitution Principle**
  Database drivers must be interchangeable via Rust traits without breaking execution semantics

* **Interface Segregation Principle**
  Drivers implement only required capabilities per engine (query, metadata, transactions)

* **Dependency Inversion Principle**
  High-level orchestration depends on abstractions, not concrete drivers

---

### DRY (Engine-Aware)

* Shared logic allowed only for:

  * connection pooling utilities
  * query execution helpers
  * execution result formatting

Forbidden:

* hiding engine-specific behavior behind generic abstractions
* normalizing metadata across different database engines
* duplicating ORM-style service layers

---

### KISS

* prefer explicit engine-specific logic over complex abstractions
* avoid unnecessary layers between command → application → driver
* keep Tauri commands minimal and deterministic
* avoid over-generalizing database behavior

---

### Clean Architecture (Toketeo Model)

Strict layered architecture:

1. **Presentation Layer**

   * Tauri IPC commands
   * input validation
   * DTO enforcement

2. **Application Layer**

   * orchestration of use cases
   * coordination of drivers and metadata services

3. **Infrastructure Layer**

   * database drivers (engine-specific implementations)
   * connection pooling
   * query execution

4. **Domain Layer (Minimal)**

   * only shared runtime types:

     * QueryResult
     * ColumnMeta
     * ExecutionInfo

No business domain modeling is allowed.

---

### DDD (Engine-Oriented Interpretation)

DDD is applied only to:

* database engine boundaries as bounded contexts:

  * PostgreSQL context
  * MariaDB/MySQL context
  * SQLite context
  * SQL Server context
  * MongoDB context

Each engine is a separate bounded context with:

* its own metadata model
* its own execution rules
* its own limitations

No shared universal database model is allowed.

---

## Rules

### Explicit Typing

* no `any` or `unknown` in system boundaries
* all IPC contracts must use strict types
* Rust types must be explicit in all public interfaces
* metadata structures must be strongly defined or explicitly structured

---

### Early Returns

* use guard clauses in Rust (`Result<T, AppError>`)
* fail fast on invalid IPC input
* avoid deep nesting in command execution flow

---

### Fail Fast Principle

* validate inputs immediately at IPC boundary
* reject malformed queries before reaching drivers
* do not defer validation to database layer
* stop execution on first invalid state detection

---

### Defensive Programming

* assume external databases are unreliable
* handle missing or inconsistent metadata gracefully
* avoid assumptions about schema completeness
* expect partial failures in multi-engine environments

---

### Logic Separation Rule

* no database logic in UI (React)
* no SQL execution in Tauri commands
* no orchestration logic in drivers
* no UI logic in backend runtime

Each layer must remain isolated and deterministic.

---

## Security

### Input Validation

* all inputs must pass DTO validation at IPC boundary
* reject malformed or unexpected payloads immediately
* ensure strict deserialization of all command inputs

---

### Secrets Management

* no secrets in code, logs, or IPC payloads
* credentials must never reach frontend layer
* runtime decryption only inside Rust backend
* SQLite local storage must not contain plaintext credentials

---

### RBAC Enforcement

* authorization must occur in Rust backend layer
* frontend state must never be trusted for access control
* permissions must be enforced per command execution

---

### SQL Injection Prevention

* all queries must use prepared statements where supported
* no dynamic SQL concatenation from user input
* metadata filters must be validated before query execution
* aggregation pipelines (MongoDB) must be sanitized

---

## Architectural Integrity Rules

* no circular dependencies between layers
* no cross-engine coupling
* no ORM abstractions hiding engine behavior
* no shared mutable global state
* no business logic in UI or command layer

---

## System Constraint

This system is a **deterministic multi-engine database orchestration runtime**, not an application backend.

All standards must preserve:

* engine fidelity (no normalization across DBs)
* strict layer separation
* safe IPC boundary
* predictable execution behavior

---

## Golden Rule

Correctness, isolation, and determinism always override convenience, abstraction, or framework conventions.
