# AI Agents & Project Governance

Defines architectural standards, development rules, and AI agent roles for the Toketeo project (Rust + Tauri + React multi-database client).

## Structure

- `core/`: Engineering & security standards (always loaded).
- `backend/`: Rust/Tauri backend roles and database standards.
- `frontend/`: React/TypeScript UI standards and roles.
- `reviews/`: Code review guidelines.
- `qa/`: Testing standards.
- `database/`: Engine-specific expert profiles (loaded on demand).
- `project/`: Roadmap and planning docs (not agent profiles).

## Usage

All AI interactions must load `core/` files and the relevant profile from `AGENTS.md`.