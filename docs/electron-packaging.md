# Electron & Packaging Guide

Toketeo is distributed as a desktop application using **Electron**. This document explains the integration and the build process.

## Main Process (`electron/main.js`)
The main process is responsible for:
1.  **Backend Management**: Spawning the NestJS server as a child process.
2.  **Path Resolution**: Ensuring that the application finds its `.env` file and data directory regardless of how it's launched.
3.  **Logging**: Capturing backend stdout/stderr and saving it to a local file for troubleshooting.
4.  **Window Management**: Creating the browser window with appropriate security settings (contextIsolation, preload).

## Build Pipeline
We use `electron-builder` to package the application.

### 1. Build Artifacts
The process involves three steps:
-   `nest build`: Compiles the NestJS backend to the `dist/` folder.
-   `vite build`: Compiles the React frontend to the `frontend/dist/` folder.
-   `electron-builder`: Bundles both distributions into a platform-specific installer.

### 2. Linux Packaging (.deb)
**Command**: `bun run electron:pack`
-   Generates a Debian package.
-   Targets x64 architecture.
-   Output: `dist-electron/toketeo_0.1.0_amd64.deb`.

### 3. Windows Packaging (.zip)
**Command**: `bun run electron:pack:win`
-   Generates a portable ZIP archive.
-   Avoids Wine dependency on Linux build hosts by using the `zip` target.
-   Output: `dist-electron/Toketeo-0.1.0-win.zip`.

## Data Persistence
In the packaged version, all user data (SQLite database, logs) is stored in the standard user data directory:
-   **Linux**: `~/.config/toketeo/`
-   **Windows**: `%AppData%/toketeo/`
