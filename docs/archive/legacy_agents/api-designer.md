# Command Interface Designer (Toketeo DBA Client)
## Purpose
Design consistent, safe and type-safe command interfaces between:
* Rust backend (Tauri side)
* React frontend (Tauri invoke layer)
This system is NOT REST, NOT GraphQL.
It is a direct IPC command bridge via Tauri.
## Core Principle
Commands are the only contract between frontend and backend.
Frontend never accesses database logic directly.
Rust is the single source of truth for:
* metadata retrieval
* query execution
* schema inspection
* engine behavior
---
## Architecture Rule
Communication model:
React UI → Tauri `invoke()` → Rust Commands → Database Engines
No HTTP layer exists.
No REST semantics apply.
---
## Command Design Rule
Each command must be:
* strongly typed input
* strongly typed output
* engine-aware internally (Rust side)
* frontend-agnostic in behavior
---
## Naming Convention
Commands must represent database actions, not UI actions.
Correct:
* `get_schemas`
* `get_tables`
* `get_views`
* `get_columns`
* `execute_query`
* `get_indexes`
Incorrect:
* `loadExplorer`
* `renderSchemaTree`
* `fetchUIData`
Frontend does NOT influence naming.
---
## Pagination Rule
Mandatory for:
* query results
* large metadata sets (tables, columns, schemas)
Must be handled in Rust.
Frontend only requests pages.
---
## Versioning Rule
Commands are versioned implicitly via:
* Rust API evolution
* struct changes
* command signature updates
NOT via URL or REST versioning.
---
## Data Contract Rule
All command inputs/outputs must:
* be strongly typed (Rust structs)
* avoid optional ambiguity where possible
* preserve database engine semantics
No normalization of different DB engines into a single fake model.
---
## Metadata Integrity Rule
Rust must return:
* exact schema structure
* exact object types
* engine-specific metadata fields
Frontend must render without reinterpretation.
---
## Execution Commands
Query execution must:
* run inside Rust layer
* use engine-specific adapters
* return:
  * rows (paginated if needed)
  * columns metadata
  * execution time
  * optional explain plan
Frontend must NOT interpret SQL.
---
## Error Contract Rule
Errors returned by commands must include:
* error type
* error message
* optional engine context
* optional query context (if applicable)
Frontend must display errors as-is without semantic transformation.
---
## Multi-Engine Rule
Commands must support:
* PostgreSQL
* MySQL / MariaDB
* SQL Server
* SQLite
* MongoDB
Without forcing unified schema abstraction.
Each engine defines its own metadata shape internally in Rust.
---
## Anti-Pattern Rules
Reject command designs that:
* assume HTTP/REST semantics
* introduce UI-specific commands
* mix rendering logic with backend commands
* normalize database engines into one model
* expose business-domain APIs
---
## Frontend Boundary Rule
Frontend may only:
* invoke commands
* display results
* manage UI state
Frontend may NOT:
* interpret database structure
* decide hierarchy
* transform metadata meaning
* simulate DB behavior
---
## Golden Rule
Commands are not an API layer.
They are a typed IPC contract to a database engine orchestrator in Rust.