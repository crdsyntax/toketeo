import { create } from 'zustand';
import { syncService } from '@/services/sync.service';
import type {
  SyncPipeline,
  SyncRun,
  SyncBatch,
  SyncRowError,
  SyncCheckpoint,
  ValidationReport,
  SyncEvent,
  CreateSyncPipelineDto,
} from '@/types/sync';

interface SyncState {
  pipelines: SyncPipeline[];
  activePipeline: SyncPipeline | null;
  runs: SyncRun[];
  activeRun: SyncRun | null;
  batches: SyncBatch[];
  rowErrors: SyncRowError[];
  checkpoint: SyncCheckpoint | null;
  validation: ValidationReport | null;
  events: SyncEvent[];
  loading: boolean;
  error: string | null;

  fetchPipelines: () => Promise<void>;
  getPipeline: (id: string) => Promise<void>;
  savePipeline: (dto: CreateSyncPipelineDto) => Promise<SyncPipeline>;
  deletePipeline: (id: string) => Promise<void>;
  validatePipeline: (dto: CreateSyncPipelineDto) => Promise<ValidationReport>;
  startSync: (id: string) => Promise<void>;
  fetchRuns: (pipelineId: string) => Promise<void>;
  getRun: (id: string) => Promise<void>;
  fetchBatches: (runId: string) => Promise<void>;
  fetchRowErrors: (batchId: string) => Promise<void>;
  fetchCheckpoint: (pipelineId: string) => Promise<void>;
  addEvent: (event: SyncEvent) => void;
  clearEvents: () => void;
  clearError: () => void;
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  pipelines: [],
  activePipeline: null,
  runs: [],
  activeRun: null,
  batches: [],
  rowErrors: [],
  checkpoint: null,
  validation: null,
  events: [],
  loading: false,
  error: null,

  fetchPipelines: async () => {
    set({ loading: true, error: null });
    try {
      const pipelines = await syncService.list();
      set({ pipelines, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  getPipeline: async (id) => {
    set({ loading: true, error: null });
    try {
      const pipeline = await syncService.get(id);
      set({ activePipeline: pipeline, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  savePipeline: async (dto) => {
    set({ loading: true, error: null });
    try {
      const pipeline = await syncService.save(dto);
      const { pipelines } = get();
      const idx = pipelines.findIndex((p) => p.id === pipeline.id);
      if (idx >= 0) {
        const updated = [...pipelines];
        updated[idx] = pipeline;
        set({ pipelines: updated, activePipeline: pipeline, loading: false });
      } else {
        set({ pipelines: [...pipelines, pipeline], activePipeline: pipeline, loading: false });
      }
      return pipeline;
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  deletePipeline: async (id) => {
    set({ loading: true, error: null });
    try {
      await syncService.remove(id);
      set((s) => ({
        pipelines: s.pipelines.filter((p) => p.id !== id),
        activePipeline: s.activePipeline?.id === id ? null : s.activePipeline,
        loading: false,
      }));
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  validatePipeline: async (dto) => {
    set({ loading: true, error: null });
    try {
      const report = await syncService.validateConfig({
        sourceConnectionId: dto.source_connection_id,
        targetConnectionId: dto.target_connection_id,
        tables: dto.tables,
        mode: dto.mode,
        batchSize: dto.batch_size,
      });
      set({ validation: report, loading: false });
      return report;
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  startSync: async (id) => {
    set({ loading: true, error: null });
    try {
      await syncService.start(id);
      set({ loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchRuns: async (pipelineId) => {
    set({ loading: true, error: null });
    try {
      const runs = await syncService.listRuns(pipelineId);
      set({ runs, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  getRun: async (id) => {
    set({ loading: true, error: null });
    try {
      const run = await syncService.getRun(id);
      set({ activeRun: run, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchBatches: async (runId) => {
    set({ loading: true, error: null });
    try {
      const batches = await syncService.listBatches(runId);
      set({ batches, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchRowErrors: async (batchId) => {
    set({ loading: true, error: null });
    try {
      const errors = await syncService.listRowErrors(batchId);
      set({ rowErrors: errors, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchCheckpoint: async (pipelineId) => {
    set({ loading: true, error: null });
    try {
      const cp = await syncService.getCheckpoint(pipelineId);
      set({ checkpoint: cp, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addEvent: (event) => {
    set((s) => ({ events: [...s.events, event].slice(-500) }));
  },

  clearEvents: () => set({ events: [] }),
  clearError: () => set({ error: null }),
}));
