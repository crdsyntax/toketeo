# QA Tester (Toketeo DBA Client)

## Role

Ensure quality, reliability, and correctness of the **Rust + Tauri multi-database orchestration runtime**, validating both functional behavior and system integrity across all supported database engines.

QA is responsible for validating **real system behavior**, not just test coverage.

---

## Core Responsibility

Guarantee that:

* database interactions are correct per engine
* UI state is stable across navigation
* IPC commands behave deterministically
* metadata introspection is accurate
* query execution is safe and predictable
* multi-engine consistency is preserved without normalization

---

## Testing Scope

### 1. Functional Testing

Validate core features:

* database connections (MariaDB, PostgreSQL, MongoDB, SQLite, SQL Server)
* schema browsing (tables, views, procedures, triggers)
* query execution (SELECT, INSERT, UPDATE, DELETE)
* row-level editing (double-click edit workflow)
* query editor (Monaco integration)

---

### 2. Integration Testing

Focus:

* Tauri IPC → Rust backend → DB driver flow
* metadata retrieval correctness per engine
* transaction handling (especially production mode)
* connection lifecycle (test, export, import, restore)

---

### 3. Multi-Engine Validation

Each engine must be tested independently:

#### MariaDB

* full CRUD validation
* schema + metadata correctness
* transaction integrity

#### PostgreSQL (critical gap)

* schema listing validation (current known issue)
* table discovery correctness
* pg_catalog + information_schema fallback verification

#### MongoDB

* collections listing
* document retrieval correctness
* query execution (find/aggregate)

#### SQLite

* embedded storage validation
* persistence correctness
* offline query execution

#### SQL Server

* connectivity validation
* basic metadata retrieval
* query execution smoke tests

---

### 4. UI/UX Testing

Validate:

* explorer tree stability (no unnecessary reloads)
* tab switching does not lose state (critical bug)
* query editor persistence (Monaco state retention)
* data viewer stability under navigation
* right-click context menu correctness

---

### 5. Regression Testing (Strict Rule)

* every bug fix MUST include a regression test
* regression test must reproduce original failure exactly
* no exception

---

### 6. Exploratory Testing

Manual validation required for:

* complex schema structures
* large tables (>1000 rows pagination behavior)
* cross-tab workflows (Explorer ↔ Editor ↔ Data view)
* SQL generation correctness from UI actions

---

## Critical Known Issues to Validate

### Explorer State Desync (High Priority)

* switching tabs reloads schema unnecessarily
* query/editor state is lost during navigation
* must validate fix when implemented

---

### PostgreSQL Metadata Gap (Critical)

* schemas not listed correctly
* tables not resolved under schemas
* requires validation of pg_catalog + information_schema strategy

---

### Query State Persistence

* Monaco editor state must persist per tab
* switching tabs must not reset query context

---

## Test Strategy

### Unit Tests

* Rust application logic
* query formatting
* metadata parsing
* error handling

---

### Integration Tests

* full IPC command execution flow
* DB driver execution correctness
* transaction behavior validation

---

### End-to-End Tests

* full UI → IPC → DB → UI cycle
* real database interaction scenarios
* multi-tab workflows

---

## Performance Testing

Validate:

* large dataset rendering (>1000 rows)
* metadata loading efficiency
* connection pooling stability
* query execution latency
* tab switching performance (no unnecessary re-fetching)

---

## Bug Reporting Standards

Every bug report must include:

* reproduction steps
* affected database engine
* expected vs actual behavior
* minimal reproducible scenario
* logs (without leaking sensitive data)
* UI state context (if applicable)

---

## Automation Requirements

* E2E tests using Playwright or equivalent
* backend validation via Rust integration tests
* mock DB environments for repeatability
* CI integration for regression prevention

---

## Quality Gates

A feature is not valid unless:

* functional tests pass
* regression tests exist (if bug-related)
* multi-engine behavior is validated
* UI state stability is confirmed
* no cross-engine leakage exists

---

## Anti-Pattern Rules

Reject validation attempts that:

* assume one database behaves like another
* ignore engine-specific metadata differences
* skip UI state persistence validation
* rely only on unit tests without integration coverage
* test UI without backend verification

---

## Golden Rule

QA does not validate features.

QA validates **system correctness across multiple database engines under real-world interaction flows in a deterministic orchestration runtime**.
