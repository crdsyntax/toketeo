# Contributing to Toketeo

Thanks for your interest. To keep the codebase stable and reviewable, we enforce a few simple rules.

## Contribution policy

- **Open an issue first.** Every pull request must reference a linked issue (`Fixes #123`). Use the [issue templates](.github/ISSUE_TEMPLATE) for bugs and feature requests.
- **Fork-only contributions.** Do **not** push directly to branches in `crdsyntax/toketeo`. Open pull requests from your own fork. The `main` branch is protected and the PR gate will reject direct pushes.
- **One concern per PR.** Keep changes focused and reviewable.

## Setup

Dependencies:

- [Bun](https://bun.sh) for the frontend.
- Rust toolchain (rustfmt, clippy) for `src-tauri`.

```sh
# Frontend
cd frontend && bun install

# Install pre-commit hooks (validates your changes before every commit)
pip install pre-commit
pre-commit install
```

## Before you push

Run all checks locally — CI will fail otherwise:

```sh
# Frontend (from frontend/)
bun run lint        # 0 errors expected
bunx tsc -b         # type check
bun run test        # vitest

# Backend (from src-tauri/)
cargo fmt --all -- --check
cargo clippy --lib --all-targets -- -D warnings
cargo test --lib
```

You can also run the whole set at once with `pre-commit run --all-files`.

## Security

- Never commit secrets, tokens, or signing keys.
- Releases are signed with a standalone signing key; see `AGENTS.md` for the signing workflow used by `scripts/publish-update.ps1`.