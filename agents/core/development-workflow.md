# Development Workflow (Toketeo DBA Client)

## Protocol

This workflow applies to all development in the **Rust + Tauri + multi-database orchestration runtime**.

All changes must respect the IPC boundary between frontend (React) and backend (Rust).

---

### 1. Analyze

* Understand the request in terms of:

  * Tauri command behavior
  * affected database engine(s)
  * metadata or query execution impact
  * IPC contract changes (if any)

* Determine whether the change affects:

  * command layer
  * application orchestration layer
  * infrastructure (drivers)
  * shared types

---

### 2. Plan

* Define a minimal, deterministic implementation strategy
* Prefer engine-specific solutions over generic abstractions
* Avoid introducing new architectural layers unless explicitly required

---

### 3. Identify

* List all affected Rust modules, including:

  * Tauri command handlers
  * application use-cases
  * database drivers (PostgreSQL, MariaDB, SQLite, etc.)
  * shared types (QueryResult, MetadataResponse, etc.)

* Identify whether IPC contracts are impacted

---

### 4. Impact Analysis

Must explicitly evaluate:

* database engine behavior changes
* metadata structure changes
* IPC contract changes (frontend compatibility)
* performance impact (query execution, metadata introspection)
* connection pooling or resource usage impact

No change is considered safe without impact awareness.

---

### 5. Approval Gate

* Stop execution before implementing changes
* Require explicit confirmation for:

  * schema changes
  * IPC contract changes
  * engine adapter modifications
  * metadata structure changes

No implicit continuation allowed.

---

### 6. Execution (Atomic Change Rule)

* Apply only one isolated change per step

* Do NOT modify multiple domains simultaneously:

  * command layer
  * application layer
  * infrastructure layer

* Each change must be:

  * minimal
  * reversible
  * self-contained

---

### 7. Verification

* Validate correctness of:

  * Rust compilation (cargo check)
  * IPC contract integrity
  * database driver behavior consistency
  * metadata output structure

* Ensure no regression in:

  * query execution
  * schema introspection
  * engine compatibility

---

## Atomic Changes Rule

Strict enforcement:

* No cross-layer refactors in a single step
* No multi-engine modifications in one operation
* No simultaneous IPC + driver + application changes
* No architectural redesign during feature implementation

Each change must affect exactly one concern.

---

## Change Safety Principle

All modifications must preserve:

* engine fidelity (no normalization across databases)
* deterministic execution behavior
* IPC contract stability
* strict layer separation

---

## Anti-Pattern Rules

Reject workflows that:

* combine planning and execution in a single step
* modify multiple Rust layers simultaneously
* introduce new abstractions during feature work
* bypass approval gates
* assume frontend compatibility without verification

---

## Golden Rule

Development is a controlled sequence of **atomic, verifiable changes over a deterministic Rust + Tauri database orchestration system**.

Speed is secondary to correctness and contract stability.
