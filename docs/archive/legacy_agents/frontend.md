# Frontend Agent (DBA Client Edition)

## Stack

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* TanStack Table
* Zustand
* Monaco Editor
* Shadcn UI
* Tauri (Desktop runtime)

---

## Core Principle

Frontend is a **presentation layer for database metadata**.

It is NOT a domain system.

It does NOT define business or database concepts.

All database knowledge comes from Rust backend.

---

## Absolute Rule

Frontend must never define or assume:

* schemas
* tables
* views
* procedures
* triggers
* columns
* indexes
* relationships
* hierarchy

All of these come exclusively from backend responses.

---

## Architecture Boundaries

### UI Layer (React Components)

Allowed:

* rendering data
* user interactions
* layout composition
* visual state (open/close/loading)

Forbidden:

* API calls
* data shaping
* domain logic
* metadata interpretation

---

### Services Layer

Allowed:

* raw API calls to Rust backend
* return typed DTOs exactly as received

Forbidden:

* transformations
* merging entities
* inferring structure
* normalizing DB engines

---

### Stores (Zustand)

Allowed:

* UI state only
* selection state
* expansion state
* caching raw backend responses

Forbidden:

* business logic
* derived schema models
* computed database structure

---

## Data Model Rule

Frontend does NOT define database models.

There is no:

* "Explorer model"
* "Schema model"
* "Tree model with assumptions"

Only backend-provided DTOs exist.

If backend changes → UI adapts.

---

## Explorer Rule (Critical)

Explorer is NOT a predefined feature.

Explorer is a **dynamic rendering of backend metadata nodes**.

Valid nodes only exist if backend returns them.

Example:

✔ Valid:

* schema node if backend returns schema
* table node if backend returns table
* view node if backend returns view

✘ Invalid:

* assuming "Tables" exists under schema
* assuming "public" is special
* grouping objects by frontend logic

---

## Explorer Rendering Strategy

Frontend must render a generic node system:

* Node has type (from backend)
* Node has children (if backend provides)
* Node expands only by API request

No static tree structure exists.

---

## Tables / Views / Procedures Rule

These are NOT UI features.

They are backend-defined object types.

Frontend must not assume:

* existence
* grouping
* naming conventions
* hierarchy

---

## PostgreSQL Warning (Hard Rule)

PostgreSQL schema structure must NOT be normalized.

Rules:

* schemas are flat
* public is not special
* no parent-child schema assumptions
* no default schema assumptions

---

## TanStack Table Rule

* All operations are server-side
* Pagination is mandatory server-side
* Filtering is server-side
* Sorting is server-side

Frontend never filters full datasets locally.

---

## SQL Editor Rule

* Monaco is only an editor
* Execution is handled by backend
* No SQL parsing in frontend
* No query interpretation

---

## Electron / Tauri Rule

* No direct filesystem access
* No direct OS calls
* No browser-only dependencies without adapter layer

---

## State Management Rule

Zustand stores:

* raw backend responses
* UI expansion state
* selected node state

Zustand must NOT:

* compute schema structures
* infer relationships
* transform database metadata

---

## API Rule

TanStack Query:

* only wraps backend calls
* no transformation logic
* no caching of derived models
* stale-while-revalidate allowed

---

## Anti-Hallucination Rule

Before writing any frontend logic:

Ask:

1. Is this provided by backend?
2. Am I inventing structure?
3. Would another DB engine behave differently?
4. Am I hardcoding database concepts?

If yes → invalid implementation.

---

## Golden Rule

Frontend never understands databases.

Frontend only renders what Rust describes.

If Rust does not describe it → it does not exist.
