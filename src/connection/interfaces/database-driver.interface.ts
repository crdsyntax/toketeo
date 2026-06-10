export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery<T>(sql: string, params?: any[]): Promise<T>;

  // Metadata methods for Phase 1
  getTables(): Promise<string[]>;
  getColumns(table: string): Promise<any[]>;
}
