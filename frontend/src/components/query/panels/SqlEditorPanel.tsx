import { Editor, type Monaco } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { ChevronUp, Terminal, Code2, Sparkles } from 'lucide-react';
import type { QueryTab, EditorMode } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useRef, useEffect, useCallback, useState } from 'react';
import { isMongoShellSyntax } from '@/lib/mongoShellParser';
import { DatabaseType } from '@/types/database';
import { cn } from '@/lib/utils';
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
  connectionName?: string;
  connectionType?: string;
  updateTabViewState: (id: string, viewState: monaco.editor.ICodeEditorViewState | null) => void;
  updateTabEditorMode: (id: string, mode: EditorMode) => void;
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
  updateTabEditorMode,
}: SqlEditorPanelProps) {
  const isMongo = connectionType === DatabaseType.MONGODB;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const prevTabIdRef = useRef<string>(activeTab.id);
  const storeEditorFontFamily = useAppStore((s) => s.editorFontFamily);
  const storeEditorFontSize = useAppStore((s) => s.uiFontSize);
  const storeEditorLineHeight = useAppStore((s) => s.editorLineHeight);
  const storeEditorTabSize = useAppStore((s) => s.editorTabSize);
  const storeEditorMinimap = useAppStore((s) => s.editorMinimap);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const mode = activeTab.editorMode ?? 'auto';

  // When in 'auto', derive mode from query text; otherwise use the explicit mode
  const isShellMode = isMongo && (
    mode === 'mongosh' ? true
    : mode === 'json' ? false
    : isMongoShellSyntax(activeTab.query)
  );

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
    editorInstance.focus();

    // Track cursor position
    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
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

  const modeChips = [
    { id: 'mongosh' as EditorMode, label: 'Shell', icon: Terminal },
    { id: 'auto' as EditorMode, label: 'Auto', icon: Code2 },
    { id: 'json' as EditorMode, label: 'JSON', icon: Sparkles },
  ];

  return (
    <div className="border border-border rounded-none bg-card overflow-hidden flex flex-col flex-1 min-h-0 w-full">
      {/* Header */}
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
            <span className="text-[var(--ch-text-10)] text-muted-foreground/50 hidden md:inline">
              Ctrl/Cmd + Enter
            </span>
          )}
          <span className="text-[var(--ch-text-10)] text-muted-foreground/70 font-mono">
            {connectionName}
          </span>
        </div>
      </div>

      {/* Editor */}
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
            minimap: { enabled: storeEditorMinimap },
            fontSize: storeEditorFontSize,
            fontFamily: storeEditorFontFamily,
            lineHeight: storeEditorLineHeight,
            tabSize: storeEditorTabSize,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
            lineNumbers: 'on',
            cursorStyle: 'line',
            renderLineHighlight: 'all',
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
          }}
        />
      </div>

      {/* Status bar */}
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
    </div>
  );
}
