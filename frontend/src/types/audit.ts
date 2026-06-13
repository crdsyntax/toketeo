export enum AuditAction {
  CREATE_CONNECTION = 'CREATE_CONNECTION',
  UPDATE_CONNECTION = 'UPDATE_CONNECTION',
  DELETE_CONNECTION = 'DELETE_CONNECTION',
  EXECUTE_QUERY = 'EXECUTE_QUERY',
  EXPORT_DATA = 'EXPORT_DATA',
  SCHEMA_CHANGE = 'SCHEMA_CHANGE',
}

export interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}
