export declare enum AuditAction {
    CREATE = "CREATE",
    UPDATE = "UPDATE",
    DELETE = "DELETE",
    EXECUTE_QUERY = "EXECUTE_QUERY",
    LOGIN = "LOGIN"
}
export declare class AuditEntity {
    id: string;
    userId: string;
    action: AuditAction;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    timestamp: Date;
}
