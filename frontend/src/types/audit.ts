export interface AuditEntry {
  id?: number;
  connection_id: string;
  query: string;
  timestamp: string;
  execution_time_ms: number;
  status: 'success' | 'error';
  error?: string;
  /** Who ran it: 'user' | 'assistant' | 'monitor'. */
  origin?: string;
}
