import { tauriApi } from '@/lib/api'
import type { QueryResult } from '@/types/database'

export const queryService = {
  /**
   * Executes a query using the native Rust backend via Tauri IPC.
   */
  execute: async (id: string, query: string, schema?: string, params?: unknown[], page?: number, pageSize?: number) => {
    const args: Record<string, unknown> = { id, query };
    if (schema) args.schema = schema;
    if (params) args.params = params;
    if (page !== undefined) args.page = page;
    if (pageSize !== undefined) args.pageSize = pageSize;
    console.log('[toketeo] query.service.execute >>', JSON.stringify({ id, schema: schema ?? null, page, pageSize, sqlPreview: query.substring(0, 200) }));
    return await tauriApi.invoke<QueryResult>('execute_query', args)
  },

  cancel: async (id: string) => {
    console.warn(`Query cancellation not yet implemented in Rust for connection ${id}`)
  }
}
