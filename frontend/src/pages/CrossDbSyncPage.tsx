import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { GitBranch, Plus, Trash2, Edit2, Play, Loader2, X, BarChart3, History, ScrollText, Database, Clock, CheckCircle2, AlertCircle, Pause, Square, ArrowRightFromLine } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'
import { syncService } from '@/services/sync.service'
import { SyncWizard } from '@/components/sync/wizard/SyncWizard'
import { SyncProgress } from '@/components/sync/SyncProgress'
import type { ProgressState, MiniLog } from '@/lib/sync-progress'
import { createInitialProgress } from '@/lib/sync-progress'
import { SyncLogViewer } from '@/components/sync/SyncLogViewer'
import { SyncHistory } from '@/components/sync/SyncHistory'
import type { SyncPipeline, SyncRun } from '@/types/sync'
import type { SyncEvent } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

type DetailTab = 'progress' | 'logs' | 'history'

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'justo ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

const STATUS_CONFIG: Record<PipelineStatus, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  [PipelineStatus.Ready]: { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', label: 'Listo', icon: CheckCircle2 },
  [PipelineStatus.Running]: { color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', label: 'En progreso', icon: Loader2 },
  [PipelineStatus.Draft]: { color: 'text-muted-foreground bg-muted/20 border-border', label: 'Borrador', icon: Clock },
  [PipelineStatus.Failed]: { color: 'text-destructive bg-destructive/10 border-destructive/20', label: 'Error', icon: AlertCircle },
  [PipelineStatus.Completed]: { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', label: 'Completado', icon: CheckCircle2 },
  [PipelineStatus.Paused]: { color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', label: 'Pausado', icon: Pause },
  [PipelineStatus.Cancelled]: { color: 'text-muted-foreground bg-muted/20 border-border', label: 'Cancelado', icon: Square },
  [PipelineStatus.Retrying]: { color: 'text-orange-500 bg-orange-500/10 border-orange-500/20', label: 'Reintentando', icon: Loader2 },
}

export function CrossDbSyncPage() {
  const [showEditor, setShowEditor] = useState(false)
  const [wizardMinimized, setWizardMinimized] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<SyncPipeline | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [pausedId, setPausedId] = useState<string | null>(null)
  const [selectedPipeline, setSelectedPipeline] = useState<SyncPipeline | null>(null)
  const [activeRun, setActiveRun] = useState<SyncRun | null>(null)
  const [progressState, setProgressState] = useState<ProgressState>(() => createInitialProgress({ processed_rows: 0, total_rows: 0, error_count: 0 } as SyncRun))
  const [progressLogs, setProgressLogs] = useState<MiniLog[]>([])
  const [detailTab, setDetailTab] = useState<DetailTab>('history')
  const virtualRunCounter = useRef(0)
  const executingPipelineIdRef = useRef<string | null>(null)
  const [latestRuns, setLatestRuns] = useState<Record<string, SyncRun>>({})
  const queryClient = useQueryClient()

  // Reset progress state when activeRun changes
  useEffect(() => {
    if (activeRun) {
      setProgressState(createInitialProgress(activeRun))
      setProgressLogs([])
    }
  }, [activeRun?.id])

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['sync-pipelines'],
    queryFn: () => syncService.list(),
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const connMap = new Map(connections?.map((c) => [c.id, c]) ?? [])

  // Fetch latest run for each pipeline
  useEffect(() => {
    if (!pipelines) return
    pipelines.forEach((p) => {
      syncService.listRuns(p.id).then((runs) => {
        if (runs.length > 0) {
          setLatestRuns((prev) => ({ ...prev, [p.id]: runs[0] }))
        }
      }).catch(() => {})
    })
  }, [pipelines])

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
    setWizardMinimized(false)
  }

  const handleCreate = () => {
    setEditingPipeline(null)
    setShowEditor(true)
    setWizardMinimized(false)
  }

  const handleClose = async () => {
    setShowEditor(false)
    setEditingPipeline(null)
    setWizardMinimized(false)
    await queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
    // Refresh selectedPipeline with fresh data from cache after save
    if (selectedPipeline) {
      const fresh = queryClient.getQueryData<SyncPipeline[]>(['sync-pipelines'])
      const updated = fresh?.find((p) => p.id === selectedPipeline.id)
      if (updated) setSelectedPipeline(updated)
    }
  }

  const handleStart = async (p: SyncPipeline) => {
    setExecutingId(p.id)
    executingPipelineIdRef.current = p.id
    virtualRunCounter.current += 1
    queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
      old?.map((pipe) => pipe.id === p.id ? { ...pipe, status: PipelineStatus.Running } : pipe)
    )
    const virtualRun: SyncRun = {
      id: `virtual-${virtualRunCounter.current}`,
      pipeline_id: p.id,
      status: PipelineStatus.Running,
      total_rows: 0,
      processed_rows: 0,
      error_count: 0,
      batch_count: 0,
    }
    setActiveRun(virtualRun)
    setSelectedPipeline(p)
    setDetailTab('progress')
    try {
      await syncService.start(p.id)
    } catch {
      setExecutingId(null)
      executingPipelineIdRef.current = null
      queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
        old?.map((pipe) => pipe.id === p.id ? { ...pipe, status: PipelineStatus.Ready } : pipe)
      )
    }
  }

  const handlePause = async (id: string) => {
    setPausedId(id)
    try {
      const currentStatus = pipelines?.find((p) => p.id === id)?.status
      if (currentStatus === PipelineStatus.Paused) {
        await syncService.resume(id)
        queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
          old?.map((p) => p.id === id ? { ...p, status: PipelineStatus.Running } : p)
        )
      } else {
        await syncService.pause(id)
        queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
          old?.map((p) => p.id === id ? { ...p, status: PipelineStatus.Paused } : p)
        )
      }
    } catch {
      toast.error('Error al pausar/reanudar sincronización')
    } finally {
      setPausedId(null)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await syncService.cancel(id)
      setExecutingId(null)
      executingPipelineIdRef.current = null
      queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
        old?.map((p) => p.id === id ? { ...p, status: PipelineStatus.Cancelled } : p)
      )
      toast.success('Sincronización cancelada')
    } catch {
      toast.error('Error al cancelar sincronización')
    }
  }

  useEffect(() => {
    const unlisten = listen<SyncEvent>('sync:event', (event) => {
      const e = event.payload
      if (e.PhaseCompleted) {
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
        toast.success(`Tabla "${e.PhaseCompleted.table}" sincronizada: ${e.PhaseCompleted.total_rows.toLocaleString()} filas`)
        setLatestRuns((prev) => ({
          ...prev,
          [selectedPipeline?.id ?? '']: {
            id: `run-${Date.now()}`,
            pipeline_id: selectedPipeline?.id ?? '',
            status: PipelineStatus.Completed,
            total_rows: e.PhaseCompleted!.total_rows,
            processed_rows: e.PhaseCompleted!.total_rows,
            error_count: 0,
            batch_count: 0,
          },
        }))
      }
      if (e.Completed) {
        const pipeId = executingPipelineIdRef.current
        setExecutingId(null)
        executingPipelineIdRef.current = null
        // Optimistic: mark run as completed immediately so detail panel shows "Completado"
        setActiveRun((prev) => prev ? { ...prev, status: PipelineStatus.Completed, completed_at: new Date().toISOString() } : prev)
        if (pipeId) {
          queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
            old?.map((p) => p.id === pipeId ? { ...p, status: PipelineStatus.Completed } : p)
          )
        }
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
        // Fetch the latest run so the "Registros" tab updates to the newest execution
        if (pipeId) {
          syncService.listRuns(pipeId).then((runs) => {
            if (runs.length > 0) {
              const latest = runs[0]
              setActiveRun(latest)
              setLatestRuns((prev) => ({ ...prev, [pipeId]: latest }))
            }
          }).catch(() => {})
        }
        toast.success('Sincronización completada')
      }
      if (e.Error) {
        const pipeId = executingPipelineIdRef.current
        setExecutingId(null)
        executingPipelineIdRef.current = null
        // Optimistic: mark run as failed immediately
        setActiveRun((prev) => prev ? { ...prev, status: PipelineStatus.Failed, error_count: prev.error_count + 1 } : prev)
        if (pipeId) {
          queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
            old?.map((p) => p.id === pipeId ? { ...p, status: PipelineStatus.Failed } : p)
          )
        }
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
        toast.error(`Error en sincronización: ${e.Error.message}`)
      }
    })
    return () => { unlisten.then((f) => f()) }
  }, [queryClient, selectedPipeline])

  useEffect(() => {
    const unlisten = listen<string>('sync:error', (event) => {
      setExecutingId(null)
      executingPipelineIdRef.current = null
      queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
      queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
      toast.error(`Error en sincronización: ${event.payload}`)
    })
    return () => { unlisten.then((f) => f()) }
  }, [queryClient])

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

  const isExecuting = (id: string) => executingId === id

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-primary" />
            Sincronización Cross-DB
          </h1>
          <p className="text-[var(--ch-text-10)] text-muted-foreground mt-1 uppercase tracking-[0.2em] font-bold">
            Sincroniza datos entre distintos motores de base de datos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" /> Nueva Sincronización
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className={cn(selectedPipeline ? 'w-1/2' : 'w-full', 'space-y-4')}>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-44 bg-secondary/30 border border-border animate-pulse" />
              ))}
            </div>
          ) : pipelines && pipelines.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pipelines.map((p) => {
                const sc = connMap.get(p.source_connection_id)
                const tc = connMap.get(p.target_connection_id)
                const lastRun = latestRuns[p.id]
                const cfg = STATUS_CONFIG[p.status]
                const StatusIcon = cfg.icon
                const busy = isExecuting(p.id)

                return (
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

                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/5 border border-primary/10">
                          <GitBranch className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm tracking-tight truncate max-w-[140px]">{p.name}</h3>
                          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 text-[var(--ch-text-9)] font-bold tracking-widest uppercase border", cfg.color)}>
                            <StatusIcon className={cn("w-3 h-3", p.status === PipelineStatus.Running || p.status === PipelineStatus.Retrying ? 'animate-spin' : '')} />
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {busy ? (
                          <>
                            <button
                              onClick={() => handlePause(p.id)}
                              disabled={pausedId === p.id}
                              className={cn(
                                "p-1.5 text-muted-foreground hover:bg-yellow-500/5 transition-colors",
                                p.status === PipelineStatus.Paused ? 'hover:text-emerald-500' : 'hover:text-yellow-500',
                              )}
                              title={p.status === PipelineStatus.Paused ? 'Reanudar' : 'Pausar'}
                            >
                              {pausedId === p.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : p.status === PipelineStatus.Paused ? (
                                <Play className="w-3.5 h-3.5" />
                              ) : (
                                <Pause className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleCancel(p.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                              title="Cancelar"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStart(p)}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                              title="Ejecutar"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEdit(p)}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(p.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[var(--ch-text-10)] text-muted-foreground mb-3">
                      <span className="flex items-center gap-1 truncate max-w-[120px]">
                        <Database className="w-3 h-3 shrink-0" />
                        {sc?.name ?? p.source_connection_id.slice(0, 8)}
                      </span>
                      <ArrowRightFromLine className="w-3 h-3 shrink-0 text-primary" />
                      <span className="flex items-center gap-1 truncate max-w-[120px]">
                        <Database className="w-3 h-3 shrink-0" />
                        {tc?.name ?? p.target_connection_id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-border/50 flex items-center justify-between text-[var(--ch-text-10)] text-muted-foreground">
                      <span className="font-bold uppercase tracking-wider">{p.mode === 'full' ? 'Completa' : 'Incremental'}</span>
                      <span>{p.tables.length} tabla{p.tables.length !== 1 ? 's' : ''}</span>
                    </div>

                    {lastRun && (
                      <div className="mt-1 text-[var(--ch-text-9)] text-muted-foreground/70">
                        {lastRun.completed_at ? (
                          <span>Última ejecución: {timeAgo(lastRun.completed_at)} · {lastRun.processed_rows} filas, {lastRun.error_count} errores</span>
                        ) : (
                          <span>Última ejecución: {timeAgo(lastRun.started_at ?? '')}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border bg-muted/20">
              <GitBranch className="w-12 h-12 mb-4 opacity-30" />
              <h3 className="text-base font-semibold text-foreground mb-1">Sin sincronizaciones</h3>
              <p className="text-sm max-w-md">Crea una sincronización para empezar a transferir datos entre bases de datos.</p>
              <button
                onClick={handleCreate}
                className="mt-6 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
              >
                <Plus className="w-4 h-4" /> Nueva Sincronización
              </button>
            </div>
          )}
        </div>

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

            <div className="flex gap-1 border-b border-border pb-1">
              {[
                { id: 'progress' as DetailTab, icon: BarChart3, label: 'Progreso' },
                { id: 'logs' as DetailTab, icon: ScrollText, label: 'Registros' },
                { id: 'history' as DetailTab, icon: History, label: 'Historial' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest border-b-2 transition-all",
                    detailTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon className="w-3 h-3" /> {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'progress' && (
              activeRun ? (
                <SyncProgress run={activeRun} progress={progressState} logs={progressLogs} onProgressChange={setProgressState} onLogsChange={setProgressLogs} />
              ) : (
                <div className="border border-border bg-muted/20 p-6 text-center">
                  <p className="text-xs text-muted-foreground">Selecciona una ejecución del historial para ver su progreso, o inicia una nueva sincronización.</p>
                </div>
              )
            )}

            {detailTab === 'logs' && (
              activeRun ? (
                <SyncLogViewer runId={activeRun.id} />
              ) : (
                <div className="border border-border bg-muted/20 p-6 text-center">
                  <p className="text-xs text-muted-foreground">Selecciona una ejecución para ver sus registros.</p>
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
        <SyncWizard
          pipeline={editingPipeline}
          onClose={handleClose}
          minimized={wizardMinimized}
          onMinimize={() => setWizardMinimized(true)}
          onRestore={() => setWizardMinimized(false)}
        />
      )}

      {showEditor && wizardMinimized && (
        <button
          onClick={() => setWizardMinimized(false)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border px-4 py-2.5 shadow-lg hover:bg-muted/50 transition-colors"
        >
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {editingPipeline ? 'Editar' : 'Nueva'} Sincronización
          </span>
          <span className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            Minimizado
          </span>
        </button>
      )}
    </div>
  )
}
