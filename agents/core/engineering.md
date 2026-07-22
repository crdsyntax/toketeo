# Engineering Standards

Toketeo is a **Rust + Tauri multi-engine database orchestration runtime** — not a NestJS backend, not a REST API, not a business application. Frontend is React; backend is Rust with engine drivers (PostgreSQL, MariaDB, SQLite, MongoDB, SQL Server).

---

## Architecture

```
React → Tauri IPC → Rust Commands → Application → Adapters → Engines
```

Strict layers, no reverse dependencies:

| Layer | Responsibility | Forbidden |
|---|---|---|
| **Presentation** (Tauri commands) | IPC, input validation, DTO enforcement | SQL execution, orchestration logic |
| **Application** | Use-case orchestration, driver coordination | SQL execution, engine-specific logic |
| **Infrastructure** (drivers) | Engine-specific query execution, connection pools | Orchestration, IPC, business rules |
| **Domain** (minimal) | Shared runtime types only: `QueryResult`, `ColumnMeta`, `ExecutionInfo` | Business domain modeling, ORM entities |

**Dependency rules:** Application depends on traits (abstractions). Infrastructure depends on concrete implementations. Presentation depends on application contracts only.

---

## Core Principles

- **SOLID:** Each module one responsibility. Drivers interchangeable via Rust traits. Extend via new drivers/commands without modifying existing engines.
- **DRY (engine-aware):** Shared logic only for pooling, execution helpers, result formatting. Never abstract away engine-specific metadata or normalize cross-engine behavior.
- **KISS:** Prefer explicit engine-specific logic over abstractions. Keep commands thin and deterministic.

---

## Code Rules

- **Explicit typing:** No `any`/`unknown` at IPC boundaries. All Tauri commands use typed input/output structs. All Rust public interfaces declare explicit return types.
- **Early returns:** Guard clauses with `Result<T, AppError>`. Fail fast at IPC boundary — reject malformed inputs before reaching drivers.
- **Defensive programming:** Treat external databases as unreliable. Handle missing/inconsistent metadata per engine. Expect partial failures in multi-engine environments.
- **Logic separation:** No DB logic in React. No SQL in commands. No orchestration in drivers. No UI logic in backend.
- **Idiomatic Rust:** Ownership, borrowing, `Result`-based error handling. No panic paths in production. No unhandled `Result<T, E>`.
- **Error handling:** Typed `AppError`. Preserve engine-specific context. Don't expose stack traces to frontend. Normalize transport format only, not semantic meaning.
- **Logging:** Structured only. Include execution time, engine type, command name. Never log credentials, connection strings, or full query payloads.

---

## Forbidden Patterns

- NestJS-style controller/service patterns
- ORM abstractions hiding engine behavior
- `SELECT *` in production paths (unless justified for metadata introspection)
- Cross-engine coupling or shared mutable global state
- DTO systems unrelated to IPC contracts
- Dynamic SQL concatenation from user input
- Business domain modeling in backend runtime
- Frontend-trusted security boundaries

---

## Development Workflow

1. **Analyze** — Understand request in terms of Tauri commands, affected engines, metadata/execution impact, IPC contract changes.
2. **Plan** — Define minimal deterministic strategy. Prefer engine-specific solutions over abstractions.
3. **Identify** — List affected Rust modules (commands, use-cases, drivers, shared types). Check IPC contract impact.
4. **Impact Analysis** — Evaluate engine behavior, metadata structure, IPC contract, performance, connection pool impact.
5. **Approval Gate** — Stop before implementing. Require confirmation for schema/IPC/engine/metadata changes.
6. **Execute (atomic)** — One isolated change per step. Minimal, reversible, self-contained. No multi-layer or multi-engine changes in one step.
7. **Verify** — `cargo check`, IPC contract integrity, driver behavior consistency, metadata output structure.

---

## Pre-commit Checklist

- [ ] No `any` or unsafe TypeScript
- [ ] `cargo check` passes
- [ ] No Rust warnings in critical modules
- [ ] No ESLint errors
- [ ] IPC contracts type-safe and unchanged unless approved
- [ ] No cross-layer logic violations
- [ ] No multi-domain changes in one commit
- [ ] No engine abstraction violations
- [ ] No sensitive data in logs or code

---

## Performance Constraints

- Avoid unnecessary metadata recomputation
- Prevent N+1 patterns in backend introspection
- Use pagination for all unbounded result sets
- Minimize allocations in query execution hot paths
- Avoid redundant driver initialization

---

## Golden Rule

Correctness, isolation, and determinism always override convenience, abstraction, or framework conventions.