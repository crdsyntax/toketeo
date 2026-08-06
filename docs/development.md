# Development Workflow & Contributing

Toketeo is a **Rust + Tauri + React** multi-engine database client. Contributions must preserve engine fidelity, IPC type safety, and clean layer separation.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/) (frontend tooling)
- Platform build tools for Tauri (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Setup

```bash
git clone https://github.com/crdsyntax/toketeo.git
cd toketeo

bun install
cd frontend && bun install && cd ..
cd src-tauri && cargo check && cd ..
```

## Run

```bash
# Full desktop app (Vite + Tauri)
bun run dev
# or
bun run tauri:dev   # if defined in your local scripts; default is `bun run dev` → tauri dev

# Frontend only (no Rust window)
bun run frontend:dev
```

## Build

```bash
bun run build
# Windows target example:
# bunx tauri build --target x86_64-pc-windows-msvc
```

Artifacts: `src-tauri/target/release/bundle/`.

---

## Principles

Aligned with `agents/core/standards.md` and Tech Leader roles:

| Rule | Meaning |
|------|---------|
| **Backend = orchestration runtime** | Not an HTTP/Nest app. Commands → application → drivers. |
| **Frontend = metadata renderer** | No invented schema semantics; Rust DTOs are truth. |
| **Engine fidelity** | Do not normalize PostgreSQL / MySQL / Mongo / etc. into one model. |
| **KISS / SOLID (adapted)** | Thin commands; no SQL in IPC handlers; no UI logic in Rust. |
| **Strict typing** | Explicit Rust return types; no `any` at TS IPC boundaries. |
| **Fail fast** | Validate at command boundary; `AppResult` everywhere fallible. |

Agent process for non-trivial work (see `AGENTS.md`):

1. Analyze → 2. Plan → 3. List files → 4. Wait approval → 5. One change → 6. Stop

---

## Branching

- `feature/<short-name>` — new capability
- `fix/<short-name>` — bugfix
- `docs/<short-name>` — documentation only
- Keep PRs focused on a single concern.

---

## Verification (required before PR)

### Backend (priority)

```bash
cd src-tauri
cargo check --lib
# Prefer also:
cargo clippy --lib -- -D warnings   # when clean enough for the change
```

### Frontend

```bash
cd frontend
bun run lint
# Typecheck (when tsc is available in frontend):
npx tsc --noEmit
```

### Root helpers

```bash
bun run lint          # frontend eslint
bun run format        # prettier on rs/ts/tsx (use carefully)
bun run docs:agents   # regenerate agent-context stubs if you change the generator
```

**Do not commit** if `cargo check` or frontend typecheck fails.

---

## Adding features by layer

### New Tauri command

1. Add typed command in `presentation/tauri/commands.rs` (validate + delegate only).
2. Implement orchestration in `application/*`.
3. Use `db::DbDriver` (or engine-specific code inside `db/*`) — never from the command body beyond calling services.
4. Register in `lib.rs` `invoke_handler`.
5. Add/adjust frontend `services/*.ts` + `types/*` in the same PR.
6. Update `docs/backend-modules.md` / `docs/frontend-modules.md` if the module surface changes.

### New database driver capability

1. Extend `DbDriver` (or a segregated trait) in `db/mod.rs` with a default or engine-specific impl.
2. Implement per engine under `db/*.rs` without forcing unsupported engines to fake behavior.
3. Keep metadata raw; no cross-engine “universal schema” types beyond shared IPC DTOs.

### DB Compare changes

| Area | Path |
|------|------|
| Orchestration | `application/compare/compare_service.rs` |
| Schema diffs | `application/compare/schema/` |
| Data diffs | `application/compare/data/` |
| SQL generators | `application/compare/script_generator/generators/` |
| DTOs | `models/compare.rs` ↔ `frontend/src/types/compare.ts` |
| IPC | `compare_schemas`, `compare_data`, `generate_sync_script`, pause/resume/cancel |
| UI | `pages/ComparePage.tsx`, `components/compare/*`, `store/compareStore.ts` |

UI must not reimplement structural or row diffs. Presentation and selection only.

### Frontend-only UI

1. Prefer presentational components under `components/`.
2. Call backend only through `services/*` → `tauriApi.invoke`.
3. Zustand holds raw responses + UI state (loading, expansion, selection) — not derived domain graphs.

---

## Testing

| Layer | Approach |
|-------|----------|
| Rust | Unit tests next to modules where pure logic exists (comparators, normalizers, generators). `cargo test` in `src-tauri`. |
| Frontend | Vitest/React Testing Library under `frontend` (`*.test.ts(x)`). Prefer testing hooks/components with mocked `invoke`. |
| Manual | Two live connections for Compare; verify pause/cancel and script download on target engine. |

There is no NestJS e2e suite. Do not add `test:e2e` expectations from the old stack.

---

## Documentation

When you change behavior or module boundaries, update the matching docs:

| Doc | Content |
|-----|---------|
| `README.md` | User-facing features and high-level layout |
| `docs/backend-modules.md` | Rust layers and modules |
| `docs/frontend-modules.md` | React structure, stores, Compare UI |
| `docs/database-drivers.md` | `DbDriver` contract and engines |
| `docs/agent-context/*` | Agent orientation (architecture, stack, entrypoints) |
| `docs/compare_implementation_plan.md` | Historical plan; mark completed sections if still used |
| `docs/implementation_plan.md` | Cross-DB Sync refactor plan (non-technical UX) |
| `docs/assistant_implementation_plan.md` | Intelligent Assistant plan (AI adapter, learning, knowledge, tools) |

Do not leave NestJS/Electron references in active docs.

---

## Security checklist (every change)

- [ ] No secrets in logs, commits, or IPC payloads to the UI
- [ ] Identifiers quoted / parameters used where dynamic SQL is required
- [ ] Credentials only in Rust (crypto/keyring); UI never stores passwords in plain localStorage
- [ ] Command inputs validated before driver use

---

## Definition of Done (summary)

Full checklist: `agents/project/definition-of-done.md`.

Minimum bar:

1. Layers respected (command → application → infrastructure/driver).
2. `cargo check --lib` clean.
3. Frontend lint/typecheck clean for touched files.
4. TS types match Rust serde DTOs for any IPC change.
5. Docs updated when public module surface changes.
6. No engine-behavior hidden behind fake abstractions.

---

## Golden Rule

Correctness, isolation, and determinism override convenience. Prefer a small, explicit engine-specific change over a clever cross-engine abstraction.
)
