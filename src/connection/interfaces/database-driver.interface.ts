export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery<T>(sql: string, params?: any[]): Promise<T>;

  getTables(): Promise<string[]>;
  getColumns(table: string): Promise<any[]>;
  getDDL(table: string): Promise<string>;

  // New abstraction methods
  getViews?(): Promise<string[]>;
  getProcedures?(): Promise<string[]>;
  getTriggers?(): Promise<string[]>;
}
