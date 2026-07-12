# Database Architect (Toketeo DBA Client)

## Purpose

Design and maintain the database abstraction layer inside a Rust-based database orchestration engine exposed via Tauri commands.

This system is NOT an ORM backend.

It is a multi-engine database runtime.

---

## Core Responsibility

Define how the system interacts with multiple database engines:

* PostgreSQL
* MariaDB / MySQL
* SQL Server
* SQLite
* MongoDB

Through a unified Rust abstraction layer.

---

## Absolute Architecture Rule

There are NO repositories.

There is NO ORM layer.

There is NO application persistence layer.

Persistence is the database itself.

This system only orchestrates access.

---

## Driver Abstraction Model

Each database engine must implement a Rust trait-based driver abstraction.

Example conceptual model:

* PostgresDriver
* MariaDBDriver
* SQLServerDriver
* SQLiteDriver
* MongoDriver

Each driver is responsible for:

* connection management
* query execution
* metadata introspection
* engine-specific behavior

---

## Driver Interface Rule

Drivers must expose a consistent interface at the Rust level.

Example (conceptual):

* connect
* disconnect
* execute_query
* fetch_schemas
* fetch_tables
* fetch_columns
* fetch_indexes
* fetch_foreign_keys

Important:

This is NOT a TypeScript interface.

It is a Rust trait contract.

---

## Connection Pooling Rule

Each driver is responsible for:

* engine-specific pooling strategy
* connection lifecycle management
* isolation between connections

Pooling is NOT handled at frontend level.

Pooling is NOT abstracted into a generic ORM layer.

---

## Transaction Rule

Transactions are engine-specific.

Drivers must:

* support BEGIN / COMMIT / ROLLBACK where applicable
* handle engine differences (e.g. MongoDB limitations)
* ensure consistency within a single execution context

---

## Query Execution Rule

All queries must:

* be executed through the appropriate driver
* respect parameter binding (when supported)
* return structured results (rows + metadata + execution info)
* support pagination when required by backend layer

---

## Metadata Rule

Drivers must expose:

* schemas
* tables
* views
* columns
* indexes
* constraints
* foreign keys
* procedures/functions (if supported)

Metadata must be extracted from native engine catalogs.

No normalization across engines.

---

## Anti-Pattern Rules

Reject designs that:

* introduce ORM layers (TypeORM, Sequelize-style patterns)
* create repository abstractions
* assume relational behavior for non-relational engines
* unify all engines into a single abstract model
* push database logic into TypeScript layer

---

## Multi-Driver Rule

The system must support multiple active drivers simultaneously.

Each connection is isolated per engine.

No shared state between drivers.

---

## Type Safety Rule

Rust must enforce:

* explicit types for all driver outputs
* structured error types per engine
* strict command input/output contracts

No dynamic or loosely typed database responses.

---

## Security Rule

Drivers must ensure:

* safe parameter binding
* isolation between queries
* prevention of cross-database leakage
* controlled execution context per connection

---

## Tauri Integration Rule

Drivers are consumed by:

* Tauri command layer only

Frontend does NOT interact with drivers directly.

---

## Golden Rule

This system does not store data.

It orchestrates and exposes access to external database engines through isolated drivers.
