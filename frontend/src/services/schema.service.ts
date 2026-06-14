import { tauriApi } from '@/lib/api'
import type { 
  TableResponse, 
  ColumnResponse, 
  IndexResponse, 
  ForeignKeyResponse, 
  ConstraintResponse,
  ParameterResponse,
} from '@/types/database'

export const schemaService = {
  getSchemas: async (id: string) => {
    return await tauriApi.invoke<string[]>('get_schemas', { id })
  },

  getTables: async (id: string, schema?: string) => {
    const names = await tauriApi.invoke<string[]>('get_tables', { id, schema })
    return names.map(name => ({
      name,
      type: 'table'
    })) as TableResponse[]
  },

  getViews: async (id: string, schema?: string) => {
    const names = await tauriApi.invoke<string[]>('get_views', { id, schema })
    return names.map(name => ({
      name,
      type: 'view'
    })) as TableResponse[]
  },

  getProcedures: async (id: string, schema?: string) => {
    const names = await tauriApi.invoke<string[]>('get_procedures', { id, schema })
    return names.map(name => ({
      name,
      type: 'procedure'
    })) as TableResponse[]
  },

  getTriggers: async (id: string, schema?: string) => {
    const names = await tauriApi.invoke<string[]>('get_triggers', { id, schema })
    return names.map(name => ({
      name,
      type: 'trigger'
    })) as TableResponse[]
  },

  getFunctions: async (id: string, schema?: string) => {
    const names = await tauriApi.invoke<string[]>('get_functions', { id, schema })
    return names.map(name => ({
      name,
      type: 'function'
    })) as TableResponse[]
  },

  getColumns: async (id: string, table: string, schema?: string) => {
    return await tauriApi.invoke<ColumnResponse[]>('get_columns', { id, table, schema })
  },

  getIndexes: async (id: string, table: string, schema?: string) => {
    return await tauriApi.invoke<IndexResponse[]>('get_indexes', { id, table, schema })
  },

  getForeignKeys: async (id: string, table: string, schema?: string) => {
    return await tauriApi.invoke<ForeignKeyResponse[]>('get_foreign_keys', { id, table, schema })
  },

  getConstraints: async (id: string, table: string, schema?: string) => {
    return await tauriApi.invoke<ConstraintResponse[]>('get_constraints', { id, table, schema })
  },

  getDDL: async (id: string, name: string, type: string, schema?: string) => {
    return await tauriApi.invoke<string>('get_ddl', { id, name, type, schema })
  },

  updateDDL: async (id: string, name: string, type: string, sql: string, schema?: string) => {
    await tauriApi.invoke<void>('update_ddl', { id, name, type, sql, schema })
  },

  getParameters: async (id: string, name: string, type: string, schema?: string) => {
    return await tauriApi.invoke<ParameterResponse[]>('get_parameters', { id, name, type, schema })
  },

  editColumn: async (id: string, table: string, sql: string, schema?: string) => {
    await tauriApi.invoke<void>('edit_column', { id, table, sql, schema })
  },

  dropColumn: async (id: string, table: string, column: string, schema?: string) => {
    await tauriApi.invoke<void>('drop_column', { id, table, column, schema })
  },

  dropIndex: async (id: string, table: string, index: string, schema?: string) => {
    await tauriApi.invoke<void>('drop_index', { id, table, index, schema })
  },

  renameIndex: async (id: string, table: string, oldName: string, newName: string, schema?: string) => {
    await tauriApi.invoke<void>('rename_index', { id, table, oldName, newName, schema })
  },

  dropForeignKey: async (id: string, table: string, constraint: string, schema?: string) => {
    await tauriApi.invoke<void>('drop_foreign_key', { id, table, constraint, schema })
  },

  dropConstraint: async (id: string, table: string, constraint: string, schema?: string) => {
    await tauriApi.invoke<void>('drop_constraint', { id, table, constraint, schema })
  },

  executeExplorer: async (payload: {
    connectionId: string,
    database?: string,
    name: string,
    objectType: string,
    page: number,
    pageSize: number,
    params?: Record<string, string>
  }) => {
    const result = await tauriApi.invoke<QueryResult>('execute_explorer', {
      id: payload.connectionId,
      database: payload.database,
      name: payload.name,
      objectType: payload.objectType,
      page: payload.page,
      pageSize: payload.pageSize,
      params: payload.params
    })
    
    return {
      ...result,
      executionTime: result.executionTimeMs ?? result.executionTime ?? 0
    }
  },

  switchSchema: async (id: string, schema: string) => {
    // Rust side might need to handle switching the default database in the pool
    return await tauriApi.invoke<void>('switch_schema', { id, schema })
  }
}
