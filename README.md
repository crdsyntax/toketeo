# 🔱 Toketeo — Database Administration

**Toketeo** is a cross-platform database client built with **Rust + Tauri** and **React**. It turns everyday database administration into an RPG-like progression system — execute queries, earn XP, level up, unlock perks, and complete quests while managing your databases.

![Toketeo Logo](./frontend/public/logo2.svg)

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
- **Onboarding Tour** — Guided 7-step walkthrough on first launch with XP rewards
- **Connection Wizard** — Step-by-step guided connection setup
- **Performance Dashboard** — Track query duration, slow queries, and execution trends
- **Keyboard Shortcuts** — Full shortcut reference (`?` to open)
- **Cross-platform** — Native installers for Linux (.deb, .AppImage) and Windows (.zip portable)
- **DB Compare** — Schema and data comparison across connections with sync script generation

---

## 🏗️ Architecture

### Backend (Rust)

The desktop backend runs as a **Tauri** application written in Rust.

```
src-tauri/src/
├── application/
│   ├── explorer_service.rs       # Dump, restore, table sizes, integrity, SQL parsing
│   └── compare/                  # DB Compare module
│       ├── compare_service.rs    # Orchestrator: schema compare, data compare, script gen
│       ├── schema/               # Schema comparator, hash builder
│       ├── data/                 # Row comparator, hash generator, diff builder, PK resolver
│       └── script_generator/     # Sync SQL generators (MySQL, PostgreSQL, SQLite)
├── infrastructure/scheduler/     # Job engine, executors (backup, report, CSV)
│   ├── job_engine.rs             # Polling loop, cron calculation, event emission
│   └── executors.rs              # BackupExecutor, ReportExecutor, CsvExportExecutor
├── presentation/tauri/commands.rs    # Tauri IPC commands (incl. scheduler + compare)
├── models/                       # Shared structs (ScheduledJob, DumpSelection, CompareResult, etc.)
├── db/                           # Database driver trait + implementations per engine
├── storage.rs                    # SQLite persistence (connections, jobs, logs)
├── lib.rs                        # Plugin registration, invoke_handler
└── main.rs                       # Entry point
```

The backend uses `tauri_plugin_dialog` for native file dialogs and `tokio_postgres` / `mysql` / `sqlx` for database connectivity. Dump operations generate full DDL + data for tables and DDL-only for views, triggers, procedures, and functions.

### Frontend (React + TypeScript)

```
frontend/src/
├── components/
│   ├── assistant/      # Smart Assistant Hub (panels, wizard, tour, shortcuts)
│   ├── compare/        # DB Compare module
│   │   ├── SchemaCompareForm.tsx      # Connection/schema selectors, compare trigger
│   │   ├── SchemaDiffTree.tsx         # Expandable diff tree with descriptions
│   │   ├── DataCompareForm.tsx        # Data comparison config + progress
│   │   ├── DataDiffTable.tsx          # Expandable data diff with row details
│   │   ├── ScriptPreview.tsx          # Sync script editor (copy, download, toggle statements)
│   │   ├── SyncProgressModal.tsx      # Pause/resume/cancel sync with real-time progress
│   │   └── FullscreenModal.tsx        # Fullscreen overlay with minimize-to-pill
│   ├── connections/    # Connection tree, DumpRestoreModal
│   ├── gamification/   # LevelBadge, GamificationModal, FeatureGate, ThemeProvider
│   ├── scheduler/      # JobCard, JobFormModal
│   └── query/          # SQL editor, results grid
├── pages/
│   └── ComparePage.tsx # Full compare page with tabs (Schema, Data, Script)
├── store/              # Zustand stores (app, gamification, assistant, performance, scheduler, compare)
├── hooks/              # Custom hooks (useQueryEditor, etc.)
├── services/           # Tauri IPC service wrappers
├── lib/                # Gamification core (config, missions, unlocks)
└── types/              # TypeScript type definitions
```

State management uses **Zustand** with persistence (localStorage). The gamification store saves XP, level, quest progress, unlocked perks, and query hashes across sessions.

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

---

## 📁 Project Structure

```
toketeo/
├── src-tauri/              # Rust/Tauri backend
│   └── src/
│       ├── application/    # Business logic (dump, restore, compare, integrity)
│       │   ├── compare/    # Schema + data comparison, diff builder, script generators
│       │   └── explorer_service.rs
│       ├── db/             # Database drivers (MySQL, PostgreSQL, SQL Server, MongoDB, SQLite)
│       ├── infrastructure/ # Scheduler engine, executors
│       ├── presentation/   # Tauri commands
│       ├── models/         # Data structures
│       ├── storage.rs      # SQLite persistence
│       ├── lib.rs          # Plugin & command registration
│       └── main.rs         # App entry point
├── frontend/               # React + Vite app
│   └── src/
│       ├── components/     # React components (compare/, scheduler/, assistant/, query/)
│       ├── pages/          # Route-level pages (ComparePage, AssistantPage, etc.)
│       ├── store/          # Zustand state stores
│       ├── hooks/          # Custom React hooks
│       ├── services/       # Tauri IPC wrappers
│       └── lib/            # Gamification engine
├── package.json            # Root scripts
└── README.md               # You are here
```

---

## ✒️ Author

**crdsyntax** — *Full-stack development* — [GitHub](https://github.com/crdsyntax)
