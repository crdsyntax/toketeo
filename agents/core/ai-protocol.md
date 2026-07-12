# AI Protocol (Toketeo DBA Client)

## Responsibilities

* Enforce `.agents` standards across all backend and frontend AI-driven modifications
* Maintain surgical precision in code changes (Rust, Tauri, React)
* Ensure architectural consistency across multi-engine database orchestration system
* Prioritize correctness of database behavior over abstraction convenience
* Enforce security boundaries between IPC layer, backend runtime, and database engines

---

## Core Constraints

* No speculative or "just-in-case" implementations
* No architectural changes without explicit approval
* No invention of missing layers, patterns, or abstractions
* No normalization of database engine behaviors
* No UI-driven backend design decisions

---

## Execution Model Rule

All operations must respect the Toketeo architecture:

Frontend (React)
→ Tauri IPC (`invoke`)
→ Rust Command Layer
→ Application Layer
→ Engine Adapters
→ Database Engines

No HTTP, no REST, no external API assumptions.

---

## Change Discipline

* Each modification must be atomic and scoped
* No multi-module refactors without explicit request
* No hidden side effects across engine adapters
* No cross-engine behavioral coupling

---

## Safety Rules

* All inputs must be validated at IPC boundary (Tauri commands)
* No unsafe SQL concatenation
* No leakage of credentials, connection strings, or internal metadata
* No shared mutable state across database engines
* Strict isolation between PostgreSQL, MariaDB, SQLite, SQL Server, MongoDB

---

## Performance Constraints

* Avoid unnecessary metadata recomputation
* Prevent N+1 patterns in backend introspection
* Use pagination for all unbounded result sets
* Minimize allocations in query execution hot paths
* Avoid redundant driver initialization

---

## Architectural Constraints

* Maintain strict separation:

  * Command Layer (Tauri)
  * Application Layer (orchestration)
  * Infrastructure Layer (drivers)
* No business-domain modeling
* No ORM or repository abstractions
* No REST-style architectural assumptions

---

## Code Quality Rules

* Idiomatic Rust required (ownership, borrowing, Result-based error handling)
* Strict typing across all IPC boundaries
* No untyped structures or dynamic maps unless strictly required for metadata
* Deterministic execution paths for all commands

---

## Approval Rule

* No breaking changes without explicit confirmation
* No modification of engine adapters without review
* No schema or metadata contract changes without validation

---

## Output Discipline

* Changes must be minimal and targeted
* No unrelated refactors
* No additional “improvements” beyond requested scope

---

## Rationale Requirement

Every non-trivial change must include:

* technical justification
* impact on engine behavior or IPC contract
* performance or safety implications

No changes are accepted without explicit reasoning tied to system constraints.

---

## Golden Rule

The system is a deterministic database orchestration runtime.

Not an application framework.

Not a REST API.

Not a business backend.
