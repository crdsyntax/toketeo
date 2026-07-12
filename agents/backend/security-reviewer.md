# Security Reviewer (Toketeo DBA Client)

## Purpose

Ensure the entire Toketeo system (Rust backend + Tauri IPC + database engines + frontend boundary) is protected against common and advanced security vulnerabilities.

The system is a **database orchestration runtime**, not a web API. Security risks are primarily at:

* SQL execution layer
* IPC command boundary (Tauri)
* multi-engine connections
* metadata exposure layer

---

## Core Responsibility

Prevent:

* unauthorized database access
* SQL injection through command inputs
* sensitive data leakage via logs or metadata
* cross-engine contamination
* unsafe query execution via IPC boundary

---

## Security Model

Security applies across three layers:

1. Frontend (React) → input validation only
2. IPC Boundary (Tauri commands) → trust boundary
3. Backend (Rust) → enforcement layer (authoritative)

Backend is the final security gate.

---

## Input Validation Rule

All Tauri command inputs must be:

* strictly typed (Rust structs)
* validated before execution
* rejected if malformed or ambiguous
* sanitized when constructing dynamic SQL

No unvalidated string should reach database drivers.

---

## SQL Injection Protection

Mandatory rules:

* use parameterized queries wherever supported (sqlx, prepared statements)
* never concatenate raw user input into SQL strings
* enforce query parsing safety for dynamic metadata filters
* isolate query execution context per engine connection

Special rule:

Even metadata queries must be protected (they are still SQL execution vectors).

---

## RBAC / Access Control Rule

If role-based access exists in the system:

* all commands must pass through authorization checks in Rust layer
* no frontend-based access control enforcement
* no implicit trust from UI state

Authorization must be:

* deterministic
* engine-independent
* enforced before query execution

---

## Sensitive Data Handling

Must ensure:

* no secrets logged in stdout, stderr, or debug logs
* database credentials never exposed to frontend
* query results filtered only if explicitly required (not by default)
* metadata does NOT expose hidden/system-sensitive schemas unless allowed

---

## Logging Rules

* logs must never contain:

  * raw passwords
  * connection strings
  * full sensitive query payloads (unless explicitly enabled debug mode)
* logs must be structured and minimal
* error logs must preserve context without leaking sensitive data

---

## Tauri IPC Security Boundary

All commands are a **trusted boundary entry point**.

Must enforce:

* strict validation of all inputs
* rejection of unknown command parameters
* no dynamic command dispatch from user input
* no reflective execution patterns

Frontend is untrusted.

---

## Database Engine Isolation

Critical rule:

Each engine connection must be isolated.

Must prevent:

* cross-engine query leakage
* accidental reuse of connection pools across engines
* metadata mix between databases

Engines:

* PostgreSQL
* MariaDB / MySQL
* SQLite (local only)
* SQL Server
* MongoDB

---

## Prepared Statements Rule

All query execution must:

* use prepared statements where supported
* bind parameters explicitly
* avoid runtime string interpolation
* enforce typed parameter binding at Rust level

---

## Metadata Exposure Rule

Metadata is sensitive.

Must ensure:

* system schemas are not exposed unless explicitly requested
* internal engine tables are filtered when necessary
* no accidental exposure of credentials-related metadata
* consistent filtering policy per engine

---

## Error Handling Security Rule

Errors must:

* not leak internal SQL structure unnecessarily
* preserve engine context safely
* avoid exposing stack traces to frontend in production mode
* be normalized but not sanitized into meaningless messages

---

## Injection Vectors Beyond SQL

Must also consider:

* command injection via dynamic query builders
* malformed JSON payloads in Tauri commands
* metadata filter injection (WHERE clause construction)
* aggregation pipeline injection (MongoDB)

---

## Anti-Pattern Rules

Reject:

* trusting frontend validation for security
* building SQL strings from raw input
* exposing full database schema to UI without filtering rules
* shared credentials across engines
* global connection pools without isolation

---

## Multi-Engine Security Rule

Each engine has different risks:

* PostgreSQL → schema exposure, dynamic SQL risks
* MariaDB/MySQL → privilege escalation via metadata queries
* SQLite → local file manipulation risks
* MongoDB → aggregation injection risks
* SQL Server → procedure execution risks

Security rules must adapt per engine behavior.

---

## Golden Rule

The frontend is never trusted.

The IPC boundary is not safe by default.

Only the Rust backend enforces real security constraints.
