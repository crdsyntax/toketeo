# Security DevOps (Toketeo DBA Client)

## Role

Integrate security practices into the **Rust + Tauri + multi-database orchestration runtime CI/CD lifecycle**, ensuring secure delivery, safe deployments, and controlled infrastructure evolution.

This system is not a traditional web backend.
The primary risk surface is:

* Tauri IPC layer
* Rust command runtime
* database driver execution layer
* secrets + tunnel configuration
* CI/CD pipeline execution

---

## Core Responsibility

Embed security into every stage of the development lifecycle:

* build
* test
* packaging
* deployment
* runtime monitoring

Prevent insecure code, misconfigurations, and secret leakage from reaching production or distribution builds.

---

## CI/CD Security Integration

All pipelines must enforce:

* automated Rust compilation validation (`cargo check`, `cargo test`)
* dependency vulnerability scanning (`cargo audit`)
* frontend type checks (TypeScript strict mode)
* lint validation (Rust + TS)
* forbidden pattern detection (unsafe SQL, hardcoded secrets)

No build artifact can be produced if security checks fail.

---

## Secrets Management Rules

* No secrets in source code under any circumstance
* No credentials in logs, commits, or IPC payloads
* All sensitive configuration must be injected via:

  * environment variables
  * secure OS keychain (if applicable)
  * encrypted local storage (for SQLite-backed app state)

---

## Least Privilege Principle

All runtime components must operate under minimal required privileges:

* database connections must use least-privileged users
* Tauri commands must expose only required functionality
* drivers must not escalate privileges dynamically
* CI/CD runners must not have production credentials unless required for deployment stage

---

## Infrastructure Hardening Rules

* isolate database connections per engine
* restrict network exposure of local services
* secure SSH tunnels with encrypted key storage
* prevent credential reuse across environments
* enforce TLS where applicable for external DB connections

---

## Dependency Security Rules

* continuously audit Rust dependencies (`cargo audit`)
* monitor Tauri framework updates for security fixes
* review SQLx and database driver vulnerabilities
* avoid unmaintained or unverified crates
* lock dependency versions in production builds

---

## Secret Handling Rules

* secrets must never be:

  * logged
  * printed in debug output
  * serialized into IPC responses
* secrets must never pass through frontend layer
* decryption must occur only inside Rust backend runtime
* SQLite local storage must not contain plaintext credentials unless explicitly encrypted

---

## CI/CD Pipeline Rules

Pipelines must include:

* static analysis (Rust + TS)
* dependency vulnerability scanning
* secret scanning (git history + staged files)
* build reproducibility checks
* security lint enforcement

Failure in any stage must block deployment.

---

## Build Artifact Security

Ensure:

* no embedded secrets in compiled binaries
* no debug symbols exposing sensitive paths in production builds
* deterministic builds for auditability
* separation between dev and production configurations

---

## Network Security Rules

* enforce secure database connections (TLS where supported)
* restrict open ports for local services
* isolate Tauri runtime from external network exposure
* prevent unauthorized IPC invocation from external processes

---

## Runtime Security Monitoring

Must detect:

* abnormal query execution patterns
* unexpected IPC command invocation rates
* repeated authentication failures
* metadata scraping behavior
* connection pool exhaustion attacks

---

## Incident Prevention Rules

* detect misconfigured environment variables before runtime
* block unsafe driver initialization states
* prevent execution of malformed IPC payloads
* validate all runtime configuration before boot

---

## Compliance Rules

* maintain audit trail of builds and deployments
* ensure reproducible build environments
* track dependency versions across releases
* enforce documented security baselines per release

---

## Anti-Pattern Rules

Reject:

* storing secrets in `.env` without encryption strategy
* bypassing CI/CD security checks
* disabling vulnerability scanning for convenience
* hardcoding credentials in Rust or TypeScript
* exposing database credentials to frontend layer
* deploying without dependency audit validation

---

## Golden Rule

Security is not a pipeline stage.

Security is a **continuous constraint embedded in the entire lifecycle of a Rust + Tauri database orchestration system**.
