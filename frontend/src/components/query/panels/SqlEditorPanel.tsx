import { Editor, type Monaco } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { ChevronUp } from 'lucide-react';
import type { QueryTab } from '@/store/useAppStore';

interface SqlEditorPanelProps {
  activeTab: QueryTab;
  onToggle: () => void;
  updateTabQuery: (id: string, query: string) => void;
  handleEditorWillMount: (monacoInstance: Monaco) => void;
  handleEditorDidMount: (editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => void;
  connectionName: string;
  connectionType: string;
}

export function SqlEditorPanel({
  activeTab,
  onToggle,
  updateTabQuery,
  handleEditorWillMount,
  handleEditorDidMount,
  connectionName,
  connectionType,
}: SqlEditorPanelProps) {
  return (
    <div className="border border-border rounded-none bg-card overflow-hidden flex flex-col h-full w-full">
      <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center text-left shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onToggle} className="p-1 hover:bg-muted rounded">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SQL Editor</span>
          <span className="text-[10px] text-primary/70 font-bold ml-4 border border-primary/20 px-2 py-0.5 rounded bg-primary/5 uppercase">
            Press Ctrl/Cmd + Enter to run selection/line
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-3 border-l border-border">
          {connectionName} • {connectionType}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          defaultLanguage="sql"
          theme="vs-dark"
          value={activeTab.query}
          onChange={(val) => updateTabQuery(activeTab.id, val || '')}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          options={{ 
            minimap: { enabled: false }, 
            fontSize: 14, 
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace", 
            scrollBeyondLastLine: false, 
            automaticLayout: true, 
            padding: { top: 16 } 
          }}
        />
      </div>
    </div>
  );
}
