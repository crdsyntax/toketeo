# Definition of Done (Toketeo DBA Client)

## Requirements

This checklist applies to all changes in the **Rust + Tauri + multi-database orchestration runtime**, including:

* Tauri IPC command layer
* Application orchestration layer
* Database drivers (PostgreSQL, MariaDB, SQLite, MongoDB, SQL Server)
* Frontend (React) where applicable

---

## Architecture Compliance

* [ ] Implementation respects layered architecture:

  * Presentation (Tauri commands)
  * Application (orchestration)
  * Infrastructure (database drivers)
* [ ] No business logic exists in UI or IPC command layer
* [ ] No ORM or repository abstractions introduced
* [ ] No cross-engine coupling or shared execution logic
* [ ] Engine-specific behavior is preserved (no normalization)

---

## Code Quality

* [ ] SOLID principles applied where relevant (Rust + TS context-aware)
* [ ] DRY applied without hiding engine-specific behavior
* [ ] KISS preserved (no unnecessary abstractions)
* [ ] Code is deterministic and minimal in scope
* [ ] No dead code or unused abstractions introduced

---

## Type Safety

* [ ] All Rust public interfaces use explicit types
* [ ] All Tauri IPC contracts are strictly typed
* [ ] No `any` or unsafe casts in frontend TypeScript code
* [ ] No `unknown` used in IPC boundary contracts
* [ ] Metadata structures are explicitly defined or safely structured

---

## Query Safety

* [ ] No `SELECT *` used in execution paths (unless strictly justified for metadata introspection)
* [ ] All database queries use prepared statements where supported
* [ ] No dynamic SQL concatenation from unvalidated input
* [ ] MongoDB aggregation pipelines are sanitized
* [ ] Metadata queries are engine-safe and validated

---

## Testing

* [ ] Unit tests pass for Rust modules (`cargo test`)
* [ ] Integration tests validate IPC command behavior
* [ ] Database driver behavior is validated per engine
* [ ] Edge cases (missing metadata, partial failures) are covered
* [ ] No regression in existing query execution or metadata retrieval

---

## Linting & Formatting

* [ ] Rust code passes formatting (`cargo fmt`)
* [ ] Rust lint checks pass (`clippy` or equivalent)
* [ ] Frontend passes ESLint with zero warnings
* [ ] Code follows project naming and structural conventions

---

## Documentation

* [ ] Tauri commands are documented and consistent with IPC contracts
* [ ] Metadata structures are documented (QueryResult, ColumnMeta, ExecutionInfo)
* [ ] Any new driver capabilities are documented per engine behavior
* [ ] No outdated or misleading documentation remains

---

## Security Compliance

* [ ] No secrets present in code, logs, or IPC payloads
* [ ] RBAC rules enforced at backend (Rust) layer
* [ ] All inputs validated at IPC boundary (Tauri commands)
* [ ] SQL injection vectors mitigated via prepared statements
* [ ] Cross-engine isolation preserved (no shared credentials or pools)

---

## Performance Validation

* [ ] No unbounded query execution without pagination
* [ ] Metadata caching used where safe and appropriate
* [ ] No N+1 query patterns in metadata or execution flows
* [ ] Connection pooling behaves correctly per engine
* [ ] No unnecessary allocations in hot execution paths

---

## Security Review Gate

* [ ] Security DevOps review passed
* [ ] No critical or high vulnerabilities introduced
* [ ] No unsafe IPC patterns detected
* [ ] No exposure of sensitive engine metadata or credentials

---

## Final System Integrity Check

* [ ] Engine fidelity preserved (no abstraction distortion)
* [ ] IPC contract stability maintained
* [ ] Deterministic execution confirmed
* [ ] Layer separation intact
* [ ] Multi-engine compatibility validated

---

## Golden Rule

A change is only considered “Done” if it preserves:

* correctness of execution
* safety of IPC boundary
* integrity of database engines
* architectural separation of the system

Everything else is secondary.
