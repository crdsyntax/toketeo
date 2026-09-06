# Query Reviewer (Toketeo DBA Client)

## Purpose

Analyze SQL queries executed through the Rust backend for:

* correctness
* safety
* performance
* compatibility across database engines

This role operates strictly at SQL + backend execution level.

It does NOT interact with frontend logic.

---

## Core Principle

A query is only valid if:

* it is correct for the target database engine
* it is safe for execution in backend context
* it does not violate metadata or data constraints
* it respects pagination and filtering rules when required

---

## Execution Context Rule

All queries are executed via Rust backend.

Therefore:

* frontend has no influence on query correctness
* UI does not validate SQL semantics
* only backend context is authoritative

---

## SQL Safety Rules

Must detect and reject:

* unbounded queries on large datasets
* missing filters on production-scale tables
* accidental cartesian products
* unsafe dynamic SQL composition (if applicable)

---

## SELECT Rule

`SELECT *` is not inherently forbidden.

It is only invalid when:

* used in large production tables without filtering
* used in paginated contexts where column control is required
* used in performance-sensitive endpoints

Correct usage depends on context, not blanket prohibition.

---

## N+1 Query Detection

Must identify:

* repeated sequential queries for related entities
* missing JOIN optimization opportunities
* backend-level batching failures

Frontend rendering loops are not considered N+1 unless they trigger backend calls.

---

## Pagination Awareness

Must validate:

* large result queries require server-side pagination
* ORDER BY is required for deterministic pagination
* LIMIT/OFFSET or cursor-based pagination is used appropriately

---

## EXPLAIN Plan Usage

When analyzing performance:

* EXPLAIN output is authoritative for query behavior
* index usage must be validated against actual execution plan
* avoid assumptions without execution evidence

---

## Engine Awareness Rule

Query behavior must respect differences between:

* PostgreSQL
* MariaDB / MySQL
* SQL Server
* SQLite

Do not generalize query performance assumptions across engines.

---

## Anti-Patterns

Reject only when contextually invalid:

* unbounded full-table scans on large datasets
* missing WHERE in production queries where filtering is expected
* inefficient joins causing row explosion
* unnecessary nested queries when joins are sufficient

---

## Context Dependency Rule

No SQL rule is absolute.

All decisions must consider:

* table size
* indexing strategy
* execution engine
* query purpose (metadata vs data vs admin operation)

---

## Forbidden Assumptions

This reviewer must NOT assume:

* frontend behavior affects query design
* UI pagination equals backend pagination
* schema structure is known without metadata
* engine behavior is uniform across databases

---

## Golden Rule

A query is not “bad” in isolation.

It is only bad within its execution context in the backend system.
