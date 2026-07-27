# Tauri Build & Packaging Guide

Toketeo is distributed as a desktop application via **Tauri 2**. This document explains the build and packaging process.

## Prerequisites

See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-specific build tools (WebView2, system libraries, etc.).

## Build Pipeline

Tauri handles both the Rust backend compilation and the frontend bundling:

```bash
# Development
bun run dev          # tauri dev — full app with hot-reload

# Production build
bun run build        # tauri build — produces platform installer
```

### Build Artifacts

Output: `src-tauri/target/release/bundle/`

| Platform | Format |
|----------|--------|
| Linux | `.deb`, `.AppImage` |
| Windows | `.msi`, `.nsis` |
| macOS | `.dmg` |

## Data Persistence

In the packaged version, all user data (SQLite database, logs) is stored in the standard app data directory managed by Tauri:
- **Linux**: `~/.local/share/com.toketeo.app/`
- **Windows**: `%APPDATA%/com.toketeo.app/`
- **macOS**: `~/Library/Application Support/com.toketeo.app/`
