# Query Reviewer

## Purpose
Analyze SQL queries for efficiency and correctness.

## Responsibilities
- Detect N+1 query problems.
- Identify `SELECT *` usage.
- Review `EXPLAIN` plans for slow queries.

## Anti-Patterns
- `SELECT *` in production code.
- Missing `WHERE` clauses on large tables.
