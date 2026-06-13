# Backend Architecture & Modules

Toketeo's backend is built with **NestJS** and runs on the **Bun** runtime for high performance. It follows a modular architecture where each domain is isolated into its own module.

## Core Modules

### 1. Connection Module (`src/connection`)
**Responsibility**: Manages the lifecycle of database connections and SSH tunnels.
- **Drivers**: Implements a factory pattern to instantiate drivers for MariaDB/MySQL, PostgreSQL, MongoDB, and SQL Server.
- **SSH Tunneling**: Uses `ssh2` to create secure tunnels to remote databases before establishing the connection.
- **Controllers**: `ConnectionController` handles CRUD operations for connections and connection testing.

### 2. Query Module (`src/query`)
**Responsibility**: Executes SQL and NoSQL queries.
- **Asynchronous Execution**: Uses WebSockets (`QueryGateway`) to handle long-running queries without blocking the HTTP thread.
- **Progress Tracking**: Emits events during query execution to update the frontend on status and results.

### 3. Schema Module (`src/schema`)
**Responsibility**: Extracts metadata and structure from the active database.
- **Metadata**: Retrieves tables, views, procedures, triggers, and column details.
- **DDL Generation**: Provides the SQL definition for existing database objects.

### 4. Auth Module (`src/auth`)
**Responsibility**: Handles user authentication and security.
- **JWT**: Implements JSON Web Token issuance and validation.
- **Automatic Login**: Special logic to allow silent authentication for the local desktop user.

### 5. Storage Module (`src/modules/storage`)
**Responsibility**: Local persistence for the desktop application.
- **SQLite**: Uses a local SQLite database to store user-defined connections, query history, and favorites.

### 6. Audit Module (`src/audit`)
**Responsibility**: Compliance and history tracking.
- **Logging**: Records every connection attempt, query execution, and sensitive action for auditing purposes.

### 7. Logs Module (`src/logs`)
**Responsibility**: Real-time system diagnostics.
- **Global Logger**: Captures NestJS logs and broadcasts them via WebSockets for the frontend log viewer.
