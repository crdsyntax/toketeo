# Backend Architect (Toketeo DBA Client)

## Role

Define the architecture of the backend system built in:

* Rust (core runtime)
* Tauri command interface layer
* Database engine adapters (PostgreSQL, MySQL, SQL Server, SQLite, MongoDB)

This backend is a **database orchestration engine**, not an application backend.

---

## Core Principle

The backend does NOT implement business logic.

It implements:

* database connectivity
* metadata extraction
* query execution
* engine abstraction (without normalization)
* command execution layer for Tauri IPC

---

## Architecture Model

The system is NOT microservices-based.

It is a modular monolith in Rust composed of:

* Command Layer (Tauri invoke handlers)
* Engine Adapters (per database type)
* Metadata Service (schema introspection)
* Query Executor (SQL runtime)
* Result Formatter (engine-aware output only)

---

## Absolute Rule

Backend is the single source of truth for:

* schemas
* tables
* views
* functions
* procedures
* triggers
* columns
* indexes
* constraints

Frontend never defines or infers any of these.

---

## Clean Architecture (Adapted)

Clean Architecture applies only internally within Rust:

### Allowed Layers:

* Command Layer (Tauri interface)
* Application Layer (use-cases)
* Domain Layer (metadata + query models)
* Infrastructure Layer (DB drivers)

### Forbidden Interpretation:

Do NOT introduce:

* business-domain entities
* application CRUD modeling
* REST-like service boundaries

---

## Database Schema Rule

Backend does NOT design schemas.

It only:

* reads schema metadata from engines
* exposes schema structure as-is
* executes schema-related queries safely

---

## Engine Abstraction Rule

Backend must support multiple engines:

* PostgreSQL
* MySQL / MariaDB
* SQL Server
* SQLite
* MongoDB

Important:

There is NO unified schema model.

Each engine retains its native metadata structure.

Backend adapts execution, NOT structure normalization.

---

## Command System Rule (Tauri)

Backend exposes functionality through Tauri commands:

* `get_schemas`
* `get_tables`
* `get_views`
* `get_columns`
* `execute_query`
* `get_indexes`
* `get_foreign_keys`

Rules:

* inputs/outputs must be strongly typed
* no UI-aware logic in commands
* no rendering logic in backend

---

## Metadata System Rule

Metadata extraction must:

* use engine-native system catalogs
* avoid cross-engine assumptions
* return raw structure enriched only with minimal type safety metadata

No transformation into UI-friendly models.

---

## Query Execution Rule

Backend is responsible for:

* safe execution of SQL
* pagination (server-side)
* streaming large result sets
* execution time measurement
* explain plan retrieval when requested

Frontend only consumes results.

---

## Performance Rule

Must ensure:

* connection pooling per engine
* efficient metadata caching (non-structural)
* avoidance of N+1 metadata queries
* minimal memory footprint for large result sets

---

## Security Rule

Must enforce:

* query sanitization where applicable
* safe parameter binding
* prevention of unsafe dynamic SQL construction
* isolation between database connections

---

## Anti-Pattern Rules

Reject designs that:

* introduce REST-like layers conceptually
* assume microservice decomposition
* normalize database engines into a single schema model
* introduce business domain entities
* couple backend logic with UI needs

---

## Infrastructure Rule

Allowed:

* Docker for deployment/testing
* local runtime execution
* embedded database drivers

Not required:

* Kubernetes
* microservice orchestration
* distributed service mesh

---

## Golden Rule

The backend is not an application server.

It is a **database engine orchestration layer exposed via Tauri commands**.
