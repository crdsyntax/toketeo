import { Editor } from '@monaco-editor/react'
import { useMutation } from '@tanstack/react-query'
import { Play, Plus, X, AlertCircle, Clock, Table2, FileJson, Download } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface QueryResponse {
  columns: string[]
  rows: Record<string, any>[]
  executionTime: number
}

export default function QueryEditor() {
  const { activeConnection, tabs, activeTabId, addTab, removeTab, updateTabQuery, setActiveTabId } = useAppStore()
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const [results, setResults] = useState<QueryResponse | null>(null)

  const executeMutation = useMutation({
    mutationFn: (sql: string) => apiFetch<QueryResponse>(`/connections/${activeConnection?.id}/query/execute`, {
      method: 'POST',
      body: JSON.stringify({ sql })
    }),
    onSuccess: (data) => setResults(data),
  })

  const handleExecute = () => {
    if (activeTab?.query && activeConnection) {
      executeMutation.mutate(activeTab.query)
    }
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editor.addCommand(monaco.KeyMod.Ctrl | monaco.KeyCode.Enter, handleExecute)
  }

  if (!activeConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No Connection Active</h2>
          <p className="text-muted-foreground">Select a connection first to execute queries.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      {/* Tabs Header */}
      <div className="flex items-center gap-1 overflow-x-auto min-h-[40px]">
        {tabs.map((tab) => (
          <div 
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer transition-colors border-x border-t",
              activeTabId === tab.id 
                ? "bg-card border-border text-foreground" 
                : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
            )}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            <button 
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/20 rounded transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button 
          onClick={addTab}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground ml-2"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col min-h-0">
        <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center">
          <button 
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            {executeMutation.isPending ? 'Executing...' : 'Run Query'}
          </button>
          
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-3 border-l border-border">
            {activeConnection.name} • {activeConnection.type}
          </div>
        </div>
        
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={activeTab?.query}
            onChange={(val) => updateTabQuery(activeTab.id, val || '')}
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
      </div>

      {/* Results Panel */}
      <div className="h-1/3 border border-border rounded-xl bg-card flex flex-col overflow-hidden min-h-[200px]">
        <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center px-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Table2 className="w-3.5 h-3.5" />
            Results
          </h3>
          
          {results && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                {results.executionTime}ms
              </div>
              <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
                <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  CSV
                </button>
                <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <FileJson className="w-3 h-3" />
                  JSON
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {executeMutation.isError && (
            <div className="p-6 flex flex-col items-center justify-center h-full text-destructive space-y-2">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-bold">Query Error</p>
              <p className="text-xs opacity-80 font-mono">{(executeMutation.error as any).message}</p>
            </div>
          )}

          {results ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-background border-b border-border z-10 shadow-sm">
                <tr>
                  {results.columns.map(col => (
                    <th key={col} className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                    {results.columns.map(col => (
                      <td key={col} className="p-2 border-r border-border last:border-0 truncate max-w-[250px]">
                        {row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !executeMutation.isPending && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Run a query to see results
            </div>
          )}

          {executeMutation.isPending && (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-6 bg-muted animate-pulse rounded" />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
