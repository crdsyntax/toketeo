# Frontend Architecture & Components

The frontend is a single-page application (SPA) built with **React**, **Vite**, and **Tailwind CSS**, embedded within **Electron**.

## Core Concepts

### 1. State Management (Zustand)
Located in `frontend/src/store/useAppStore.ts`.
- **Zustand**: Used for its simplicity and performance.
- **Persistence**: Selected parts of the state (connections, theme, sidebar status) are persisted in `localStorage`.
- **Query Tabs**: Manages a collection of SQL editor tabs, each with its own query, status, and results.

### 2. Custom Hooks
- **`useQueryEditor`**: The heart of the SQL interface. Handles tab creation/deletion, query execution (via WebSocket or HTTP), result formatting, and sorting.
- **`useExplorer`**: Manages the database schema tree, handles object selection, and fetches metadata (columns, indexes, DDL).
- **`useSystemStatus`**: Monitors the connection to the backend and the status of local services via WebSockets.

### 3. Key Components
- **`SqlEditorPanel`**: Wraps the **Monaco Editor**. Provides a high-fidelity SQL editing experience.
- **`ResultsPanel`**: Displays query results in a virtualized table with support for inline editing, sorting, and CSV export.
- **`ExplorerSidebar`**: A hierarchical view of the database structure (Tables, Views, Procedures, etc.).
- **`ConnectionModal`**: Dynamic form for creating and testing database connections, including SSH configuration.

### 4. API Layer
- **`apiClient` (`lib/api.ts`)**: An Axios instance configured with interceptors to automatically include the JWT `Authorization` header and handle base URL resolution dynamically for Electron.
- **Services**: Domain-specific services (`query.service.ts`, `schema.service.ts`, etc.) encapsulate API calls.
