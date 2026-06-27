import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Plus, Trash2, Edit2, Play, Loader2, ArrowRight, X, BarChart3, History, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncService } from '@/services/sync.service'
import { PipelineEditor } from '@/components/sync/PipelineEditor'
import { SyncProgress } from '@/components/sync/SyncProgress'
import { SyncLogViewer } from '@/components/sync/SyncLogViewer'
import { SyncHistory } from '@/components/sync/SyncHistory'
import type { SyncPipeline, SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

type DetailTab = 'progress' | 'logs' | 'history'

export function CrossDbSyncPage() {
  const [showEditor, setShowEditor] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<SyncPipeline | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [selectedPipeline, setSelectedPipeline] = useState<SyncPipeline | null>(null)
  const [activeRun, setActiveRun] = useState<SyncRun | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('history')
  const queryClient = useQueryClient()

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['sync-pipelines'],
    queryFn: () => syncService.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => syncService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
      if (selectedPipeline && !pipelines?.find((p) => p.id === selectedPipeline.id)) {
        setSelectedPipeline(null)
      }
    },
  })

  const handleEdit = (p: SyncPipeline) => {
    setEditingPipeline(p)
    setShowEditor(true)
  }

  const handleCreate = () => {
    setEditingPipeline(null)
    setShowEditor(true)
  }

  const handleClose = () => {
    setShowEditor(false)
    setEditingPipeline(null)
    queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
  }

  const handleStart = async (p: SyncPipeline) => {
    setExecutingId(p.id)
    try {
      await syncService.start(p.id)
      setSelectedPipeline(p)
      setDetailTab('progress')
      queryClient.invalidateQueries({ queryKey: ['sync-runs', p.id] })
    } finally {
      setExecutingId(null)
    }
  }

  const handleSelectPipeline = (p: SyncPipeline) => {
    if (selectedPipeline?.id === p.id) {
      setSelectedPipeline(null)
      setActiveRun(null)
    } else {
      setSelectedPipeline(p)
      setActiveRun(null)
      setDetailTab('history')
    }
  }

  const statusColor = (s: PipelineStatus) => {
    switch (s) {
      case PipelineStatus.Ready: return 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20'
      case PipelineStatus.Running: return 'text-blue-500 bg-blue-500/5 border-blue-500/20'
      case PipelineStatus.Draft: return 'text-muted-foreground bg-muted/20 border-border'
      case PipelineStatus.Failed: return 'text-destructive bg-destructive/5 border-destructive/20'
      case PipelineStatus.Completed: return 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20'
      default: return 'text-muted-foreground bg-muted/20 border-border'
    }
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-primary" />
            Cross-DB Sync
          </h1>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-[0.2em] font-bold">
            Synchronize data across multiple database engines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" /> New Pipeline
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Pipeline list */}
        <div className={cn(selectedPipeline ? 'w-1/2' : 'w-full', 'space-y-4')}>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-44 bg-secondary/30 border border-border animate-pulse" />
              ))}
            </div>
          ) : pipelines && pipelines.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pipelines.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectPipeline(p)}
                  className={cn(
                    "group relative border border-border bg-secondary/30 p-4 transition-all duration-200 cursor-pointer",
                    selectedPipeline?.id === p.id
                      ? 'border-primary/50 bg-primary/5'
                      : 'hover:border-primary/30 hover:bg-secondary/50',
                  )}
                >
                  {selectedPipeline?.id === p.id && (
                    <div className="absolute -left-[1px] top-0 bottom-0 w-1 bg-primary" />
                  )}

                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/5 border border-primary/10">
                        <GitBranch className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm tracking-tight truncate max-w-[140px]">{p.name}</h3>
                        <span className={cn("inline-flex px-1.5 py-0.5 mt-1 text-[9px] font-bold tracking-widest uppercase border", statusColor(p.status))}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleStart(p)}
                        disabled={executingId === p.id}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        {executingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleEdit(p)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-primary text-[10px]">Source</span>
                      <span className="truncate">{p.source_connection_id.slice(0, 12)}...</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-primary text-[10px]">Target</span>
                      <span className="truncate">{p.target_connection_id.slice(0, 12)}...</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                      {p.mode.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {p.tables.length} table{p.tables.length !== 1 ? 's' : ''} · batch {p.batch_size}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border bg-muted/20">
              <GitBranch className="w-12 h-12 mb-4 opacity-30" />
              <h3 className="text-base font-semibold text-foreground mb-1">No Sync Pipelines</h3>
              <p className="text-sm max-w-md">Create a pipeline to start syncing data across databases.</p>
              <button
                onClick={handleCreate}
                className="mt-6 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
              >
                <Plus className="w-4 h-4" /> New Pipeline
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedPipeline && (
          <div className="w-1/2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight uppercase">{selectedPipeline.name}</h2>
              <button
                onClick={() => { setSelectedPipeline(null); setActiveRun(null) }}
                className="p-1 text-muted-foreground hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border pb-1">
              {[
                { id: 'progress' as DetailTab, icon: BarChart3, label: 'Progress' },
                { id: 'logs' as DetailTab, icon: ScrollText, label: 'Logs' },
                { id: 'history' as DetailTab, icon: History, label: 'History' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all",
                    detailTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon className="w-3 h-3" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {detailTab === 'progress' && (
              activeRun ? (
                <SyncProgress run={activeRun} />
              ) : (
                <div className="border border-border bg-muted/20 p-6 text-center">
                  <p className="text-xs text-muted-foreground">Select a run from History to view progress, or start a new sync.</p>
                </div>
              )
            )}

            {detailTab === 'logs' && (
              activeRun ? (
                <SyncLogViewer runId={activeRun.id} />
              ) : (
                <div className="border border-border bg-muted/20 p-6 text-center">
                  <p className="text-xs text-muted-foreground">Select a run to view its batch logs.</p>
                </div>
              )
            )}

            {detailTab === 'history' && (
              <SyncHistory
                pipelineId={selectedPipeline.id}
                activeRunId={activeRun?.id}
                onSelectRun={(run) => { setActiveRun(run); setDetailTab('progress') }}
              />
            )}
          </div>
        )}
      </div>

      {showEditor && (
        <PipelineEditor pipeline={editingPipeline} onClose={handleClose} />
      )}
    </div>
  )
}
