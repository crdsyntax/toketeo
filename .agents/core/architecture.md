# Architectural Principles (Toketeo DBA Client)

## Core Principles

These principles apply to the **Rust + Tauri + multi-database orchestration system**, not a traditional application backend.

---

### SOLID (Adapted to Rust + Tauri Runtime)

* **Single Responsibility Principle**
  Each module must have one clear responsibility:

  * Command Layer → IPC handling only
  * Application Layer → orchestration only
  * Infrastructure Layer → database engine interaction only

* **Open/Closed Principle**
  System must be extendable via:

  * new database drivers
  * new Tauri commands
    without modifying existing engine implementations.

* **Liskov Substitution Principle**
  All database drivers must be interchangeable via a shared Rust trait without breaking execution semantics.

* **Interface Segregation Principle**
  Drivers must implement only required capabilities:

  * query execution
  * metadata extraction
  * transaction support (if supported by engine)

* **Dependency Inversion Principle**
  High-level orchestration logic depends on abstractions (traits), not concrete database implementations.

---

### DRY (Strict in Engine Context)

* Shared logic is allowed only for:

  * connection pooling utilities
  * query execution helpers
  * result formatting utilities

Forbidden:

* abstracting away engine-specific metadata behavior
* forcing cross-engine query normalization
* duplicating “generic DB service layers” that hide engine differences

---

### KISS

* Prefer explicit engine-specific implementations over complex abstractions
* Avoid over-generalization of database behaviors
* Keep Tauri commands thin and deterministic
* Avoid unnecessary layers between command → driver execution

---

### Clean Architecture (Toketeo Adaptation)

Architecture must be strictly layered:

1. **Presentation Layer**

   * Tauri command interface
   * input validation
   * IPC boundary enforcement

2. **Application Layer**

   * orchestration of use-cases
   * coordination between drivers and metadata services

3. **Infrastructure Layer**

   * database drivers (PostgreSQL, MariaDB, SQLite, etc.)
   * connection pooling
   * query execution

4. **Domain Layer (Minimal)**

   * engine-agnostic types only:

     * QueryResult
     * ColumnMeta
     * ExecutionInfo

Forbidden:

* business domain modeling
* ORM-like entity systems
* application-specific domain rules

---

### DDD (Database-Oriented Interpretation)

DDD is applied ONLY as:

* modeling database engine concepts, not business entities
* respecting bounded contexts per database engine:

  * PostgreSQL context
  * MariaDB/MySQL context
  * SQLite context
  * SQL Server context
  * MongoDB context

Each engine is its own bounded context.

No shared domain model across engines.

---

## Constraints

### Forbidden Patterns

* `any` / untyped structures in system boundaries
* `unknown` in IPC contracts (must be explicit types instead)
* `SELECT *` in production query paths (unless explicitly justified for metadata introspection)
* circular dependencies across layers or drivers
* ORM-style entity exposure or persistence leakage

---

### Logic Separation Rule

* No database logic inside Tauri command handlers
* No orchestration logic inside drivers
* No UI logic inside backend layers
* No SQL construction inside presentation layer

Each layer must remain pure and isolated.

---

### Dependency Rules

* Application layer depends on abstractions (traits/interfaces)
* Infrastructure depends on concrete implementations
* Presentation depends only on application contracts

No reverse dependencies allowed.

---

### Entity Exposure Rule

* Database entities must never be exposed directly to frontend
* All outputs must be transformed into controlled DTO-like structures:

  * QueryResult
  * MetadataResponse
  * ExecutionResponse

No raw DB driver structs exposed across IPC boundary.

---

## System Integrity Rule

The system must preserve:

* engine fidelity (no normalization across DBs)
* deterministic execution behavior
* strict separation between orchestration and execution
* safe IPC boundary between frontend and backend

---

## Golden Rule

This is not an application backend.

It is a **multi-engine database orchestration runtime with strict architectural layering over Rust + Tauri**.
