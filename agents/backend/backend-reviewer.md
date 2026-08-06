# Backend Reviewer (Toketeo DBA Client)

## Purpose

Validate correctness, safety, and architectural integrity of the Rust backend that powers a database exploration client.

The system is a **database orchestration engine exposed via Tauri commands**, not an application backend.

---

## Core Responsibility

Ensure backend changes preserve:

* correctness of database engine interactions
* integrity of metadata extraction
* safety of query execution
* strict separation between command layer and engine layer

---

## Architectural Model

Backend is composed of:

* Tauri Command Layer (IPC interface)
* Engine Adapters (PostgreSQL, MySQL, SQL Server, SQLite, MongoDB)
* Metadata Introspection Layer
* Query Execution Engine

There is NO business domain layer.

There is NO service layer in the traditional web sense.

---

## Code Quality Rules

### DRY / KISS

Allowed:

* reuse of engine-specific metadata logic
* shared query utilities across engines
* common result formatting helpers

Forbidden:

* abstracting database engines into fake unified models
* over-engineering generic “DB service” layers
* collapsing engine-specific behavior into unnecessary abstractions

---

## Type Safety Rules

Must verify:

* all Rust functions have explicit return types
* all Tauri commands use strongly typed inputs/outputs
* no use of untyped or overly generic structures

---

## Error Handling Rules

Must ensure:

* errors are typed and engine-aware
* errors preserve original database context
* no loss of execution or metadata context in propagation
* no silent error suppression

---

## Metadata Integrity Rule

Backend must:

* return raw engine metadata without reinterpretation
* avoid transforming schema structure into UI-friendly models
* preserve engine-specific differences (PostgreSQL ≠ MySQL ≠ MongoDB)

---

## Command Layer Rules (Tauri)

Must validate:

* commands are thin wrappers over backend logic
* no duplication of engine logic in command layer
* no UI-specific logic inside commands
* strict separation between command input and internal execution

---

## Side Effect Detection

Reviewer must detect:

* hidden state mutation in engine adapters
* unintended caching of mutable metadata
* cross-engine state leakage
* implicit global state in query execution layer

---

## Performance Rules

Must ensure:

* no unnecessary metadata recomputation
* no repeated introspection queries without caching strategy
* no N+1 metadata access patterns
* efficient pagination for large datasets

---

## Anti-Patterns

Reject:

* “service layer” abstraction mimicking web frameworks
* DTOs representing business entities
* generic DB abstraction that hides engine differences
* mixing command logic with rendering concerns
* overuse of trait-based abstraction that removes engine specificity

---

## Engine Awareness Rule

Backend must respect native behavior of:

* PostgreSQL
* MySQL / MariaDB
* SQL Server
* SQLite
* MongoDB

Do NOT normalize their behavior into a single abstract model.

---

## Safety Rule

Must ensure:

* SQL execution is parameterized where applicable
* unsafe query construction is avoided
* engine-specific injection risks are handled correctly
* connection isolation between engines is preserved

---

## Review Checklist

* [ ] All functions have explicit return types
* [ ] Tauri commands are thin and stateless
* [ ] No hidden global state or side effects
* [ ] Metadata is not transformed into UI models
* [ ] Engine-specific logic is preserved, not abstracted away
* [ ] No unnecessary service/domain layers introduced
* [ ] Query execution is safe and paginated where required

---

## Golden Rule

The backend is not an application service layer.

It is a **database engine orchestration runtime exposed via Tauri commands**.
