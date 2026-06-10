import { DatabaseObject, ColumnResponse, QueryResult } from '@/types/database'
import { Table, Layout, Code, RefreshCw, List, Table2, Play, AlertCircle, X, Loader2, ChevronLeft, ChevronRight as ChevronRightIcon, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Editor } from '@monaco-editor/react'
import { UseMutationResult } from '@tanstack/react-query'

interface ObjectDetailProps {
  selectedItem: DatabaseObject | null
  activeTab: 'columns' | 'data' | 'ddl'
  setActiveTab: (tab: 'columns' | 'data' | 'ddl') => void
  columns?: ColumnResponse[]
  isLoadingColumns: boolean
  isLoadingData: boolean
  executionStatus: string
  executionError: string | null
  queryData: QueryResult | null
  pageSize: number
  setPageSize: (size: number) => void
  page: number
  setPage: (updater: (p: number) => number) => void
  handleExecute: () => void
  handleCancel: () => void
  isLoadingDDL: boolean
  editableDdl: string
  setEditableDdl: (ddl: string) => void
  updateDdlMutation: UseMutationResult<void, Error, string>
}

export function ObjectDetail({ 
  selectedItem, activeTab, setActiveTab, columns, isLoadingColumns,
  isLoadingData, executionStatus, executionError, queryData,
  pageSize, setPageSize, page, setPage, handleExecute, handleCancel,
  isLoadingDDL, editableDdl, setEditableDdl, updateDdlMutation
}: ObjectDetailProps) {
  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4"><Layout className="w-8 h-8 text-muted-foreground" /></div>
        <h3 className="text-lg font-medium">Object Detail</h3>
        <p className="text-sm text-muted-foreground max-w-xs">Select an item from the sidebar to view its structure and definition.</p>
      </div>
    )
  }

  return (
    <>
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-background border border-border rounded-lg">
            {selectedItem.type === 'table' && <Table className="w-5 h-5 text-primary" />}
            {selectedItem.type === 'view' && <Layout className="w-5 h-5 text-primary" />}
            {selectedItem.type === 'procedure' && <Code className="w-5 h-5 text-primary" />}
            {selectedItem.type === 'trigger' && <RefreshCw className="w-5 h-5 text-primary" />}
          </div>
          <div>
            <h3 className="font-bold text-lg">{selectedItem.name}</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{selectedItem.type}</p>
          </div>
        </div>
        <div className="flex bg-muted p-1 rounded-lg">
          {(selectedItem.type === 'table' || selectedItem.type === 'view' || selectedItem.type === 'procedure') && (
            <>
              {(selectedItem.type === 'table' || selectedItem.type === 'view') && (
                <button onClick={() => setActiveTab('columns')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'columns' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
                  <List className="w-3.5 h-3.5" />Columns
                </button>
              )}
              <button onClick={() => setActiveTab('data')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'data' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
                <Table2 className="w-3.5 h-3.5" />{selectedItem.type === 'procedure' ? 'Execution' : 'Data'}
              </button>
            </>
          )}
          <button onClick={() => setActiveTab('ddl')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'ddl' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
            <Code className="w-3.5 h-3.5" />Definition
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col">
        {activeTab === 'columns' && (selectedItem.type === 'table' || selectedItem.type === 'view') && (
          <div className="p-4">
            {isLoadingColumns ? (
              <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead><tr className="border-b border-border text-muted-foreground"><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium text-right">Nullable</th></tr></thead>
                <tbody>
                  {columns?.map((col) => (
                    <tr key={col.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium text-foreground">{col.name}</td>
                      <td className="py-3 font-mono text-xs text-muted-foreground uppercase tracking-tighter">{col.type}</td>
                      <td className="py-3 text-right"><span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", col.isNullable ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive")}>{col.isNullable ? 'Yes' : 'No'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'data' && (selectedItem.type === 'table' || selectedItem.type === 'view' || selectedItem.type === 'procedure') && (
          <div className="flex-1 flex flex-col min-h-0">
            {((selectedItem.type === 'view' || selectedItem.type === 'procedure') && executionStatus === 'idle') ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                {selectedItem.type === 'view' ? <Layout className="w-12 h-12 text-muted-foreground mb-4" /> : <Code className="w-12 h-12 text-muted-foreground mb-4" />}
                <h4 className="font-bold mb-2">{selectedItem.type === 'view' ? 'View Data' : 'Execute Procedure'}</h4>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs">{selectedItem.type === 'view' ? 'Viewing data from a view may take time.' : 'Executing a procedure will run its code on the server.'} Click the button to proceed via WebSocket.</p>
                <button onClick={() => handleExecute()} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" />{selectedItem.type === 'view' ? 'Execute View' : 'Run Procedure'}
                </button>
              </div>
            ) : (
              <>
                {executionStatus === 'error' && (
                  <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /><p className="text-xs font-mono">{executionError}</p>
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  {isLoadingData ? (
                    <div className="p-4 space-y-4">
                      <div className="flex items-center gap-2 text-primary animate-pulse mb-4">
                        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs font-bold uppercase tracking-widest">Executing via WebSocket...</span>
                        <button onClick={handleCancel} className="ml-auto bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded text-[10px] font-bold hover:bg-destructive/20 transition-colors">Stop</button>
                      </div>
                      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                    </div>
                  ) : queryData ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-background border-b border-border z-10">
                        <tr>{queryData.columns.map((col) => <th key={col} className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0">{col}</th>)}</tr>
                      </thead>
                      <tbody>
                        {queryData.rows.map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                            {queryData.columns.map((col) => <td key={col} className="p-2 border-r border-border last:border-0 truncate max-w-[200px]">{row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : executionStatus === 'success' && <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">Query executed successfully but returned no data.</div>}
                </div>
                {queryData && (
                  <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Rows: <span className="font-bold text-foreground">{queryData.rows.length}</span></span>
                      <span>Execution: <span className="font-bold text-foreground">{queryData.executionTime}ms</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="text-[10px] bg-background border border-border rounded px-2 py-1 outline-none">
                        <option value={10}>10</option><option value={50}>50</option><option value={100}>100</option>
                      </select>
                      <div className="flex items-center gap-1 ml-4">
                        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-[10px] font-bold px-2">{page + 1}</span>
                        <button disabled={queryData.rows.length < pageSize} onClick={() => setPage((p) => p + 1)} className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"><ChevronRightIcon className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'ddl' && (
          <div className="flex-1 flex flex-col bg-muted/30 relative">
            <div className="p-2 border-b border-border bg-background/50 flex justify-between items-center px-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Definition Editor</span>
              <button onClick={() => updateDdlMutation.mutate(editableDdl)} disabled={updateDdlMutation.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
                {updateDdlMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                {updateDdlMutation.isPending ? 'Saving...' : 'Apply Changes'}
              </button>
            </div>
            <div className="flex-1">
              {isLoadingDDL ? (
                <div className="p-4 space-y-2">{[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}</div>
              ) : (
                <Editor height="100%" defaultLanguage="sql" theme="vs-dark" value={editableDdl} onChange={(val) => setEditableDdl(val || '')} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
