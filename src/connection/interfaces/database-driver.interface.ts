export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery<T>(sql: string, params?: unknown[]): Promise<T>;
  getTables(): Promise<string[]>;
  getColumns(table: string): Promise<unknown[]>;
  getDDL(table: string): Promise<string>;
}

  // New abstraction methods
  getViews?(): Promise<string[]>;
  getProcedures?(): Promise<string[]>;
  getTriggers?(): Promise<string[]>;
}
