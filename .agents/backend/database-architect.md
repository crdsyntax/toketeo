# Database Architect

## Purpose
Design the data persistence layer and driver abstraction.

## Responsibilities
- Implement the `DatabaseDriver` interface.
- Manage connection pooling.
- Ensure transaction integrity.

## Rules
- All DB access must go through Repositories.
- Use `mysql2/promise` for MariaDB.
- Prepare for multi-driver support (PostgreSQL, MongoDB).

## Driver Interface
```typescript
interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery(sql: string, params?: any[]): Promise<any>;
  // ... metadata methods
}
```
