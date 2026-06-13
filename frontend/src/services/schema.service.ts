import { apiClient } from '@/lib/api'
import type { 
  TableResponse, 
  ColumnResponse, 
  IndexResponse, 
  ForeignKeyResponse, 
  ConstraintResponse,
  ParameterResponse,
  Connection
} from '@/types/database'

export const schemaService = {
  getSchemas: async (connectionId: string) => {
    const response = await apiClient.get<string[]>(`/connections/${connectionId}/schema/schemas`)
    return response.data
  },

  getTables: async (connectionId: string, schema?: string) => {
    const response = await apiClient.get<TableResponse[]>(`/connections/${connectionId}/schema/tables`, {
      params: { schema }
    })
    return response.data
  },

  getViews: async (connectionId: string, schema?: string) => {
    const response = await apiClient.get<TableResponse[]>(`/connections/${connectionId}/schema/views`, {
      params: { schema }
    })
    return response.data
  },

  getProcedures: async (connectionId: string, schema?: string) => {
    const response = await apiClient.get<TableResponse[]>(`/connections/${connectionId}/schema/procedures`, {
      params: { schema }
    })
    return response.data
  },

  getTriggers: async (connectionId: string, schema?: string) => {
    const response = await apiClient.get<TableResponse[]>(`/connections/${connectionId}/schema/triggers`, {
      params: { schema }
    })
    return response.data
  },

  getColumns: async (connectionId: string, table: string, schema?: string) => {
    const response = await apiClient.get<ColumnResponse[]>(`/connections/${connectionId}/schema/tables/${table}/columns`, {
      params: { schema }
    })
    return response.data
  },

  getIndexes: async (connectionId: string, table: string, schema?: string) => {
    const response = await apiClient.get<IndexResponse[]>(`/connections/${connectionId}/schema/tables/${table}/indexes`, {
      params: { schema }
    })
    return response.data
  },

  getForeignKeys: async (connectionId: string, table: string, schema?: string) => {
    const response = await apiClient.get<ForeignKeyResponse[]>(`/connections/${connectionId}/schema/tables/${table}/foreign-keys`, {
      params: { schema }
    })
    return response.data
  },

  getConstraints: async (connectionId: string, table: string, schema?: string) => {
    const response = await apiClient.get<ConstraintResponse[]>(`/connections/${connectionId}/schema/tables/${table}/constraints`, {
      params: { schema }
    })
    return response.data
  },

  getDDL: async (connectionId: string, name: string, type: string, schema?: string) => {
    const response = await apiClient.get<{ ddl: string }>(`/connections/${connectionId}/schema/objects/${name}/ddl`, {
      params: { type, schema }
    })
    return response.data.ddl
  },

  updateDDL: async (connectionId: string, name: string, type: string, sql: string, schema?: string) => {
    await apiClient.post(`/connections/${connectionId}/schema/objects/${name}/ddl`, { sql }, {
      params: { type, schema }
    })
  },

  getParameters: async (connectionId: string, name: string, type: string, schema?: string) => {
    const response = await apiClient.get<ParameterResponse[]>(`/connections/${connectionId}/schema/objects/${name}/parameters`, {
      params: { type, schema }
    })
    return response.data
  },

  editColumn: async (connectionId: string, table: string, sql: string, schema?: string) => {
    await apiClient.post(`/connections/${connectionId}/schema/tables/${table}/columns`, { sql }, {
      params: { schema }
    })
  },

  dropColumn: async (connectionId: string, table: string, column: string, schema?: string) => {
    await apiClient.delete(`/connections/${connectionId}/schema/tables/${table}/columns/${column}`, {
      params: { schema }
    })
  },

  dropIndex: async (connectionId: string, table: string, index: string, schema?: string) => {
    await apiClient.delete(`/connections/${connectionId}/schema/tables/${table}/indexes/${index}`, {
      params: { schema }
    })
  },

  renameIndex: async (connectionId: string, table: string, oldName: string, newName: string, schema?: string) => {
    await apiClient.post(`/connections/${connectionId}/schema/tables/${table}/indexes/${oldName}/rename`, { newName }, {
      params: { schema }
    })
  },

  dropForeignKey: async (connectionId: string, table: string, constraint: string, schema?: string) => {
    await apiClient.delete(`/connections/${connectionId}/schema/tables/${table}/foreign-keys/${constraint}`, {
      params: { schema }
    })
  },

  dropConstraint: async (connectionId: string, table: string, constraint: string, schema?: string) => {
    await apiClient.delete(`/connections/${connectionId}/schema/tables/${table}/constraints/${constraint}`, {
      params: { schema }
    })
  },

  switchSchema: async (connectionId: string, schema: string) => {
    const response = await apiClient.post<Connection>(`/connections/${connectionId}/schema/switch-schema`, { schema })
    return response.data
  }
}
