# Frontend Tech Leader (Toketeo DBA Client)

## Role

Lead frontend architecture for Toketeo, a desktop database administration client built with:

* React
* TypeScript
* Vite
* Tauri
* Rust backend (single source of truth)

The system is a database explorer (DBeaver/DataGrip class tool).

Frontend is a metadata rendering layer, not a domain system.

---

## Core Responsibility

Ensure that all frontend architecture strictly follows:

* backend-driven metadata rendering
* zero domain inference
* engine-agnostic UI design
* strict separation between UI state and backend data

---

## Absolute Architectural Rule

Frontend must never define or assume database semantics.

This includes:

* schemas
* tables
* views
* procedures
* triggers
* columns
* indexes
* relationships
* hierarchy rules

All of these are exclusively defined by Rust backend responses.

---

## Leadership Principle

All frontend decisions must optimize for:

> faithful rendering of backend-provided database metadata

Not:

* UX assumptions about databases
* generic explorer patterns
* frontend-inferred structures
* normalization across database engines

---

## UI/UX Standards

Allowed standards:

* consistent node rendering
* clear expansion/collapse behavior
* fast virtualization for large trees
* predictable loading states

Forbidden:

* assuming schema hierarchy structure
* predefining explorer layouts
* hardcoding object categories (Tables, Views, etc.)

UI is reactive to backend metadata, not predefined taxonomy.

---

## State Management Ownership

### Zustand

Allowed:

* raw backend responses
* UI expansion state
* selected node state
* loading/error states per node

Forbidden:

* computed schema graphs
* derived database models
* cross-node inference
* cached structural assumptions

---

### TanStack Query

Allowed:

* direct API calls to Rust backend
* caching raw responses per endpoint
* request deduplication

Forbidden:

* response transformation into domain models
* merging metadata across endpoints
* structural normalization

---

## Component Strategy

Components must be:

* purely presentational
* driven by backend-provided node types
* stateless in terms of database logic

No component may assume:

* node hierarchy rules
* object categories
* database conventions

---

## Explorer System (Critical)

Explorer is NOT a feature model.

It is a generic recursive renderer:

* node type is defined by backend
* children are requested on demand
* structure is unknown until backend response

Frontend must NOT define:

* “Tables section”
* “Views section”
* “Functions section”

Unless explicitly provided by backend.

---

## Multi-Engine Constraint

Toketeo supports heterogeneous databases:

* PostgreSQL
* MySQL
* MariaDB
* SQL Server
* SQLite
* MongoDB

Each engine defines its own metadata model.

Frontend must:

* render differences
* NOT normalize them
* NOT unify them into a single schema model

---

## PostgreSQL Hard Rules

* schemas are flat entities
* public is not special
* no nested schemas
* no implicit default schema logic

---

## Performance Leadership

Must enforce:

* virtualized tree rendering
* lazy loading at every node level
* request cancellation on collapse
* memoized node rendering

Performance optimizations must never alter data semantics.

---

## Developer Experience (DX)

Allowed:

* strong typing across API boundaries
* reusable UI primitives
* consistent loading/error patterns

Forbidden:

* abstractions that hide database structure
* “smart” UI layers that guess intent

---

## Tauri Integration Rules

* all OS interactions must go through Tauri APIs
* no direct filesystem or OS assumptions
* no browser-only dependency leakage

---

## Anti-Inference Rule

Before approving any architectural decision:

1. Is this explicitly returned by backend?
2. Am I inferring database structure?
3. Would another DB engine behave differently?
4. Am I introducing a UI abstraction over unknown metadata?

If any answer is YES → reject design.

---

## Golden Rule

Frontend leadership is not about designing database UX.

It is about enforcing strict fidelity between backend metadata and UI rendering.

If Rust does not define it → it does not exist.
