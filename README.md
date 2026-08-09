# 🔱 Toketeo — Database Administration

**Toketeo** is a cross-platform database client built with **Rust + Tauri** and **React**. It turns everyday database administration into an RPG-like progression system — execute queries, earn XP, level up, unlock perks, and complete quests while managing your databases.

![Toketeo Logo](./frontend/public/principal.png)

---

## 🎮 The Gamification System

Toketeo makes database work feel like a game. Every action awards experience points (XP) that raise your level and unlock new features.

| Action | XP | Details |
|--------|----|---------|
| **Execute SQL** | *Dynamic* (2–150+) | Complex queries (JOINs, CTEs, DDL) earn more XP. First-time queries get a **1.5x bonus**. |
| **Edit a row** | 10 XP | Direct inline edits in the data browser. |
| **Export data** | 25 XP | Export results as CSV or JSON. |
| **Create a connection** | 50 XP | Every new database connection. |
| **Daily login** | 25–200 XP | Consecutive daily logins award increasing XP (capped at 200). |

### 📊 Levels & Ranks

```
Level 1–4     Data Novice
Level 5–9     Query Scrapper
Level 10–14   Schema Explorer
Level 15–19   Query Knight
Level 20–29   Database Artisan
Level 30–39   Query Architect
Level 40–49   Data Wizard
Level 50–74   DBA Overlord
Level 75–99   Grandmaster of Data
Level 100+    God of Data
```

The XP curve is exponential — early levels fly by, but reaching the endgame requires dedication.

### 🎯 Quests

21 missions across 5 categories track your progress and award bonus XP on completion:

- Execute queries (1 → 10,000)
- Edit rows (1 → 1,000)
- Create connections (1 → 10)
- Export data (1 → 200)
- Daily logins (1 → 365)

### 🔓 Unlockable Perks

Level up to unlock features permanently:

| Perk | Unlocks At | What You Get |
|------|-----------|-------------|
| Advanced Theming | Level 5 | Custom colors, contextual tips, connection help |
| AI Query Assistant | Level 10 | Conversational SQL generation, /assistant page, keyboard shortcuts |
| Data Visualizer | Level 15 | Performance dashboard, schema insights |
| Query Scheduler | Level 1 | Scheduled query execution (backup, report, CSV export) |
| Cross-DB Sync | Level 30 | Multi-engine data synchronization |

---

## ✨ Core Features

- **Multi-engine support** — MariaDB, MySQL, PostgreSQL, MongoDB, SQL Server
- **SSH Tunnels** — Secure connections via SSH jump hosts
- **Monaco SQL Editor** — Full-featured editor with syntax highlighting, autocompletion, multi-tab
- **Object Explorer** — Browse tables, views, columns, indexes, foreign keys, DDL generation
- **Dump & Restore** — Select specific objects (tables, views, triggers, procedures, functions) via tabbed UI, run integrity checks after dump, open file location straight from the toast
- **Query Scheduler** — Schedule recurring backups, reports, and CSV exports via cron expressions. Three job types: Backup (pg_dump/mysqldump/sqlite3), Report (query → JSON), CSV Export (query → CSV). Real-time notifications on completion.
- **Export** — Download query results as CSV or JSON
- **Real-time Logs** — WebSocket-powered server event streaming
- **Audit Trail** — Automatic logging of user actions and query execution
- **Smart Assistant Hub** — AI query generation, performance insights, schema analysis, app tips, and connection help — all in one place
- **AI SQL Fixer** — when a query fails to execute, the assistant analyzes the database error against the current connection's schema (tables, columns, foreign keys) and suggests a corrected query plus safer alternatives — e.g. avoiding cartesian products from wrong joins — with one-click replace in the editor
- **Onboarding Tour** — Guided 7-step walkthrough on first launch with XP rewards
- **Connection Wizard** — Step-by-step guided connection setup
- **Performance Dashboard** — Track query duration, slow queries, and execution trends
- **Keyboard Shortcuts** — Full shortcut reference (`?` to open)
- **Cross-platform** — Native installers for Linux (.deb, .AppImage) and Windows (.msi, .zip portable)
- **DB Compare** — Schema and data comparison across connections with sync script generation
- **Cross-DB Sync** — Pipeline-based data synchronization between engines (full or incremental)

---

## 🏗️ Architecture

### Backend (Rust)

The desktop backend runs as a **Tauri** application written in Rust.

```
src-tauri/src/
├── application/                    # Business logic
│   ├── assistant/                  # Smart Assistant Hub
│   │   ├── adapters/               # AI providers (OpenAI, Claude, Gemini, DeepSeek, Ollama, OpenCode)
│   │   ├── context/                # Schema engine + relevance filtering
│   │   ├── history/ knowledge/ learning/   # Memory, knowledge base, learning engine
│   │   ├── orchestrator.rs         # Chat orchestration + SQL block extraction
│   │   ├── prompt/                 # Prompt builder
│   │   ├── sql_fixer.rs            # AI-powered SQL fix suggestions
│   │   └── tools/                  # Tool engine (query, DDL, compare, sync, backup, export, …)
│   ├── audit_service.rs            # Action & query audit logging
│   ├── auth_service.rs             # Authentication, TOTP, keyring
│   ├── compare/                    # Schema + data comparison & sync script generators
│   ├── connection_service.rs       # Connection lifecycle, database switching
│   ├── explorer_service.rs         # Explorer, dump/restore, table sizes, integrity
│   ├── model_generator_service.rs  # ORM model generation
│   ├── monitoring_service.rs       # Performance monitoring
│   ├── session_service.rs          # Metadata cache
│   ├── sql_generator_service.rs    # Safe SQL generation
│   └── sync/                       # Cross-DB sync engine (extractors, strategies, validators)
├── infrastructure/
│   ├── crypto.rs                   # Keyring-backed encryption
│   ├── database/                   # Connection string builder
│   ├── drivers/                    # Driver factory
│   └── scheduler/                  # Job engine + executors (backup, report, CSV)
├── db/                             # Driver trait + MySQL, PostgreSQL, SQL Server, MongoDB, SQLite, Redis
├── presentation/tauri/             # Tauri IPC commands (commands.rs, assistant_commands.rs)
├── models/                         # Shared structs (assistant, compare, sync, diagram)
├── ssh/                            # SSH tunnel support
├── state.rs                        # Shared application state
├── storage.rs                      # SQLite persistence (connections, jobs, logs)
├── lib.rs                          # Plugin registration, invoke_handler
└── main.rs                         # Entry point
```

The backend uses `tauri_plugin_dialog` for native file dialogs and `tokio_postgres` / `mysql` / `sqlx` for database connectivity, plus dedicated drivers for MongoDB, SQL Server and Redis. Dump operations generate full DDL + data for tables and DDL-only for views, triggers, procedures, and functions. Connections are kept in an `AppState` registry with a metadata cache and per-connection session state.

### Frontend (React + TypeScript)

```
frontend/src/
├── components/
│   ├── assistant/      # Smart Assistant Hub (panels, SQL fixer popup, wizard, tour)
│   ├── compare/        # DB Compare module
│   ├── connections/    # Connection tree, DumpRestoreModal
│   ├── editor/         # SQL editor components
│   ├── explorer/       # Object explorer (sidebar, object detail, DDL, add column/index/FK)
│   ├── gamification/   # LevelBadge, GamificationModal, FeatureGate, ThemeProvider
│   ├── layout/         # App header, splash screen
│   ├── query/          # SQL editor panel, results grid, error popups
│   ├── scheduler/      # JobCard, JobFormModal
│   ├── security/       # Security settings UI
│   ├── sync/           # Cross-DB sync pipelines UI
│   ├── ui/             # Shared UI primitives
│   └── update/         # Update modal
├── pages/              # QueryEditor, Explorer, Assistant, Compare, Scheduler, Monitor, …
├── store/              # Zustand stores (app, gamification, assistant, performance, scheduler, compare)
├── hooks/              # useQueryEditor, useExplorer, …
├── services/           # Tauri IPC service wrappers
├── lib/                # Gamification core, mongo shell parser, engine icons
└── types/              # TypeScript type definitions
```

State management uses **Zustand** with persistence (localStorage). The gamification store saves XP, level, quest progress, unlocked perks, and query hashes across sessions. Editor state (tabs, explorer tabs, view state) is also persisted per connection.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (JavaScript runtime)
- [Rust](https://rustup.rs/) (stable toolchain)

### Setup

```bash
git clone https://github.com/crdsyntax/toketeo.git
cd toketeo

# Install backend & frontend dependencies
bun install
cd frontend && bun install && cd ..
cd src-tauri && cargo check && cd ..
```

### Development

```bash
bun run tauri:dev
```

This starts the Vite dev server and launches the Tauri window with hot-reload.

---

## 📦 Building for Production

### Linux

```bash
bun run tauri:build
```

Artifacts are generated in `src-tauri/target/release/bundle/`.

### Windows

```bash
bun run tauri:build -- --target x86_64-pc-windows-msvc
```

Produces an **MSI installer** (and portable `.zip`) in `src-tauri/target/release/bundle/`. Signed releases are published via `scripts/publish-update.ps1`, which signs the MSI with the project signing key and uploads it with `latest.json` to the update endpoint.

---

## 📁 Project Structure

```
toketeo/
├── src-tauri/              # Rust/Tauri backend
│   └── src/
│       ├── application/    # Business logic (assistant, compare, explorer, sync, audit)
│       │   ├── assistant/  # Smart Assistant Hub (adapters, tools, sql_fixer)
│       │   └── compare/    # Schema + data comparison, diff builder, script generators
│       ├── db/             # Database drivers (MySQL, PostgreSQL, SQL Server, MongoDB, SQLite, Redis)
│       ├── infrastructure/ # Scheduler engine, executors, crypto, drivers
│       ├── presentation/   # Tauri IPC commands
│       ├── models/         # Data structures
│       ├── ssh/            # SSH tunnel support
│       ├── storage.rs      # SQLite persistence
│       ├── lib.rs          # Plugin & command registration
│       └── main.rs         # App entry point
├── frontend/               # React + Vite app
│   └── src/
│       ├── components/     # React components (assistant/, compare/, explorer/, query/, …)
│       ├── pages/          # Route-level pages (QueryEditor, Explorer, AssistantPage, …)
│       ├── store/          # Zustand state stores
│       ├── hooks/          # Custom React hooks
│       ├── services/       # Tauri IPC wrappers
│       └── lib/            # Gamification engine, utilities
├── scripts/                # Release helpers (publish-update.ps1)
├── package.json            # Root scripts
└── README.md               # You are here
```

---

## ✒️ Author

**crdsyntax** — *Backend development* — [GitHub](https://github.com/crdsyntax)
