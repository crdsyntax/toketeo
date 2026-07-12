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
  /** Crear o actualizar un pipeline. */
  save: async (pipeline: CreateSyncPipelineDto): Promise<SyncPipeline> => {
    return await tauriApi.invoke<SyncPipeline>('save_sync_pipeline', { pipeline });
  },

  /** Listar todos los pipelines. */
  list: async (): Promise<SyncPipeline[]> => {
    return await tauriApi.invoke<SyncPipeline[]>('list_sync_pipelines');
  },

  /** Obtener un pipeline por ID. */
  get: async (id: string): Promise<SyncPipeline> => {
    return await tauriApi.invoke<SyncPipeline>('get_sync_pipeline', { id });
  },

  /** Eliminar un pipeline. */
  remove: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('delete_sync_pipeline', { id });
  },

  /** Validar configuración del pipeline (por ID guardado). */
  validate: async (params: { id: string }): Promise<ValidationReport> => {
    return await tauriApi.invoke<ValidationReport>('validate_sync_pipeline', { id: params.id });
  },

  /** Validar configuración sin guardar el pipeline. */
  validateConfig: async (params: {
    sourceConnectionId: string;
    targetConnectionId: string;
    tables: SyncTableConfig[];
    mode: SyncMode;
    batchSize?: number;
  }): Promise<ValidationReport> => {
    return await tauriApi.invoke<ValidationReport>('validate_sync_config', params);
  },

  /** Iniciar ejecución de un pipeline. */
  start: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('start_sync', { id });
  },

  /** Pausar ejecución en curso. */
  pause: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('pause_sync', { id });
  },

  /** Reanudar ejecución pausada. */
  resume: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('resume_sync', { id });
  },

  /** Cancelar ejecución en curso. */
  cancel: async (id: string): Promise<void> => {
    return await tauriApi.invoke<void>('cancel_sync', { id });
  },

  /** Listar ejecuciones de un pipeline. */
  listRuns: async (pipelineId: string): Promise<SyncRun[]> => {
    return await tauriApi.invoke<SyncRun[]>('list_sync_runs', { pipelineId });
  },

  /** Obtener una ejecución por ID. */
  getRun: async (id: string): Promise<SyncRun> => {
    return await tauriApi.invoke<SyncRun>('get_sync_run', { id });
  },

  /** Listar batches de una ejecución. */
  listBatches: async (runId: string): Promise<SyncBatch[]> => {
    return await tauriApi.invoke<SyncBatch[]>('list_sync_batches', { runId });
  },

  /** Listar errores de un batch. */
  listRowErrors: async (batchId: string): Promise<SyncRowError[]> => {
    return await tauriApi.invoke<SyncRowError[]>('list_sync_row_errors', { batchId });
  },

  /** Obtener checkpoint de un pipeline. */
  getCheckpoint: async (pipelineId: string): Promise<SyncCheckpoint | null> => {
    return await tauriApi.invoke<SyncCheckpoint | null>('get_checkpoint', { pipelineId });
  },
};
