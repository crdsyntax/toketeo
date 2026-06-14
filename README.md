# 🔱 TOKETEO - Advanced Database Administration Panel

Toketeo is a cross-platform database client and administration panel built with **Rust**, **Tauri**, and **React**. Designed for a modern, fast, and secure experience in managing multiple database engines.

![Toketeo Logo](./frontend/public/logo.svg)

## ✨ Main Features

-   **Multi-engine Support**: MariaDB, MySQL, and PostgreSQL (fully implemented in Rust).
-   **Neobrutalist UI**: A bold, industrial aesthetic with high contrast and interactive "physical" buttons.
-   **SSH Tunneling**: Secure connection to remote databases using integrated SSH tunnels (Powered by Rust).
-   **Advanced SQL Editor**: Powered by Monaco Editor (VS Code core) with syntax highlighting, autocomplete, and multi-tab management.
-   **Schema Explorer**: Detailed visualization of tables, views, columns, indexes, foreign keys, and DDL.
-   **Direct Data Editing**: Double-click cells to update values directly in your tables.
-   **Connection Status**: Real-time indicators for "Active" vs "Connected" (Live Backend Session) states.
-   **Cross-platform**: Native performance on Linux and Windows.

---

## 🛠️ Technical Architecture

### Backend (Rust + Tauri)

The backend has been rewritten from NestJS to **Rust** to provide maximum performance and security.

-   **Runtime**: Tauri 2.0 (IPC-based communication).
-   **Drivers**: Built with `sqlx` for asynchronous, compile-time checked database interactions.
-   **State Management**: Thread-safe global state for managing connection pools and SSH sessions using `tokio::sync`.
-   **IPC Commands**: All database operations are exposed as secure Tauri Commands.

### Frontend (React + TypeScript)

Modern and reactive interface built with **Tailwind CSS** and **Shadcn UI**.

-   **Global State**: Managed with **Zustand**, with selective persistence for connection configurations and workspace layout.
-   **UI Design**: Neobrutalist aesthetic featuring squared corners, thick borders, and solid shadows.
-   **API Integration**: Uses `@tauri-apps/api/core` for seamless communication with the Rust core.

---

## 🚀 Installation & Development

### Prerequisites
-   [Bun](https://bun.sh/) (JavaScript runtime and package manager)
-   [Rust](https://www.rust-lang.org/) (Cargo and toolchain)
-   [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites) dependencies for your OS.

### Steps
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/crdsyntax/toketeo.git
    cd toketeo
    ```
2.  **Install dependencies**:
    ```bash
    bun install
    cd frontend && bun install && cd ..
    ```
3.  **Run in development mode**:
    ```bash
    bun tauri dev
    ```

---

## 📦 Build & Packaging

Toketeo uses Tauri's native bundler to generate optimized binaries.

### Production Build
```bash
bun tauri build
```
Binaries will be generated in `src-tauri/target/release/bundle/`.

---

## 📁 Project Structure

```text
toketeo/
├── src-tauri/         # Rust Backend (Tauri Core)
│   ├── src/
│   │   ├── commands/  # IPC Command handlers
│   │   ├── db/        # Database drivers (MySQL, Postgres)
│   │   ├── models/    # Shared data structures
│   │   └── state.rs   # Global application state
├── frontend/          # React Application (Vite)
│   ├── src/
│   │   ├── components/# Neobrutalist UI components
│   │   ├── hooks/     # Business logic & data fetching
│   │   ├── services/  # Tauri API wrappers
│   │   └── store/     # Zustand stores
├── README.md          # Project documentation
└── package.json       # Workspace scripts
```

---

## ⚖️ Legal Notice & License

This project is open for public use. However, **copying the original source code for commercial profit is strictly prohibited**. All intellectual property and original code rights belong exclusively to the author (**crdsyntax**). You are free to use, study, and modify the code for personal or non-commercial purposes, but any form of commercial exploitation of the original work is a violation of the author's rights.

---

## ✒️ Author
**crdsyntax** - *Full Stack Development* - [GitHub](https://github.com/crdsyntax)
