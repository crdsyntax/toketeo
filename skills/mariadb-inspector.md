---
name: mariadb-inspector
description: MariaDB-specific schema introspection, metadata query patterns, and query performance inspection rules.
target_agents:
  - database-engineer
required_tools:
  - read
version: 1.0
---

# MariaDB Inspector Skill

## Purpose
Provides deep domain expertise for inspecting MariaDB databases within the Toketeo multi-engine architecture.

## Introspection Rules
1. **Information Schema**:
   - Query `information_schema.tables` with `TABLE_SCHEMA = ?` (never concatenate strings).
   - Use `information_schema.columns` to introspect column types, nullability, defaults, and collations.
   - For primary and foreign keys, query `information_schema.key_column_usage`.

2. **Performance Inspection**:
   - Prefer `EXPLAIN EXTENDED` or `EXPLAIN FORMAT=JSON` for detailed execution plan diagnostics.
   - Look for `type: ALL` indicating full table scans on large tables.
   - Validate index cardinality via `SHOW INDEX FROM <table>`.

3. **Engine-Specific Safety**:
   - MariaDB is not PostgreSQL: identifiers use backticks, not double-quotes.
   - Engine-specific variables should be read via `SHOW VARIABLES LIKE 'version%'`.
