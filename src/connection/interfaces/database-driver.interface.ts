export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery<T>(sql: string, params?: unknown[]): Promise<T>;
  getTables(): Promise<string[]>;
  getColumns(table: string): Promise<unknown[]>;
  getDDL(name: string, type?: 'table' | 'view' | 'procedure' | 'trigger'): Promise<string>;
  getParameters?(name: string, type: 'procedure' | 'function' | 'view'): Promise<unknown[]>;
  getViews?(): Promise<string[]>;
  getProcedures?(): Promise<string[]>;
  getTriggers?(): Promise<string[]>;
  cancelQuery?(): Promise<void>;
}
