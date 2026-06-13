export class QueryHistoryEntity {
  id: string;
  connectionId: string;
  userId: string;
  sql: string;
  executionTime: number;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  executedAt: Date;
}
