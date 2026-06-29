import { tauriApi } from '@/lib/api'
import type { 
  TableResponse, 
  ColumnResponse, 
  IndexResponse, 
  ForeignKeyResponse, 
  ConstraintResponse,
  ParameterResponse,
  QueryResult,
  DumpSelection,
  DumpObjects,
  SchemaDiagramData,
  IntegrityResult,
} from '@/types/database'

export const schemaService = {
  getDatabases: async (id: string) => {
    return await tauriApi.invoke<string[]>('get_databases', { id })
  },
  switchDatabase: async (id: string, newDb: string) => {
    return await tauriApi.invoke<void>('switch_database', { id, newDb })
  },
  getSchemas: async (id: string) => {
    return await tauriApi.invoke<string[]>('get_schemas', { id })
  },
  getMongoStructure: async (id: string) => {
    return await tauriApi.invoke<Record<string, unknown>>('get_mongo_structure', { id })
  },

  getTables: async (id: string, schema?: string, filter?: string) => {
    const names = await tauriApi.invoke<string[]>('get_tables', { id, schema, filter })
    return names.map(name => ({
      name,
      type: 'table'
    })) as TableResponse[]
  },

  getViews: async (id: string, schema?: string, filter?: string) => {
    const names = await tauriApi.invoke<string[]>('get_views', { id, schema, filter })
    return names.map(name => ({
      name,
      type: 'view'
    })) as TableResponse[]
  },

  getProcedures: async (id: string, schema?: string, filter?: string) => {
    const names = await tauriApi.invoke<string[]>('get_procedures', { id, schema, filter })
    return names.map(name => ({
      name,
      type: 'procedure'
    })) as TableResponse[]
  },

  getTriggers: async (id: string, schema?: string, filter?: string) => {
    const names = await tauriApi.invoke<string[]>('get_triggers', { id, schema, filter })
    return names.map(name => ({
      name,
      type: 'trigger'
    })) as TableResponse[]
  },

  getFunctions: async (id: string, schema?: string, filter?: string) => {
    const names = await tauriApi.invoke<string[]>('get_functions', { id, schema, filter })
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

  getDDL: async (id: string, name: string, objectType: string, schema?: string) => {
    return await tauriApi.invoke<string>('get_ddl', { id, name, objectType, schema })
  },

  updateDDL: async (id: string, name: string, objectType: string, sql: string, schema?: string) => {
    await tauriApi.invoke<void>('update_ddl', { id, name, objectType, sql, schema })
  },

  getParameters: async (id: string, name: string, objectType: string, schema?: string) => {
    return await tauriApi.invoke<ParameterResponse[]>('get_parameters', { id, name, objectType, schema })
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

  renameForeignKey: async (id: string, table: string, oldName: string, newName: string, schema?: string) => {
    await tauriApi.invoke<void>('rename_foreign_key', { id, table, oldName, newName, schema })
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
  pageSize: number;
  params?: Record<string, string>;
  filter?: string;
  }) => {
  return await tauriApi.invoke<QueryResult>('execute_explorer', {
    id: payload.connectionId,
    database: payload.database,
    name: payload.name,
    objectType: payload.objectType,
    page: payload.page,
    pageSize: payload.pageSize,
    params: payload.params,
    filter: payload.filter
  })
  },
  switchSchema: async (id: string, schema: string) => {
    // Rust side might need to handle switching the default database in the pool
    return await tauriApi.invoke<void>('switch_schema', { id, schema })
  },

  commitTransaction: async (id: string) => {
    return await tauriApi.invoke<void>('commit_transaction', { id })
  },

  rollbackTransaction: async (id: string) => {
    return await tauriApi.invoke<void>('rollback_transaction', { id })
  },

  getDbType: async (id: string): Promise<string> => {
    return await tauriApi.invoke<string>('get_db_type', { id })
  },

  getSchemaDiagramData: async (id: string, schema: string, tableNames: string[]): Promise<SchemaDiagramData> => {
    return await tauriApi.invoke<SchemaDiagramData>('get_schema_diagram_data', { id, schema, tableNames })
  },

  getDumpObjects: async (id: string, schema: string): Promise<DumpObjects> => {
    const [tables, views, triggers, procedures, functions] = await Promise.all([
      tauriApi.invoke<string[]>('get_tables', { id, schema }),
      tauriApi.invoke<string[]>('get_views', { id, schema }),
      tauriApi.invoke<string[]>('get_triggers', { id, schema }),
      tauriApi.invoke<string[]>('get_procedures', { id, schema }),
      tauriApi.invoke<string[]>('get_functions', { id, schema }),
    ])
    return { tables, views, triggers, procedures, functions }
  },

  getTableSizes: async (id: string, schema: string): Promise<Record<string, number>> => {
    const rows = await tauriApi.invoke<[string, number][]>('get_table_sizes', { id, schema })
    return Object.fromEntries(rows)
  },

  openInFileManager: async (path: string): Promise<void> => {
    return await tauriApi.invoke<void>('open_in_file_manager', { path })
  },

  dumpSchema: async (id: string, schema: string, selection: DumpSelection): Promise<{ filePath: string; integrity: IntegrityResult } | null> => {
    return await tauriApi.invoke<{ filePath: string; integrity: IntegrityResult } | null>('dump_schema_dialog', {
      id,
      schema,
      selection,
      defaultFileName: `${schema}.sql`,
    })
  },

  pickAndParseDumpFile: async (): Promise<{ filePath: string; tables: string[] } | null> => {
    return await tauriApi.invoke<{ filePath: string; tables: string[] } | null>('pick_and_parse_dump_file')
  },

  restoreSchemaSelected: async (id: string, schema: string, filePath: string, tables: string[]): Promise<void> => {
    return await tauriApi.invoke<void>('restore_database_selected', {
      id,
      schema,
      filePath,
      tables,
    })
  },

  createDatabase: async (id: string, dbName: string): Promise<void> => {
    await tauriApi.invoke<void>('create_database', { id, dbName })
  },

  createCollection: async (id: string, dbName: string, collectionName: string): Promise<void> => {
    await tauriApi.invoke<void>('create_collection', { id, dbName, collectionName })
  },

  mongoBackupDatabase: async (id: string, dbName: string): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('mongo_backup_database', { id, dbName })
  },

  mongoRestoreDatabase: async (id: string, dbName: string): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('mongo_restore_database', { id, dbName })
  },
}
