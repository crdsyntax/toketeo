# Security

Security is enforced at the **Rust IPC boundary and database driver layer**, not in the UI. Assume:
- Frontend is hostile
- External databases are partially untrusted
- IPC payloads are attack vectors

Risk surface: Tauri IPC layer · Rust command runtime · database driver execution · SSH/tunnel credentials · CI/CD pipeline.

---

## Secrets Management

- No secrets in source code, logs, commits, debug output, or IPC payloads
- Credentials never reach frontend layer — decryption only inside Rust backend
- SQLite local storage must not contain plaintext credentials (encrypt if needed)
- No cross-engine credential reuse
- Inject secrets via environment variables, OS keychain, or encrypted local storage

---

## IPC Security

- All inputs validated at Tauri IPC boundary — strict typed deserialization
- Reject malformed/unexpected payloads immediately
- Tauri IPC is NOT a trusted boundary without validation
- Monitor command frequency, detect payload anomalies, flag unauthorized invocations
- Prevent IPC command flooding (DoS)

---

## Query & Driver Security

- All SQL uses prepared statements where supported — no dynamic SQL concatenation from user input
- Metadata filters validated before query execution
- MongoDB aggregation pipelines sanitized
- Engine-specific differences preserved — no cross-engine state leakage
- SSH tunnels use encrypted key storage
- Least-privileged database users
- Enforce TLS for external DB connections where supported

---

## CI/CD Security

Pipelines must enforce:
- `cargo check`, `cargo test`, `cargo audit`
- TypeScript strict mode checks
- Lint validation (Rust + TS)
- Forbidden pattern detection (unsafe SQL, hardcoded secrets)
- Secret scanning (git history + staged files)
- No build artifact produced if security checks fail
- No embedded secrets in compiled binaries
- No debug symbols exposing sensitive paths in production builds

---

## Runtime Monitoring

Track continuously:
- Query execution time distribution
- Failure rate per engine
- IPC command invocation frequency
- Metadata access frequency per schema/table
- Connection pool utilization per engine

Alert on:
- Repeated invalid IPC payloads
- Excessive metadata enumeration
- Sudden spikes in query failures
- Repeated auth/connection failures
- Suspicious cross-engine query patterns
- Unexpected access to system schemas

---

## Incident Response

| Phase | Action |
|---|---|
| **Detect** | Identify abnormal behavior via logs/metrics; classify severity |
| **Contain** | Isolate affected connection pool; disable suspicious IPC paths; rotate credentials if exposed |
| **Eradicate** | Remove unsafe patterns; patch vulnerable handlers; fix injection flaws |
| **Recover** | Restore safe execution state; reinitialize pools; validate engine integrity |
| **Review** | Root cause analysis; update validation rules; document failure mode |

---

## Audit

- All database access traceable to a Tauri command
- Structured logging with: engine type, execution time, command origin
- No silent execution paths
- Maintain audit trail of builds and deployments
- Track dependency versions across releases

---

## Dependency Security

- `cargo audit` for Rust vulnerabilities
- Monitor Tauri framework security updates
- Review SQLx and driver vulnerabilities
- Avoid unmaintained/unverified crates
- Lock dependency versions in production builds

---

## Anti-Patterns

Reject:
- Frontend validation for security enforcement
- Untracked database queries
- Raw engine credentials exposed to UI
- Ignoring per-engine security differences
- Bypassing `cargo audit` for convenience
- Storing secrets in `.env` without encryption
- Hardcoding credentials in Rust or TypeScript