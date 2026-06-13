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

  getViews: async (id: string, _schema?: string) => {
    return [] as TableResponse[] // TODO: Implement get_views in Rust
  },

  getProcedures: async (id: string, _schema?: string) => {
    return [] as TableResponse[] // TODO: Implement get_procedures in Rust
  },

  getTriggers: async (id: string, _schema?: string) => {
    return [] as TableResponse[] // TODO: Implement get_triggers in Rust
  },

  getColumns: async (id: string, table: string, _schema?: string) => {
    // This might need a new command in Rust
    return await tauriApi.invoke<ColumnResponse[]>('get_columns', { id, table })
  },

  getIndexes: async (id: string, table: string, _schema?: string) => {
    return await tauriApi.invoke<IndexResponse[]>('get_indexes', { id, table })
  },

  getForeignKeys: async (id: string, table: string, _schema?: string) => {
    return await tauriApi.invoke<ForeignKeyResponse[]>('get_foreign_keys', { id, table })
  },

  getConstraints: async (id: string, table: string, _schema?: string) => {
    return await tauriApi.invoke<ConstraintResponse[]>('get_constraints', { id, table })
  },

  getDDL: async (id: string, name: string, type: string, _schema?: string) => {
    return await tauriApi.invoke<string>('get_ddl', { id, name, type })
  },

  updateDDL: async (id: string, name: string, type: string, sql: string, _schema?: string) => {
    await tauriApi.invoke<void>('update_ddl', { id, name, type, sql })
  },

  getParameters: async (id: string, name: string, type: string, _schema?: string) => {
    return await tauriApi.invoke<ParameterResponse[]>('get_parameters', { id, name, type })
  },

  editColumn: async (id: string, table: string, sql: string, _schema?: string) => {
    await tauriApi.invoke<void>('edit_column', { id, table, sql })
  },

  dropColumn: async (id: string, table: string, column: string, _schema?: string) => {
    await tauriApi.invoke<void>('drop_column', { id, table, column })
  },

  dropIndex: async (id: string, table: string, index: string, _schema?: string) => {
    await tauriApi.invoke<void>('drop_index', { id, table, index })
  },

  renameIndex: async (id: string, table: string, oldName: string, newName: string, _schema?: string) => {
    await tauriApi.invoke<void>('rename_index', { id, table, oldName, newName })
  },

  dropForeignKey: async (id: string, table: string, constraint: string, _schema?: string) => {
    await tauriApi.invoke<void>('drop_foreign_key', { id, table, constraint })
  },

  dropConstraint: async (id: string, table: string, constraint: string, _schema?: string) => {
    await tauriApi.invoke<void>('drop_constraint', { id, table, constraint })
  },

  switchSchema: async (id: string, schema: string) => {
    // Rust side might need to handle switching the default database in the pool
    return await tauriApi.invoke<any>('switch_schema', { id, schema })
  }
}
