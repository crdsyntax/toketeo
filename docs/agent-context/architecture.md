# Architecture Summary

## Layers

- data: detected project area
- frontend: detected project area
- scripts: detected project area
- src-tauri: detected project area

## Expected Flow

- UI or client layer interacts with project services or commands.
- Business or orchestration logic should remain isolated from transport details.
- Data access and external integrations should be concentrated in dedicated modules.

## Guidance for Agents

- Follow the existing layering and avoid cross-cutting coupling.
- Preserve the current boundaries between runtime, infrastructure, and presentation code.
- Favor incremental changes that keep the architecture consistent.
