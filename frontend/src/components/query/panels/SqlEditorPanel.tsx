import type { EditorView } from '@codemirror/view';
import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { ChevronUp, Terminal, Code2, Sparkles, GitFork } from 'lucide-react';
import type { QueryTab, EditorMode, EditorViewState } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { isMongoShellSyntax } from '@/lib/mongoShellParser';
import { DatabaseType } from '@/types/database';
import { cn } from '@/lib/utils';
import { MONGO_SHELL_LANGUAGE_ID } from '@/lib/editor/mongoShellLanguage';
import { SqlCodeEditor } from '@/components/editor/SqlCodeEditor';
import { sqlFlowService } from '@/services/sqlFlow.service';
import type { SqlFlowGraph } from '@/types/sqlFlow';
import { SchemaFlowModal } from '@/components/query/flow/SchemaFlowModal';
import toast from 'react-hot-toast';

interface SqlEditorPanelProps {
  activeTab: QueryTab;
  onToggle: () => void;
  updateTabQuery: (id: string, query: string) => void;
  editorRef: React.MutableRefObject<EditorView | null>;
  executeCurrent: () => void;
  executeAll: () => void;
  connectionId?: string;
  connectionName?: string;
  connectionType?: string;
  updateTabViewState: (id: string, viewState: EditorViewState | null) => void;
  updateTabEditorMode: (id: string, mode: EditorMode) => void;
}

export function SqlEditorPanel({
  activeTab,
  onToggle,
  updateTabQuery,
  editorRef,
  executeCurrent,
  executeAll,
  connectionId,
  connectionName,
  connectionType,
  updateTabViewState,
  updateTabEditorMode,
}: SqlEditorPanelProps) {
  const isMongo = connectionType === DatabaseType.MONGODB;
  const localViewRef = useRef<EditorView | null>(null);
  const prevTabIdRef = useRef<string>(activeTab.id);
  const viewStatesRef = useRef<Record<string, EditorViewState>>({});
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const [flowGraph, setFlowGraph] = useState<SqlFlowGraph | null>(null);
  const [isFlowLoading, setIsFlowLoading] = useState(false);

  const handleLoadSchemaFlow = useCallback(async () => {
    const query = activeTab.query.trim();
    if (!query) {
      toast.error('Escribe una consulta SQL antes de cargar el schema flow');
      return;
    }

    if (!connectionId) {
      toast.error('Selecciona una conexión antes de cargar el schema flow');
      return;
    }

    setIsFlowLoading(true);
    try {
      const graph = await sqlFlowService.getFlowData({
        query,
        connectionId,
        dialect: connectionType,
      });

      if (!graph.nodes || graph.nodes.length === 0) {
        toast.error('No se detectaron tablas o entidades en la consulta');
        setIsFlowLoading(false);
        return;
      }

      setFlowGraph(graph);
      setIsFlowModalOpen(true);
    } catch (err: unknown) {
      let message =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? String(err.message)
            : 'Error al analizar la consulta SQL y sus entidades';
      if (connectionName && message.includes('not found') && connectionId && message.includes(connectionId)) {
        message = message.replace(connectionId, connectionName);
      }
      toast.error(message);
    } finally {
      setIsFlowLoading(false);
    }
  }, [activeTab.query, connectionId, connectionName, connectionType]);


  const activeTabIdRef = useRef<string>(activeTab.id);
  useEffect(() => {
    activeTabIdRef.current = activeTab.id;
  }, [activeTab.id]);

  const storeEditorFontFamily = useAppStore((s) => s.editorFontFamily);
  const storeEditorFontSize = useAppStore((s) => s.uiFontSize);
  const storeEditorLineHeight = useAppStore((s) => s.editorLineHeight);
  const storeEditorTabSize = useAppStore((s) => s.editorTabSize);

  const mode = activeTab.editorMode ?? 'auto';


  const isShellMode = isMongo && (
    mode === 'mongosh' ? true
    : mode === 'json' ? false
    : isMongoShellSyntax(activeTab.query)
  );


  const captureState = useCallback((view: EditorView) => {
    const sel = view.state.selection.main;
    viewStatesRef.current[activeTabIdRef.current] = {
      scrollTop: view.scrollDOM.scrollTop,
      selection: { anchor: sel.anchor, head: sel.head },
    };
  }, []);

  const restoreState = useCallback((view: EditorView, vs: EditorViewState) => {
    if (vs.selection && typeof vs.selection.anchor === 'number' && typeof vs.selection.head === 'number') {
      view.dispatch({
        selection: { anchor: vs.selection.anchor, head: vs.selection.head },
        scrollIntoView: false,
      });
    }
    if (typeof vs.scrollTop === 'number') {
      const scrollTop = vs.scrollTop;
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = scrollTop;
      });
    }
  }, []);

  const handleMount = useCallback((view: EditorView) => {
    localViewRef.current = view;
    editorRef.current = view;

    requestAnimationFrame(() => {
      view.focus();
    });

    const handleEditorPaste = async (event: ClipboardEvent) => {
      const clipboardText = event.clipboardData?.getData('text/plain');
      if (clipboardText) {
        return;
      }

      if (!window.isSecureContext || !navigator.clipboard?.readText) {
        return;
      }

      event.preventDefault();
      const text = await navigator.clipboard.readText().catch(() => '');
      if (!text) return;

      const mainSel = view.state.selection.main;
      view.dispatch({
        changes: {
          from: mainSel.from,
          to: mainSel.to,
          insert: text,
        },
        selection: {
          anchor: mainSel.from + text.length,
          head: mainSel.from + text.length,
        },
      });
    };

    const handleEditorKeyUp = () => {
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      setCursorPos({ line: line.number, col: pos - line.from + 1 });
      captureState(view);
    };

    view.dom.addEventListener('paste', handleEditorPaste);
    view.dom.addEventListener('keyup', handleEditorKeyUp);
    view.dom.addEventListener('click', () => captureState(view));
    view.scrollDOM.addEventListener('scroll', () => captureState(view));
  }, [editorRef, captureState]);


  useEffect(() => {
    const view = localViewRef.current;
    if (!view) return;
    const vs = activeTab.editorViewState;
    if (vs) restoreState(view, vs);
  }, [activeTab.id, activeTab.editorViewState, restoreState]);


  const execExtensions: Extension[] = useMemo(() => {
    return [
      Prec.highest(keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            executeCurrent();
            return true;
          },
        },
        {
          key: 'F5',
          run: () => {
            executeAll();
            return true;
          },
        },
      ])),
    ];
  }, [executeCurrent, executeAll]);

  const handleChange = useCallback((val: string) => {
    updateTabQuery(activeTab.id, val);
  }, [activeTab.id, updateTabQuery]);


  useEffect(() => {
    if (prevTabIdRef.current !== activeTab.id) {
      const saved = viewStatesRef.current[prevTabIdRef.current];
      if (saved) updateTabViewState(prevTabIdRef.current, saved);
      prevTabIdRef.current = activeTab.id;
    }
  }, [activeTab.id, updateTabViewState]);


  useEffect(() => {
    const viewStates = viewStatesRef.current;
    const tabId = prevTabIdRef.current;
    return () => {
      const saved = viewStates[tabId];
      if (saved) updateTabViewState(tabId, saved);
    };
  }, [updateTabViewState]);

  const editorLanguage = isShellMode
    ? MONGO_SHELL_LANGUAGE_ID
    : isMongo
      ? 'json'
      : 'sql';

  const modeChips = [
    { id: 'mongosh' as EditorMode, label: 'Shell', icon: Terminal },
    { id: 'auto' as EditorMode, label: 'Auto', icon: Code2 },
    { id: 'json' as EditorMode, label: 'JSON', icon: Sparkles },
  ];

  return (
    <div className="border border-border rounded-none bg-card overflow-hidden flex flex-col flex-1 min-h-0 w-full">

      <div className="h-10 px-3 border-b border-border bg-background/80 backdrop-blur flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onToggle} className="p-1 hover:bg-muted rounded shrink-0">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <span className="text-xs font-semibold text-foreground truncate">{activeTab.name || 'Untitled'}</span>

          {isMongo && (
            <span className="px-1.5 py-0.5 rounded text-[var(--ch-text-9)] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              MongoDB
            </span>
          )}

          {isMongo && (
            <div className="flex items-center gap-0.5 ml-1 border border-border rounded-md overflow-hidden">
              {modeChips.map((chip) => {
                const isActive = mode === chip.id || (chip.id === 'auto' && mode === 'auto');
                const activeClass = chip.id === 'mongosh' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : chip.id === 'json' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
                return (
                  <button
                    key={chip.id}
                    onClick={() => updateTabEditorMode(activeTab.id, chip.id)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 text-[var(--ch-text-9)] font-bold uppercase tracking-wider transition-colors border-r last:border-r-0 border-border',
                      isActive ? activeClass : 'text-muted-foreground hover:text-foreground bg-transparent'
                    )}
                  >
                    <chip.icon className="w-2.5 h-2.5" />
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}

          <span className="text-[var(--ch-text-10)] text-muted-foreground/50 ml-1 hidden sm:inline">
            {isShellMode
              ? 'db.collection.find({…})'
              : 'Ctrl/Cmd + Enter'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isMongo && (
            <button
              onClick={handleLoadSchemaFlow}
              disabled={isFlowLoading}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/30 transition-all shadow-xs disabled:opacity-50"
              title="Cargar diagrama de flujo de entidades/joins (Schema Flow)"
            >
              <GitFork className={cn('w-3.5 h-3.5', isFlowLoading && 'animate-spin')} />
              <span>Load schema flow</span>
            </button>
          )}
          {!isMongo && (
            <span className="text-[var(--ch-text-10)] text-muted-foreground/50 hidden md:inline">
              Ctrl/Cmd + Enter
            </span>
          )}
          <span className="text-[var(--ch-text-10)] text-muted-foreground/70 font-mono">
            {connectionName}
          </span>
        </div>
      </div>


      <div className="flex-1 min-h-0 relative">
        <SqlCodeEditor
          value={activeTab.query}
          language={editorLanguage}
          onMount={handleMount}
          onChange={handleChange}
          extensions={execExtensions}
          options={{
            fontSize: storeEditorFontSize,
            fontFamily: storeEditorFontFamily,
            lineHeight: storeEditorLineHeight,
            tabSize: storeEditorTabSize,
            wordWrap: 'on',
            paddingTop: 16,
          }}
        />
      </div>


      <div className="h-6 px-3 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[var(--ch-text-9)] text-muted-foreground/60 font-mono">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span className="text-[var(--ch-text-9)] text-muted-foreground/40">|</span>
          <span className="text-[var(--ch-text-9)] text-muted-foreground/60 font-mono">
            {activeTab.query.length} chars
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[var(--ch-text-9)] font-mono uppercase tracking-wider',
            isShellMode ? 'text-emerald-400/70' : isMongo ? 'text-blue-400/70' : 'text-primary/70'
          )}>
            {editorLanguage}
          </span>
        </div>
      </div>


      <SchemaFlowModal
        isOpen={isFlowModalOpen}
        onClose={() => setIsFlowModalOpen(false)}
        graph={flowGraph}
        isLoading={isFlowLoading}
        onReload={handleLoadSchemaFlow}
      />
    </div>
  );
}
