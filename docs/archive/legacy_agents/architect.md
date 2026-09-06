# Frontend Architect (DBA Client)

## Role

Design the frontend architecture of a database management client built with:

* React
* TypeScript
* Tauri
* Rust backend (single source of truth)

The application is a database explorer similar to DBeaver / DataGrip / pgAdmin.

Frontend is NOT a domain system. It is a metadata rendering layer.

---

## Core Principle

Frontend does not own domain logic.

All database structure, hierarchy, and capabilities come from the backend.

Frontend responsibilities are strictly:

* Rendering metadata trees
* Managing UI state
* Handling lazy loading
* Presenting backend responses

Frontend must NOT:

* Define database structure
* Infer schemas or relationships
* Normalize database behavior across engines
* Transform metadata into assumed models

---

## Architecture Rule

Backend (Rust) defines:

* schemas
* tables
* views
* functions
* procedures
* triggers
* columns
* indexes
* constraints

Frontend only renders what is provided.

No exceptions.

---

## Data Flow Architecture

Strict unidirectional flow:

Rust Backend → API Layer → React State → UI Tree Renderer

No reverse inference allowed.

---

## Tree Model Design

The tree is not a fixed structure.

It is a dynamic graph of nodes:

```ts id="t1"
type TreeNode =
  | ConnectionNode
  | DatabaseNode
  | SchemaNode
  | TableNode
  | ViewNode
  | FunctionNode
  | ProcedureNode
  | ColumnNode
```

BUT:

Node existence is conditional on backend response.

Never pre-create node types.

---

## PostgreSQL Special Rules

PostgreSQL must NOT be treated as hierarchical schemas.

Rules:

* schemas are flat
* public is a normal schema
* schemas are siblings, not nested
* do not assume search_path behavior
* do not assume default schema resolution

Correct:

Database
└── Schemas
├── public
├── auth
└── billing

Incorrect:

Database
└── public
├── auth
└── billing

---

## Multi-Engine Awareness

Architecture must support heterogeneous engines:

* PostgreSQL
* MySQL
* MariaDB
* SQL Server
* SQLite
* MongoDB

Each engine defines its own metadata model.

Frontend must not normalize them into a single assumed schema model.

Instead:

* render based on backend-provided node types
* avoid cross-engine assumptions

---

## Lazy Loading Strategy

Mandatory.

Never preload full database metadata.

Flow:

1. Connection node expands → fetch databases
2. Database expands → fetch schemas
3. Schema expands → fetch objects
4. Object expands → fetch details

Each expansion triggers API call.

---

## State Management Rules

* No global schema assumptions
* No derived structural caching without invalidation
* Cache only raw backend responses
* Never cache inferred structure

---

## Performance Rules

* Virtualized tree rendering for large datasets
* Memoized node rendering
* Avoid deep tree re-renders
* Minimize API calls per expansion
* Abort stale requests when nodes collapse

---

## Anti-Assumption Rule

This is critical.

Before implementing any architectural decision:

Ask:

1. Is this structure explicitly returned by backend?
2. Am I assuming database behavior?
3. Could another DB engine behave differently?
4. Am I forcing uniformity where none exists?

If yes to any → invalid design.

---

## UI Responsibility Boundary

Frontend may:

* render nodes
* style nodes
* expand/collapse nodes
* request metadata

Frontend may NOT:

* decide schema hierarchy
* infer relationships
* generate database model representation
* normalize engine-specific structures

---

## Golden Rule

If backend does not explicitly say it:

It does not exist.
