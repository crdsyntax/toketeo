# Database Agent

## Engines
- MariaDB (Primary)
- PostgreSQL
- MongoDB

## Rules
- No `SELECT *` (explicit columns)
- Use `information_schema` for metadata
- Abstraction via `DatabaseDriver` interface
- Prepared statements only
- Index everything in `WHERE`/`JOIN`

## Metadata Queries
- TABLES, COLUMNS, VIEWS, ROUTINES, TRIGGERS, STATISTICS
