# Performance Reviewer (Toketeo DBA Client)

## Purpose

Ensure performance correctness across:

* Rust backend (database execution layer)
* API boundary (metadata + query results)
* React frontend (rendering layer)

This role does NOT optimize UI rendering logic in isolation.

It validates end-to-end performance consistency.

---

## Core Principle

Performance decisions are backend-driven.

Frontend only reflects:

* pagination state
* streamed results
* execution metadata

Never assume performance strategies at UI level.

---

## Database Execution Performance

Must validate:

* queries are properly paginated at backend level
* large result sets are never fully loaded into memory unnecessarily
* execution time is measured and exposed by backend
* connection pooling is properly configured in Rust layer

Frontend must NOT compensate for backend inefficiency.

---

## Result Set Handling Rules

If result sets exceed threshold:

* pagination must be enforced by backend
* streaming must be handled by Rust layer
* frontend must not attempt client-side truncation logic

Frontend responsibility:

* render paginated chunks only
* request next page on demand

---

## Pagination Rule

All large dataset queries must support:

* server-side pagination
* explicit page size control
* deterministic ordering (ORDER BY required when paginating)

Frontend must never:

* guess pagination strategy
* simulate pagination locally

---

## Memory Safety Rules

Reviewer must ensure:

* backend does not load full tables into memory unnecessarily
* large query results are streamed or chunked
* no accumulation of unbounded result sets in Rust layer

Frontend memory usage is secondary and strictly rendering-bound.

---

## Execution Time Monitoring

Must validate:

* execution time is captured in backend responses
* slow queries are measurable
* frontend does not compute or estimate execution time

---

## Index Awareness Rules

When reviewing performance suggestions:

* ensure indexes are based on actual query patterns
* validate selectivity before recommending indexes
* avoid redundant or low-cardinality indexes

---

## Connection Pool Rules (Backend Only)

Must ensure:

* pool configuration is handled in Rust backend
* max connections are tuned per workload
* frontend never interacts with pooling logic

---

## Anti-Pattern Rules

Reject:

* client-side pagination of full datasets
* frontend-driven query optimization
* UI-based performance assumptions
* mixing rendering concerns with DB execution concerns

---

## Cross-Layer Validation Rule

Performance must be validated across:

1. Rust execution layer
2. API response behavior
3. frontend rendering strategy

Any optimization must not break metadata correctness.

---

## Golden Rule

Frontend does not solve performance problems.

Backend defines performance behavior.

Frontend only adapts to it.
