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
  const isRedis = dbType === DatabaseType.REDIS;

  return {
    supportsSchemas: !isSQLite && !isMongoDB && !isRedis,
    supportsProcedures: !isSQLite && !isMongoDB && !isRedis,
    supportsTriggers: !isMongoDB && !isRedis,
    supportsFunctions: !isSQLite && !isMongoDB && !isRedis,
    supportsForeignKeys: !isMongoDB && !isRedis,
    supportsConstraints: !isMongoDB && !isRedis,
    supportsDdlExecution: !isMongoDB && !isRedis,
    supportsIndexes: !isRedis,
    schemaLabel: isRedis ? 'Namespace' : isMongoDB ? 'Database' : 'Schema',
    tableLabel: isRedis ? 'Key Pattern' : isMongoDB ? 'Collection' : 'Table',
    columnLabel: isRedis ? 'Field' : isMongoDB ? 'Field' : 'Column',
  };
};
