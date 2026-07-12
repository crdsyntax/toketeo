# Coding Standards (Toketeo DBA Client)

## General Rules

These standards apply to the **Rust + Tauri + multi-database orchestration runtime**, not a NestJS backend.

---

## Explicit Typing

* All Rust functions must declare explicit return types
* All Tauri commands must use strongly typed input/output structs
* No implicit or inferred types in IPC boundaries
* No dynamic or unstructured payloads at system interfaces

---

## Early Returns

* Prefer early return patterns in Rust using `Result<T, AppError>`
* Avoid deeply nested match chains where guard clauses can simplify flow
* Fail fast on invalid IPC inputs before reaching engine layer

---

## Fail Fast Principle

* Validate all Tauri command inputs at the boundary layer
* Reject invalid database commands immediately
* Do not propagate malformed queries into drivers
* Engine execution must never receive unchecked input

---

## Defensive Programming

* Handle missing metadata gracefully per engine
* Expect partial or inconsistent metadata across database engines
* Treat external database systems as unreliable inputs
* Avoid assumptions about schema completeness or consistency

---

## Backend (Rust + Tauri) Standards

### Command Layer Rules

* Commands must be thin and deterministic
* Only validate input and delegate to application layer
* No SQL execution or metadata logic in command handlers

---

### Type Safety Rules

* No `any` or untyped structures at IPC boundaries
* No dynamic maps unless strictly required for raw metadata passthrough
* All responses must use structured types:

  * QueryResult
  * MetadataResponse
  * ExecutionInfo
  * EngineError

---

### Logging Standards

* Use structured logging only (Rust logging crates)
* No sensitive data in logs:

  * no credentials
  * no connection strings
  * no full query payloads in production logs
* Include:

  * execution time
  * engine type
  * command name

---

### Error Handling Standards

* Use typed error system (`AppError`)
* Preserve engine-specific context in errors
* Do not expose internal stack traces to frontend
* Normalize transport format only, not semantic meaning

---

### Validation Rules

* All inputs must be validated at IPC boundary
* Reject malformed or incomplete command payloads
* Do not rely on frontend validation for correctness
* Ensure type-safe deserialization of all Tauri commands

---

## Architectural Separation Rule

Strict separation must be maintained:

* Presentation Layer → Tauri Commands only
* Application Layer → orchestration logic
* Infrastructure Layer → database drivers

Forbidden:

* SQL execution in command layer
* metadata logic in presentation layer
* orchestration logic in drivers

---

## Defensive Database Behavior

* Treat all external databases as untrusted systems
* Expect inconsistent schemas across engines
* Handle missing or partial metadata gracefully
* Avoid assumptions about relational integrity

---

## Fail-Safe Execution Rule

* Any invalid state must stop execution immediately
* No fallback execution paths that hide errors
* No silent degradation of query results

---

## Anti-Pattern Rules

Reject:

* NestJS-style controller/service patterns
* DTO systems unrelated to IPC contracts
* implicit typing in system boundaries
* logging frameworks that expose sensitive data
* business-domain validation logic in backend runtime

---

## Golden Rule

This is not a NestJS backend.

This is a **typed Rust + Tauri database orchestration runtime where correctness and engine fidelity are more important than application conventions**.
