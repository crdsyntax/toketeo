# Roadmap (Toketeo DBA Client)

## Context (Current System State)

The system already includes:

* SSH tunneling support
* MariaDB fully functional (schemas, tables, queries, metadata)
* PostgreSQL connection (partial: connects but lacks schema/table listing)
* MongoDB connection implemented
* SQL Server support not validated
* Monaco-based SQL editor
* Column inspector (types, defaults, nullability, PK detection)
* Index / FK / constraints visualization
* Table DDL extraction
* Row-level data viewer with inline editing (double-click)
* Transaction support for production-marked connections
* Connection testing
* Import / export of connections
* Database restore functionality

---

## Current Architectural Issues (Must Fix First)

### Explorer State Desync (Critical)

* Tab switching causes:

  * unnecessary reloads of table metadata
  * loss of active query/editor state
* Root problem:

  * missing persistent UI state layer for explorer context

### PostgreSQL Metadata Gap

* Cannot list:

  * databases (or schemas correctly)
  * tables under schemas
* Likely cause:

  * incomplete `information_schema` usage or missing `pg_catalog` fallback queries

---

## Phase 1: Core Stabilization (Critical Path)

* [ ] Fix PostgreSQL metadata introspection (schemas → tables → columns)
* [ ] Normalize cross-engine schema discovery layer (without losing engine fidelity)
* [ ] Stabilize Explorer tab state (no reload on tab switch)
* [ ] Introduce persistent UI session state per connection:

  * active schema
  * active table
  * active query state

---

## Phase 2: Explorer UX Completion

* [ ] Add "WHERE filter input" in Data tab:

  * SQL fragment input (`WHERE <user_input>`)
  * execute on Enter key
  * example: `id = 1 AND status = 'active'`
* [ ] Preserve query state when switching tabs:

  * Explorer ↔ Query Editor ↔ Data Viewer
* [ ] Cache last executed query per tab/session

---

## Phase 3: Row-Level SQL Generation Engine

* [ ] Right-click on row → actions:

### SELECT Builder

* [ ] Generate `SELECT col1, col2, col3 FROM table WHERE primary_key = X`
* [ ] Never use `SELECT *`

### UPDATE Builder

* [ ] Generate parameterized UPDATE statement:

  * only changed fields included
  * WHERE based on primary key(s)

### INSERT Builder

* [ ] Generate full insert statement (all columns explicit)
* [ ] Optional: exclude null/default columns toggle

### DELETE Builder

* [ ] Generate safe DELETE with PK-based WHERE clause

### JSON Export

* [ ] Export selected row as structured JSON
* [ ] Respect type decoding rules from driver layer

---

## Phase 4: Multi-Driver Completion

* [ ] PostgreSQL schema/table listing fix completed
* [ ] Validate SQL Server driver behavior
* [ ] MongoDB full explorer support:

  * collections
  * documents
  * schema inference (best-effort)
* [ ] SQLite integration for local persistence layer (if required)

---

## Phase 5: Advanced Explorer Engine

* [ ] Unified Explorer abstraction layer (engine-aware, not normalized)
* [ ] Metadata caching per connection session
* [ ] Lazy-loading of schema trees
* [ ] Pagination for large tables (mandatory >1000 rows rule enforced)

---

## Phase 6: Query Editor Enhancements

* [ ] Persist Monaco editor state per tab
* [ ] Multi-query session support (tabs independent)
* [ ] Query execution history per connection
* [ ] Result diffing between executions (optional advanced feature)

---

## Phase 7: Security & Transaction Layer

* [ ] Validate transaction safety for production connections
* [ ] Enforce read-only mode toggles per connection
* [ ] Add query execution guardrails:

  * destructive query detection (DELETE/UPDATE without WHERE warning)
* [ ] Audit logging for all row-level modifications

---

## Phase 8: Performance & Stability

* [ ] Fix unnecessary re-fetch on tab switching
* [ ] Introduce memoized metadata layer
* [ ] Prevent duplicated schema queries
* [ ] Reduce driver round-trips on explorer navigation
* [ ] Connection pool reuse optimization per engine

---

## Phase 9: UX Enhancements

* [ ] Context-aware right-click menu per entity type:

  * table
  * row
  * column
  * index
* [ ] Inline SQL preview panel for generated queries
* [ ] Visual diff for row edits before commit

---

## Critical Constraints (Must Not Break)

* Engine fidelity must be preserved (no cross-db normalization)
* PostgreSQL must remain engine-correct (no forced MariaDB-style assumptions)
* No SELECT * in generated queries
* No UI state loss on navigation
* No implicit query execution without explicit user action

---

## Golden Rule

This is not a CRUD tool.

It is a **multi-engine database orchestration client with deterministic query control, metadata introspection, and safe mutation tooling**.
