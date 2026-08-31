import { tauriApi } from '@/lib/api';
import type { SqlFlowGraph, ParseSqlFlowParams, GetSqlFlowDataParams } from '@/types/sqlFlow';

export const sqlFlowService = {


  parseFlow: async (params: ParseSqlFlowParams): Promise<SqlFlowGraph> => {
    return await tauriApi.invoke<SqlFlowGraph>('parse_sql_flow', {
      query: params.query,
      dialect: params.dialect,
    });
  },



  getFlowData: async (params: GetSqlFlowDataParams): Promise<SqlFlowGraph> => {
    return await tauriApi.invoke<SqlFlowGraph>('get_sql_schema_flow_data', {
      query: params.query,
      connectionId: params.connectionId,
      schema: params.schema,
      dialect: params.dialect,
    });
  },
};
