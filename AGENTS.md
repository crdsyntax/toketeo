# AI Instructions

Always load:
- agents/core/engineering.md
- agents/core/security.md

Profiles:

Backend:
- agents/backend/tech-leader.md
- agents/backend/architect.md
- agents/backend/engineer.md
- agents/backend/database.md

Frontend:
- agents/frontend/tech-leader.md
- agents/frontend/architect.md
- agents/frontend/engineer.md
- agents/frontend/frontend.md
- agents/frontend/component-architecture.md

QA:
- agents/qa/tester.md

Review:
- agents/reviews/review.md

Process:
1 Analyze
2 Plan
3 List files
4 Wait approval
5 One change
6 Stop

Never load unrelated agent files.

Signing / Releases:
- Use the signing key at `D:\Desktop\toketeo-signing\toketeo-signing.key` and its password file `D:\Desktop\toketeo-signing\signing_pass.txt` (same password always; do not rotate).
- Prefer `scripts/publish-update.ps1` for release signing.

Contribution policy (see CONTRIBUTING.md):
- Do NOT commit, push, create branches, or open PRs in this repo unless the user explicitly asks.
- PRs must come from forks; `main` is protected and the PR gate rejects direct pushes.
- Every PR must reference a linked issue ("Fixes #123") or explicitly check "No issue linked".
- Before any commit, run the CI checks locally:
  - `cd frontend` then `bun run lint`, `bunx tsc -b`, `bun run test`
  - `cd src-tauri` then `cargo fmt --all -- --check`, `cargo clippy --lib --all-targets -- -D warnings`, `cargo test --lib`
- The repo has pre-commit hooks configured in `.pre-commit-config.yaml`.