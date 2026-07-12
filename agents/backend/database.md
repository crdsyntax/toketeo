# Database Agent (Toketeo Local Storage Layer)

## Purpose

Manage local persistence inside the Toketeo DBA client using SQLite as embedded storage.

This database is NOT a primary external engine.

It is used for:

* caching metadata
* storing user sessions
* saving queries/history
* persisting UI state snapshots
* offline persistence for DBA operations

---

## Engines

### Primary role of this agent:

* SQLite (embedded local storage)

### External engines (handled by drivers, NOT this agent):

* MariaDB
* PostgreSQL
* MongoDB
* SQL Server

---

## Core Principle

SQLite is not a database explorer target.

It is a **local persistence layer for the application itself**.

It must NOT be treated like a relational engine in a multi-DB explorer context.

---

## SQLite Rules

### Schema Model

SQLite has:

* no schemas
* no information_schema
* no routines system catalog
* limited metadata via sqlite_master

Correct metadata source:

```sql id="sq1"
SELECT name, type, sql
FROM sqlite_master
WHERE type IN ('table', 'view', 'index', 'trigger')
```

---

### Tables Rule

All tables must be inferred from `sqlite_master`.

No external metadata system exists.

---

### Columns Rule

Columns must be retrieved via:

```sql id="sq2"
PRAGMA table_info(table_name);
```

---

### Index Rules

Indexes must be retrieved via:

```sql id="sq3"
PRAGMA index_list(table_name);
PRAGMA index_info(index_name);
```

---

## Anti-Pattern Rules (Critical)

Reject:

* `information_schema` usage (not supported)
* assumptions from MySQL/PostgreSQL
* JOIN-based metadata queries
* cross-database abstraction logic
* treating SQLite like a server DB

---

## Query Safety Rules

Even in local storage:

* avoid `SELECT *` in application logic
* always use explicit columns for persistence models
* ensure prepared statements for all inserts/updates

---

## Prepared Statements Rule

All writes must use parameterized queries:

* prevents injection (even in local DB)
* ensures consistency with Rust/Tauri bindings

---

## Index Strategy

Indexes must be applied to:

* session lookups
* query history filtering
* metadata caching tables
* user state retrieval

---

## Use Cases (Local DB)

SQLite is used for:

* query history storage
* cached schema snapshots
* user preferences
* execution logs
* offline mode support

Not used for:

* live database exploration
* external engine metadata
* query execution against remote DBs

---

## Driver Abstraction Rule

SQLite is NOT part of the multi-engine explorer abstraction.

It is a separate internal persistence layer.

Must NOT share logic with:

* PostgreSQL driver
* MariaDB driver
* MongoDB driver

---

## Golden Rule

SQLite is the memory of the application.

Not a database being explored.

It supports the tool, it does not define it.
