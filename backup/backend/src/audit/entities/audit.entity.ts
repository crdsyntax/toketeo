export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXECUTE_QUERY = 'EXECUTE_QUERY',
  LOGIN = 'LOGIN',
}

export class AuditEntity {
  id: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
