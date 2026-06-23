import { Editor, type Monaco } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { ChevronUp, Terminal, Database } from 'lucide-react';
import type { QueryTab } from '@/store/useAppStore';
import { useRef, useEffect, useCallback } from 'react';
import { isMongoShellSyntax } from '@/lib/mongoShellParser';
import {
  MONGO_SHELL_LANGUAGE_ID,
  registerMongoShellLanguage,
  defineMongoTheme,
} from '@/lib/mongoLanguage';

interface SqlEditorPanelProps {
  activeTab: QueryTab;
  onToggle: () => void;
  updateTabQuery: (id: string, query: string) => void;
  handleEditorWillMount: (monacoInstance: Monaco) => void;
  handleEditorDidMount: (editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => void;
  connectionName: string;
  connectionType: string;
  updateTabViewState: (id: string, viewState: monaco.editor.ICodeEditorViewState | null) => void;
}

export function SqlEditorPanel({
  activeTab,
  onToggle,
  updateTabQuery,
  handleEditorWillMount,
  handleEditorDidMount,
  connectionName,
  connectionType,
  updateTabViewState,
}: SqlEditorPanelProps) {
  const isMongo = connectionType === 'mongodb';
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const prevTabIdRef = useRef<string>(activeTab.id);

  // Detect if current query uses MongoDB shell syntax (derived — no state needed)
  const isShellMode = isMongo && isMongoShellSyntax(activeTab.query);

  // Dynamically update the Monaco editor language when shell mode toggles
  useEffect(() => {
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance) return;
    const model = editor.getModel();
    if (!model) return;
    const targetLang = isShellMode
      ? MONGO_SHELL_LANGUAGE_ID
      : isMongo
        ? 'json'
        : 'sql';
    monacoInstance.editor.setModelLanguage(model, targetLang);
  }, [isShellMode, isMongo]);

  // Save state when switching away from a tab or unmounting
  useEffect(() => {
    if (editorRef.current && prevTabIdRef.current !== activeTab.id) {
      const state = editorRef.current.saveViewState();
      updateTabViewState(prevTabIdRef.current, state);
      prevTabIdRef.current = activeTab.id;
    }
  }, [activeTab.id, updateTabViewState]);

  useEffect(() => {
    return () => {
      // On unmount, save the current tab's state
      if (editorRef.current) {
        const state = editorRef.current.saveViewState();
        updateTabViewState(prevTabIdRef.current, state);
      }
    };
  }, [updateTabViewState]);

  // Restore state when switching to a new tab
  useEffect(() => {
    if (editorRef.current && activeTab.editorViewState) {
      editorRef.current.restoreViewState(activeTab.editorViewState as monaco.editor.ICodeEditorViewState);
    }
  }, [activeTab.id, activeTab.editorViewState]);

  const onBeforeMount = useCallback((monacoInstance: Monaco) => {
    // Register MongoDB shell language & theme
    registerMongoShellLanguage(monacoInstance);
    defineMongoTheme(monacoInstance);
    // Delegate to parent hook for SQL completions, etc.
    handleEditorWillMount(monacoInstance);
  }, [handleEditorWillMount]);

  const onMount = useCallback((editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
    handleEditorDidMount(editorInstance, monacoInstance);
    if (activeTab.editorViewState) {
      editorInstance.restoreViewState(activeTab.editorViewState as monaco.editor.ICodeEditorViewState);
    }
  }, [handleEditorDidMount, activeTab.editorViewState]);

  const handleChange = useCallback((val: string | undefined) => {
    const query = val ?? '';
    updateTabQuery(activeTab.id, query);
  }, [activeTab.id, updateTabQuery]);

  // Compute editor language
  const editorLanguage = isShellMode
    ? MONGO_SHELL_LANGUAGE_ID
    : isMongo
      ? 'json'
      : 'sql';

  // Compute editor theme
  const editorTheme = isShellMode ? 'mongo-dark' : 'vs-dark';

  return (
    <div className="border border-border rounded-none bg-card overflow-hidden flex flex-col flex-1 min-h-0 w-full">
      <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center text-left shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onToggle} className="p-1 hover:bg-muted rounded">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Editor mode label */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isShellMode
              ? 'MongoDB Shell'
              : isMongo
                ? 'Schema Query Editor'
                : 'SQL Editor'}
          </span>

          {/* Shell mode badge */}
          {isShellMode && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30 animate-in fade-in duration-200">
              <Terminal className="w-2.5 h-2.5" />
              Shell Mode
            </span>
          )}

          {/* JSON / structured mode badge for non-shell mongo */}
          {isMongo && !isShellMode && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
              <Database className="w-2.5 h-2.5" />
              JSON Protocol
            </span>
          )}

          {/* Hint text */}
          <span className="text-[10px] text-primary/70 font-bold ml-2 border border-primary/20 px-2 py-0.5 rounded bg-primary/5 uppercase">
            {isShellMode
              ? 'db.collection.find({…}) · Ctrl/Cmd + Enter'
              : isMongo
                ? 'Ctrl/Cmd + Enter to run with filters'
                : 'Ctrl/Cmd + Enter to run selection/line'}
          </span>
        </div>

        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-3 border-l border-border">
          {connectionName} • {connectionType}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path={activeTab.id}
          language={editorLanguage}
          theme={editorTheme}
          value={activeTab.query}
          onChange={handleChange}
          beforeMount={onBeforeMount}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
            // Better bracket matching for JSON/shell
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
          }}
        />
      </div>
    </div>
  );
}
