import { DatabaseType } from '@/types/database';

export interface EngineCapabilities {
  supportsSchemas: boolean;
  supportsProcedures: boolean;
  supportsTriggers: boolean;
  supportsFunctions: boolean;
  supportsForeignKeys: boolean;
  supportsConstraints: boolean;
  supportsDdlExecution: boolean;
  supportsIndexes: boolean;
  schemaLabel: string;
  tableLabel: string;
  columnLabel: string;
}

export const getEngineCapabilities = (dbType: DatabaseType | undefined): EngineCapabilities => {
  const isMongoDB = dbType === DatabaseType.MONGODB;
  const isSQLite = dbType === DatabaseType.SQLITE;

  return {
    supportsSchemas: !isSQLite && !isMongoDB,
    supportsProcedures: !isSQLite && !isMongoDB,
    supportsTriggers: !isMongoDB,
    supportsFunctions: !isSQLite && !isMongoDB,
    supportsForeignKeys: !isMongoDB,
    supportsConstraints: !isMongoDB,
    supportsDdlExecution: !isMongoDB,
    supportsIndexes: true, // MongoDB also supports indexes
    schemaLabel: isMongoDB ? 'Database' : 'Schema',
    tableLabel: isMongoDB ? 'Collection' : 'Table',
    columnLabel: isMongoDB ? 'Field' : 'Column',
  };
};
