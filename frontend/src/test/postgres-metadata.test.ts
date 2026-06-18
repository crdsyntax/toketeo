import { describe, it, expect, vi } from 'vitest';
import { schemaService } from '@/services/schema.service';
import { tauriApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  tauriApi: {
    invoke: vi.fn(),
  },
}));

describe('Postgres Metadata Listing', () => {
  const connectionId = 'test-pg-conn';

  it('should list databases', async () => {
    const mockDbs = ['postgres', 'toketeo_db'];
    vi.mocked(tauriApi.invoke).mockResolvedValueOnce(mockDbs);

    const dbs = await schemaService.getDatabases(connectionId);
    expect(tauriApi.invoke).toHaveBeenCalledWith('get_databases', { id: connectionId });
    expect(dbs).toEqual(mockDbs);
  });

  it('should list schemas', async () => {
    const mockSchemas = ['public', 'auth', 'billing'];
    vi.mocked(tauriApi.invoke).mockResolvedValueOnce(mockSchemas);

    const schemas = await schemaService.getSchemas(connectionId);
    expect(tauriApi.invoke).toHaveBeenCalledWith('get_schemas', { id: connectionId });
    expect(schemas).toEqual(mockSchemas);
  });

  it('should list tables for a specific schema', async () => {
    const schema = 'auth';
    const mockTables = [{ name: 'users', type: 'table' }, { name: 'sessions', type: 'table' }];
    vi.mocked(tauriApi.invoke).mockResolvedValueOnce(['users', 'sessions']);

    const tables = await schemaService.getTables(connectionId, schema);
    expect(tauriApi.invoke).toHaveBeenCalledWith('get_tables', { id: connectionId, schema });
    expect(tables).toEqual(mockTables);
  });
});
