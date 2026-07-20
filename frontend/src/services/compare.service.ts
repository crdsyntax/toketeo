import { tauriApi } from '@/lib/api';
import type { SchemaReport, DataReport, SyncScript, ScriptOptions } from '@/types/compare';

export const compareService = {
  compareSchemas: async (params: {
    sourceConnId: string;
    targetConnId: string;
    sourceSchema?: string;
    targetSchema?: string;
    tables?: string[];
    views?: string[];
    procedures?: string[];
    functions?: string[];
    triggers?: string[];
    compareId?: string;
  }): Promise<SchemaReport> => {
    return await tauriApi.invoke<SchemaReport>('compare_schemas', {
      sourceConnId: params.sourceConnId,
      targetConnId: params.targetConnId,
      sourceSchema: params.sourceSchema ?? null,
      targetSchema: params.targetSchema ?? null,
      tables: params.tables ?? null,
      views: params.views ?? null,
      procedures: params.procedures ?? null,
      functions: params.functions ?? null,
      triggers: params.triggers ?? null,
      compareId: params.compareId ?? null,
    });
  },

  compareData: async (params: {
    sourceConnId: string;
    targetConnId: string;
    sourceSchema?: string;
    targetSchema?: string;
    tables: string[];
    chunkSize?: number;
    compareId?: string;
  }): Promise<DataReport> => {
    return await tauriApi.invoke<DataReport>('compare_data', {
      sourceConnId: params.sourceConnId,
      targetConnId: params.targetConnId,
      sourceSchema: params.sourceSchema ?? null,
      targetSchema: params.targetSchema ?? null,
      tables: params.tables,
      chunkSize: params.chunkSize ?? null,
      compareId: params.compareId ?? null,
    });
  },

  generateScript: async (params: {
    schemaReport: SchemaReport;
    dataReport?: DataReport;
    targetDbType: string;
    options: ScriptOptions;
  }): Promise<SyncScript> => {
    return await tauriApi.invoke<SyncScript>('generate_sync_script', {
      schemaReport: params.schemaReport,
      dataReport: params.dataReport ?? null,
      targetDbType: params.targetDbType,
      options: params.options,
    });
  },

  pause: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('pause_compare', { id });
  },

  resume: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('resume_compare', { id });
  },

  cancel: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('cancel_compare', { id });
  },
};
