import { tauriApi } from '@/lib/api';
import type {
  SyncPipeline,
  SyncRun,
  SyncBatch,
  SyncRowError,
  SyncCheckpoint,
  SyncTableConfig,
  SyncMode,
  ValidationReport,
  CreateSyncPipelineDto,
} from '@/types/sync';

export const syncService = {

  save: async (pipeline: CreateSyncPipelineDto): Promise<SyncPipeline> => {
    return await tauriApi.invoke<SyncPipeline>('save_sync_pipeline', { pipeline });
  },


  list: async (): Promise<SyncPipeline[]> => {
    return await tauriApi.invoke<SyncPipeline[]>('list_sync_pipelines');
  },


  get: async (id: string): Promise<SyncPipeline> => {
    return await tauriApi.invoke<SyncPipeline>('get_sync_pipeline', { id });
  },


  remove: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('delete_sync_pipeline', { id });
  },


  validate: async (params: { id: string }): Promise<ValidationReport> => {
    return await tauriApi.invoke<ValidationReport>('validate_sync_pipeline', { id: params.id });
  },


  validateConfig: async (params: {
    sourceConnectionId: string;
    targetConnectionId: string;
    tables: SyncTableConfig[];
    mode: SyncMode;
    batchSize?: number;
  }): Promise<ValidationReport> => {
    return await tauriApi.invoke<ValidationReport>('validate_sync_config', params);
  },


  start: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('start_sync', { id });
  },


  pause: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('pause_sync', { id });
  },


  resume: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('resume_sync', { id });
  },


  cancel: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('cancel_sync', { id });
  },


  listRuns: async (pipelineId: string): Promise<SyncRun[]> => {
    return await tauriApi.invoke<SyncRun[]>('list_sync_runs', { pipelineId });
  },


  getRun: async (id: string): Promise<SyncRun> => {
    return await tauriApi.invoke<SyncRun>('get_sync_run', { id });
  },


  listBatches: async (runId: string): Promise<SyncBatch[]> => {
    return await tauriApi.invoke<SyncBatch[]>('list_sync_batches', { runId });
  },


  listRowErrors: async (batchId: string): Promise<SyncRowError[]> => {
    return await tauriApi.invoke<SyncRowError[]>('list_sync_row_errors', { batchId });
  },


  getCheckpoint: async (pipelineId: string): Promise<SyncCheckpoint | null> => {
    return await tauriApi.invoke<SyncCheckpoint | null>('get_checkpoint', { pipelineId });
  },
};
