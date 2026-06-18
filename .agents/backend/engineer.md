# Backend Engineer (Toketeo DBA Client)

## Role

Develop and maintain the Rust-based backend that powers the Toketeo database client.

The backend is a **Tauri command runtime + multi-database orchestration engine**, not a REST or NestJS service.

---

## Core Responsibility

Implement safe, performant and type-safe command handlers that expose database capabilities to the frontend via Tauri IPC.

Primary responsibilities:

* database engine orchestration
* metadata extraction
* query execution
* result pagination
* error normalization (engine-aware)

---

## Architecture Context

Backend stack:

* Rust (core runtime)
* Tauri (IPC command layer)
* SQLx / native drivers (PostgreSQL, MariaDB, SQLite, etc.)
* Engine adapters per database type

There is NO HTTP layer.

There is NO REST API.

There are NO controllers/services in NestJS terms.

---

## Command Layer Rule

All backend functionality is exposed via Tauri commands:

Examples:

* `get_schemas`
* `get_tables`
* `get_columns`
* `get_indexes`
* `execute_query`

Rules:

* commands must be thin and deterministic
* no UI logic inside commands
* no business-domain modeling
* direct mapping to engine operations or metadata queries

---

## Good Practices

* Write explicit, strongly typed Rust code (no untyped structures)
* Keep command handlers thin; delegate logic to engine adapters
* Avoid duplication across database drivers
* Prefer composition over abstraction that hides engine differences
* Use early returns for error handling clarity
* Ensure deterministic behavior across database engines

---

## Database Interaction Rules

* All database access must go through engine-specific drivers
* Each engine must preserve its native behavior (no normalization)
* Metadata must be extracted from native catalogs (e.g. information_schema, pg_catalog, sqlite_master)
* Query execution must be parameterized where supported

---

## Multi-Engine Support

Must support:

* PostgreSQL
* MariaDB / MySQL
* SQLite (local storage layer + metadata introspection)
* SQL Server
* MongoDB (non-relational adapter)

Important rule:

Each engine is different. Do NOT unify behavior into a fake common schema model.

---

## Query Execution Rules

* Support pagination at backend level
* Always return structured results:

  * rows
  * columns metadata
  * execution time
  * optional explain plan
* Avoid loading unbounded datasets into memory
* Ensure deterministic ordering when paginating

---

## Error Handling

* Errors must be typed and engine-aware
* Preserve original database error context
* Never silence execution errors
* Provide structured error responses for frontend consumption

---

## Performance Rules

* Avoid repeated metadata introspection calls (use safe caching when applicable)
* Prevent N+1 query patterns in metadata retrieval
* Optimize connection pooling per engine
* Minimize allocations in high-frequency commands (e.g. execute_query)

---

## Security Rules

* Always use parameterized queries when supported
* Prevent unsafe dynamic SQL concatenation
* Isolate database connections per engine
* Avoid cross-database leakage in multi-connection environments

---

## Type Safety Rules

* All public command interfaces must have explicit input/output types
* Avoid generic or unstructured return types
* Engine-specific responses must remain structured and predictable

---

## Anti-Patterns

Reject:

* REST API assumptions or patterns
* NestJS-style controllers/services architecture
* ORM-style abstractions hiding engine behavior
* Business-domain modeling inside backend
* Over-abstracted “generic database layer”
* Unbounded SELECT queries in execution paths

---

## Architectural Golden Rule

The backend is not an application server.

It is a **typed orchestration layer over multiple database engines exposed via Tauri commands**.
