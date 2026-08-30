import { tauriApi } from '@/lib/api';
import type { SqlFlowGraph, ParseSqlFlowParams, GetSqlFlowDataParams } from '@/types/sqlFlow';

export const sqlFlowService = {
  /**
   * Envía la consulta SQL al runtime de Rust para extraer el AST y generar el grafo de entidades y relaciones.
   */
  parseFlow: async (params: ParseSqlFlowParams): Promise<SqlFlowGraph> => {
    return await tauriApi.invoke<SqlFlowGraph>('parse_sql_flow', {
      query: params.query,
      dialect: params.dialect,
    });
  },

  /**
   * Orquesta en el runtime de Rust el parseo del AST, la ejecución de la consulta,
   * la decodificación nativa de tipos y la deduplicación de registros por entidad.
   */
  getFlowData: async (params: GetSqlFlowDataParams): Promise<SqlFlowGraph> => {
    return await tauriApi.invoke<SqlFlowGraph>('get_sql_schema_flow_data', {
      query: params.query,
      connectionId: params.connectionId,
      schema: params.schema,
      dialect: params.dialect,
    });
  },
};
