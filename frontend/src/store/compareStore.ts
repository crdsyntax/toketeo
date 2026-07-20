import { create } from 'zustand';
import { compareService } from '@/services/compare.service';
import type { SchemaReport, DataReport, SyncScript, ScriptOptions } from '@/types/compare';

export type CompareRunStatus = 'idle' | 'running' | 'paused' | 'cancelled';

export interface CompareProgress {
  message: string;
  current: number;
  total: number;
}

interface CompareState {
  schemaReport: SchemaReport | null;
  dataReport: DataReport | null;
  syncScript: SyncScript | null;
  scriptOptions: ScriptOptions;
  loading: boolean;
  error: string | null;
  compareId: string | null;
  status: CompareRunStatus;
  progress: CompareProgress | null;

  compareSchemas: (params: {
    sourceConnId: string;
    targetConnId: string;
    sourceSchema?: string;
    targetSchema?: string;
    tables?: string[];
  }) => Promise<void>;

  compareData: (params: {
    sourceConnId: string;
    targetConnId: string;
    sourceSchema?: string;
    targetSchema?: string;
    tables: string[];
    chunkSize?: number;
  }) => Promise<void>;

  generateScript: (targetDbType: string) => Promise<void>;

  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  setProgress: (progress: CompareProgress | null) => void;

  toggleStatement: (id: string) => void;
  toggleAllStatements: (selected: boolean) => void;
  setScriptOptions: (options: Partial<ScriptOptions>) => void;
  clear: () => void;
}

const DEFAULT_OPTIONS: ScriptOptions = {
  include_creates: true,
  include_alters: true,
  include_drops: true,
  include_indexes: true,
  include_constraints: true,
  include_views: true,
  include_routines: true,
  wrap_in_transaction: true,
};

function newCompareId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useCompareStore = create<CompareState>()((set, get) => ({
  schemaReport: null,
  dataReport: null,
  syncScript: null,
  scriptOptions: DEFAULT_OPTIONS,
  loading: false,
  error: null,
  compareId: null,
  status: 'idle',
  progress: null,

  compareSchemas: async (params) => {
    const compareId = newCompareId();
    set({
      loading: true,
      error: null,
      compareId,
      status: 'running',
      progress: { message: 'Starting schema compare...', current: 0, total: 0 },
    });
    try {
      const report = await compareService.compareSchemas({ ...params, compareId });
      set({ schemaReport: report, dataReport: null, syncScript: null, loading: false, status: 'idle', compareId: null, progress: null });
    } catch (e) {
      const msg = String(e);
      const cancelled = msg.toLowerCase().includes('cancelled');
      set({
        error: cancelled ? null : msg,
        loading: false,
        status: cancelled ? 'cancelled' : 'idle',
        compareId: null,
        progress: null,
      });
    }
  },

  compareData: async (params) => {
    const compareId = newCompareId();
    set({
      loading: true,
      error: null,
      compareId,
      status: 'running',
      progress: { message: 'Starting data compare...', current: 0, total: 0 },
    });
    try {
      const report = await compareService.compareData({ ...params, compareId });
      set({ dataReport: report, syncScript: null, loading: false, status: 'idle', compareId: null, progress: null });
    } catch (e) {
      const msg = String(e);
      const cancelled = msg.toLowerCase().includes('cancelled');
      set({
        error: cancelled ? null : msg,
        loading: false,
        status: cancelled ? 'cancelled' : 'idle',
        compareId: null,
        progress: null,
      });
    }
  },

  generateScript: async (targetDbType) => {
    const { schemaReport, dataReport, scriptOptions } = get();
    if (!schemaReport) return;
    set({ loading: true, error: null, status: 'running' });
    try {
      const script = await compareService.generateScript({
        schemaReport,
        dataReport: dataReport ?? undefined,
        targetDbType,
        options: scriptOptions,
      });
      set({ syncScript: script, loading: false, status: 'idle' });
    } catch (e) {
      set({ error: String(e), loading: false, status: 'idle' });
    }
  },

  pause: async () => {
    const { compareId, status } = get();
    if (!compareId || status !== 'running') return;
    await compareService.pause(compareId);
    set({ status: 'paused' });
  },

  resume: async () => {
    const { compareId, status } = get();
    if (!compareId || status !== 'paused') return;
    await compareService.resume(compareId);
    set({ status: 'running' });
  },

  cancel: async () => {
    const { compareId } = get();
    if (!compareId) return;
    await compareService.cancel(compareId);
    set({ status: 'cancelled', loading: false });
  },

  setProgress: (progress) => set({ progress }),

  toggleStatement: (id) => {
    const { syncScript } = get();
    if (!syncScript) return;
    set({
      syncScript: {
        ...syncScript,
        statements: syncScript.statements.map((s) =>
          s.id === id ? { ...s, selected: !s.selected } : s
        ),
      },
    });
  },

  toggleAllStatements: (selected) => {
    const { syncScript } = get();
    if (!syncScript) return;
    set({
      syncScript: {
        ...syncScript,
        statements: syncScript.statements.map((s) => ({ ...s, selected })),
      },
    });
  },

  setScriptOptions: (options) => {
    set((state) => ({
      scriptOptions: { ...state.scriptOptions, ...options },
    }));
  },

  clear: () => {
    set({
      schemaReport: null,
      dataReport: null,
      syncScript: null,
      scriptOptions: DEFAULT_OPTIONS,
      loading: false,
      error: null,
      compareId: null,
      status: 'idle',
      progress: null,
    });
  },
}));
