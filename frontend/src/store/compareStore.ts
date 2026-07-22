import { create } from 'zustand';
import { compareService } from '@/services/compare.service';
import type { SchemaReport, DataReport, SyncScript, ScriptOptions, CompareSession } from '@/types/compare';

export type CompareRunStatus = 'idle' | 'running' | 'paused' | 'cancelled';

export interface CompareProgress {
  message: string;
  current: number;
  total: number;
}

interface CompareState {
  sessionId: string | null;
  sourceConnId: string;
  targetConnId: string;
  sourceDatabase: string;
  targetDatabase: string;
  sourceSchema: string;
  targetSchema: string;
  selectedTables: string[];
  activeTab: 'schema' | 'data' | 'script';

  schemaReport: SchemaReport | null;
  dataReport: DataReport | null;
  syncScript: SyncScript | null;
  scriptOptions: ScriptOptions;
  loading: boolean;
  error: string | null;
  compareId: string | null;
  status: CompareRunStatus;
  progress: CompareProgress | null;

  reconnecting: boolean;
  reconnectError: string | null;

  setSourceConnId: (id: string) => void;
  setTargetConnId: (id: string) => void;
  setSourceDatabase: (db: string) => void;
  setTargetDatabase: (db: string) => void;
  setSourceSchema: (schema: string) => void;
  setTargetSchema: (schema: string) => void;
  setSelectedTables: (tables: string[]) => void;
  setActiveTab: (tab: 'schema' | 'data' | 'script') => void;

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
  toggleStatementPreserve: (id: string) => void;

  saveSession: () => Promise<void>;
  loadLatestSession: () => Promise<void>;
  loadSessionById: (id: string) => Promise<void>;
  clear: () => Promise<void>;
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
  data_preservation: true,
  drop_target_extras: false,
};

function newCompareId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useCompareStore = create<CompareState>()((set, get) => ({
  sessionId: null,
  sourceConnId: '',
  targetConnId: '',
  sourceDatabase: '',
  targetDatabase: '',
  sourceSchema: '',
  targetSchema: '',
  selectedTables: [],
  activeTab: 'schema',

  schemaReport: null,
  dataReport: null,
  syncScript: null,
  scriptOptions: DEFAULT_OPTIONS,
  loading: false,
  error: null,
  compareId: null,
  status: 'idle',
  progress: null,

  reconnecting: false,
  reconnectError: null,

  setSourceConnId: (id) => set({ sourceConnId: id, sourceDatabase: '', sourceSchema: '' }),
  setTargetConnId: (id) => set({ targetConnId: id, targetDatabase: '', targetSchema: '' }),
  setSourceDatabase: (db) => set({ sourceDatabase: db }),
  setTargetDatabase: (db) => set({ targetDatabase: db }),
  setSourceSchema: (schema) => set({ sourceSchema: schema }),
  setTargetSchema: (schema) => set({ targetSchema: schema }),
  setSelectedTables: (tables) => set({ selectedTables: tables }),
  setActiveTab: (tab) => set({ activeTab: tab }),

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
      get().saveSession();
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
      get().saveSession();
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
      get().saveSession();
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

  toggleStatementPreserve: (id) => {
    const { syncScript } = get();
    if (!syncScript) return;
    set({
      syncScript: {
        ...syncScript,
        statements: syncScript.statements.map((s) =>
          s.id === id ? { ...s, preserve_data: !s.preserve_data } : s
        ),
      },
    });
  },

  saveSession: async () => {
    const state = get();
    if (!state.sourceConnId && !state.targetConnId) return;
    const now = new Date().toISOString();
    const session: CompareSession = {
      id: state.sessionId ?? `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      source_conn_id: state.sourceConnId,
      target_conn_id: state.targetConnId,
      source_database: state.sourceDatabase || undefined,
      target_database: state.targetDatabase || undefined,
      source_schema: state.sourceSchema || undefined,
      target_schema: state.targetSchema || undefined,
      selected_tables: state.selectedTables.length > 0 ? state.selectedTables : undefined,
      schema_report: state.schemaReport ?? undefined,
      data_report: state.dataReport ?? undefined,
      sync_script: state.syncScript ?? undefined,
      script_options: state.scriptOptions,
      active_tab: state.activeTab,
      created_at: state.sessionId ? now : now,
      updated_at: now,
    };
    try {
      const saved = await compareService.saveSession(session);
      set({ sessionId: saved.id });
    } catch {
      // Silently fail — persistence is best-effort
    }
  },

  loadLatestSession: async () => {
    try {
      set({ reconnecting: true, reconnectError: null });
      const sessions = await compareService.getSessions();
      if (sessions.length === 0) {
        set({ reconnecting: false });
        return;
      }
      const latest = sessions[0];
      set({
        sessionId: latest.id,
        sourceConnId: latest.source_conn_id,
        targetConnId: latest.target_conn_id,
        sourceDatabase: latest.source_database ?? '',
        targetDatabase: latest.target_database ?? '',
        sourceSchema: latest.source_schema ?? '',
        targetSchema: latest.target_schema ?? '',
        selectedTables: latest.selected_tables ?? [],
        activeTab: (latest.active_tab as 'schema' | 'data' | 'script') ?? 'schema',
        schemaReport: latest.schema_report ?? null,
        dataReport: latest.data_report ?? null,
        syncScript: latest.sync_script ?? null,
        scriptOptions: latest.script_options ?? DEFAULT_OPTIONS,
        reconnecting: false,
      });
    } catch {
      set({ reconnecting: false, reconnectError: 'Error loading previous session' });
    }
  },

  loadSessionById: async (id: string) => {
    try {
      set({ reconnecting: true, reconnectError: null });
      const session = await compareService.loadSession(id);
      set({
        sessionId: session.id,
        sourceConnId: session.source_conn_id,
        targetConnId: session.target_conn_id,
        sourceDatabase: session.source_database ?? '',
        targetDatabase: session.target_database ?? '',
        sourceSchema: session.source_schema ?? '',
        targetSchema: session.target_schema ?? '',
        selectedTables: session.selected_tables ?? [],
        activeTab: (session.active_tab as 'schema' | 'data' | 'script') ?? 'schema',
        schemaReport: session.schema_report ?? null,
        dataReport: session.data_report ?? null,
        syncScript: session.sync_script ?? null,
        scriptOptions: session.script_options ?? DEFAULT_OPTIONS,
        reconnecting: false,
      });
    } catch {
      set({ reconnecting: false, reconnectError: 'Error loading session' });
    }
  },

  clear: async () => {
    const { sessionId } = get();
    if (sessionId) {
      try {
        await compareService.deleteSession(sessionId);
      } catch {
        // ignore — session may already be deleted
      }
    }
    set({
      sessionId: null,
      sourceConnId: '',
      targetConnId: '',
      sourceDatabase: '',
      targetDatabase: '',
      sourceSchema: '',
      targetSchema: '',
      selectedTables: [],
      activeTab: 'schema',
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
