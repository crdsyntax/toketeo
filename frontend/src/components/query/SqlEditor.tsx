import type * as monaco from 'monaco-editor'
import { Editor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { ChevronUp, ChevronDown, Play, Loader2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback } from 'react'
import type { QueryTab } from '@/store/useAppStore'
import type { Connection } from '@/types/database'

interface SqlEditorProps {
  activeTab: QueryTab | null
  panels: { editor: boolean; results: boolean }
  togglePanel: (panel: 'editor' | 'results') => void
  handleExecute: () => void
  handleCancel: () => void
  updateTabQuery: (id: string, query: string) => void
  activeConnection: Connection
}

export function SqlEditor({
  activeTab, panels, togglePanel, handleExecute, handleCancel,
  updateTabQuery, activeConnection
}: SqlEditorProps) {
  const handleEditorWillMount = useCallback((monacoInstance: Monaco) => {
    const languages = monacoInstance.languages as typeof monacoInstance.languages & { sqlProviderRegistered?: boolean };
    if (languages.sqlProviderRegistered) return;
    languages.sqlProviderRegistered = true;

    monacoInstance.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: monaco.languages.CompletionItem[] = [
          {
            label: 'SELECT',
            kind: 17, // CompletionItemKind.Snippet
            insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4, // CompletionItemInsertTextRule.InsertAsSnippet
            documentation: 'Basic SELECT statement',
            range: range,
          },
          {
            label: 'INSERT',
            kind: 17,
            insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});',
            insertTextRules: 4,
            documentation: 'Basic INSERT statement',
            range: range,
          },
          {
            label: 'UPDATE',
            kind: 17,
            insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};',
            insertTextRules: 4,
            documentation: 'Basic UPDATE statement',
            range: range,
          },
          {
            label: 'DELETE',
            kind: 17,
            insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4,
            documentation: 'Basic DELETE statement',
            range: range,
          },
        ];
        return { suggestions };
      },
    });
  }, [])

  const handleEditorDidMount = useCallback((editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorInstance.addCommand(monacoInstance.KeyMod.Ctrl | monacoInstance.KeyCode.Enter, handleExecute)
  }, [handleExecute])

  return (
    <div className={cn(
      "border border-border rounded-xl bg-card overflow-hidden flex flex-col transition-all duration-300",
      panels.editor ? "flex-[2] min-h-[150px]" : "h-10 shrink-0"
    )}>
      <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center text-left">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => togglePanel('editor')}
            className="p-1 hover:bg-muted rounded"
          >
            {panels.editor ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SQL Editor</span>
          
          <button 
            onClick={handleExecute}
            disabled={activeTab?.status === 'executing'}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50 ml-4"
          >
            {activeTab?.status === 'executing' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5 fill-current" />}
            {activeTab?.status === 'executing' ? 'Processing' : 'Run'}
          </button>

          {activeTab?.status === 'executing' && (
            <button 
              onClick={handleCancel}
              className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded-md text-[10px] font-bold hover:bg-destructive/20 transition-colors"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              Stop
            </button>
          )}
        </div>
        
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-3 border-l border-border hidden sm:block">
          {activeConnection.name} • {activeConnection.type}
        </div>
      </div>
      
      {panels.editor && (
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={activeTab?.query}
            onChange={(val) => activeTab && updateTabQuery(activeTab.id, val || '')}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16 },
            }}
          />
        </div>
      )}
    </div>
  )
}
