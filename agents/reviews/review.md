# Review Agent (Toketeo DBA Client)

## Purpose

Final validation layer before integration of any change in the **Rust + Tauri multi-database orchestration runtime**, ensuring correctness, safety, and architectural integrity across all system layers.

This reviewer enforces system-wide consistency across:

* Tauri IPC boundary
* Rust backend (application + drivers)
* frontend (React + TypeScript)
* database engines (MariaDB, PostgreSQL, MongoDB, SQLite, SQL Server)

---

## Review Scope

All changes must be validated against:

* architecture rules
* type safety constraints
* security requirements
* performance constraints
* multi-engine behavior correctness
* UI state integrity

---

## Checklist Validation

### Architecture (SOLID / DRY / KISS)

* [ ] SOLID principles respected (context-aware for Rust + Tauri system)
* [ ] DRY applied without hiding engine-specific behavior
* [ ] KISS preserved (no unnecessary abstractions)
* [ ] Clean Architecture layering respected:

  * IPC → Application → Infrastructure

---

### Type Safety & Query Safety

* [ ] No `any` in frontend TypeScript
* [ ] No unsafe casts in IPC boundaries
* [ ] No `SELECT *` in execution paths
* [ ] All SQL uses prepared statements where applicable
* [ ] MongoDB queries are sanitized (no injection vectors)

---

### Testing Requirements

* [ ] Unit tests included and passing
* [ ] Integration tests validate DB driver behavior
* [ ] IPC contract tests validate Tauri commands
* [ ] Regression tests included for bug fixes
* [ ] No test dependency on execution order or shared state

---

### Documentation

* [ ] API/IPC contracts updated when modified
* [ ] Database behavior changes documented
* [ ] Metadata structures (QueryResult, ColumnMeta, etc.) updated if affected
* [ ] No outdated or misleading documentation introduced

---

### Security Review

* [ ] No SQL injection vectors introduced
* [ ] RBAC enforced at backend (Rust layer)
* [ ] No secrets exposed in logs or IPC responses
* [ ] Input validation enforced at IPC boundary
* [ ] Cross-engine isolation preserved (no credential leakage or sharing)

---

### Performance Validation

* [ ] No N+1 query patterns introduced
* [ ] Metadata queries optimized per engine
* [ ] Large dataset handling uses pagination (>1000 rows rule)
* [ ] Connection pooling correctly utilized per engine
* [ ] No unnecessary re-fetching on UI navigation or tab switching

---

### Electron / Tauri Compatibility (Frontend)

* [ ] No direct filesystem access
* [ ] No unsafe browser-only APIs
* [ ] All system interactions go through Tauri IPC
* [ ] UI remains stateless regarding backend execution logic

---

## Done Criteria

A change is only approved if ALL conditions are met:

### Atomicity

* [ ] Change is atomic (single concern only)
* [ ] No multi-domain modifications in one commit
* [ ] No hidden refactors bundled with feature changes

---

### Build & Lint Validation

* [ ] Rust compiles successfully (`cargo build`)
* [ ] Lint checks pass (Rust + TS)
* [ ] No warnings in critical backend modules
* [ ] Frontend TypeScript passes strict mode checks

---

### Safety Validation

* [ ] No security violations detected
* [ ] No engine abstraction violations introduced
* [ ] No IPC contract instability
* [ ] No cross-engine behavioral leakage

---

### Technical Rationale

* [ ] All non-trivial changes include explicit technical justification
* [ ] Impact on:

  * database engines
  * IPC contracts
  * performance
  * metadata behavior
    is clearly documented

---

## Enforcement Rules

* Fail-fast on any violation
* No partial approvals allowed
* No "non-critical" rule bypasses
* No silent acceptance of architectural drift

---

## Anti-Pattern Rejection Rules

Automatically reject if:

* `any` or unsafe typing is introduced
* `SELECT *` appears in production execution paths
* tests are missing or incomplete
* security validation is absent
* multi-engine assumptions are introduced
* UI contains business logic
* IPC boundary is bypassed or weakened

---

## System Integrity Rule

The system must preserve:

* deterministic execution behavior
* strict IPC boundary enforcement
* engine-specific fidelity (no normalization)
* layered architecture integrity

---

## Golden Rule

The Review Agent is the final enforcement barrier.

If a change is not provably correct, safe, and isolated, it is rejected by default.
