# Database Driver System

Toketeo supports a modular architecture for database drivers, allowing seamless expansion to new database types.

## Driver Interface
Every new database driver must implement the `DatabaseDriver` interface defined in `src/connection/interfaces/database-driver.interface.ts`.

### Interface Requirements:
-   **`connect()` / `disconnect()`**: Management of connection pools and SSH tunnels.
-   **`executeQuery(sql, params)`**: Standard execution.
-   **`executeQueryStream(sql, params)`**: Optional streaming support for large result sets.
-   **Metadata Methods**:
    -   `getTables()`, `getSchemas()`, `getViews()`
    -   `getColumns(table)`, `getIndexes(table)`
    -   `getForeignKeys(table)`, `getConstraints(table)`
    -   `getDDL(name, type)`
    -   `getParameters(name, type)`

## Supported Drivers
Located in `src/connection/drivers/`.

| Driver | Implementation | Notes |
| :--- | :--- | :--- |
| **MariaDB** | `mariadb.driver.ts` | Uses `mysql2/promise`. |
| **PostgreSQL** | `postgres.driver.ts` | Uses `pg`. |
| **MongoDB** | `mongodb.driver.ts` | Uses `mongodb` driver. |
| **SQL Server** | `sqlserver.driver.ts` | Uses `mssql` (TDS protocol). |

## Adding a New Driver
1.  **Install dependencies**: `bun add <driver-package>`
2.  **Implement the interface**: Create a new file in `src/connection/drivers/`.
3.  **Update `DatabaseType`**: Add the new type to `src/connection/dto/create-connection.dto.ts`.
4.  **Register in Factory**: Add a new case to `ConnectionService` factory in `src/connection/connection.service.ts`.
5.  **Frontend Update**: Add the new type to `frontend/src/types/database.ts` and add an option to `ConnectionModal.tsx`.
