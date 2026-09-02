import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import {
  GitBranch,
  Plus,
  Trash2,
  Edit2,
  Play,
  Loader2,
  X,
  BarChart3,
  History,
  ScrollText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pause,
  Square,
  ArrowRight,
  Search,
  Activity,
  Layers,
  Zap,
} from 'lucide-react'
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
import { DatabaseType } from '@/types/database'

type DetailTab = 'progress' | 'logs' | 'history'

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STATUS_CONFIG: Record<
  PipelineStatus,
  { color: string; label: string; icon: typeof CheckCircle2 }
> = {
  [PipelineStatus.Ready]: {
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    label: 'Ready',
    icon: CheckCircle2,
  },
  [PipelineStatus.Running]: {
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    label: 'Running',
    icon: Loader2,
  },
  [PipelineStatus.Draft]: {
    color: 'text-muted-foreground bg-muted/20 border-border',
    label: 'Draft',
    icon: Clock,
  },
  [PipelineStatus.Failed]: {
    color: 'text-destructive bg-destructive/10 border-destructive/20',
    label: 'Failed',
    icon: AlertCircle,
  },
  [PipelineStatus.Completed]: {
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    label: 'Completed',
    icon: CheckCircle2,
  },
  [PipelineStatus.Paused]: {
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    label: 'Paused',
    icon: Pause,
  },
  [PipelineStatus.Cancelled]: {
    color: 'text-muted-foreground bg-muted/20 border-border',
    label: 'Cancelled',
    icon: Square,
  },
  [PipelineStatus.Retrying]: {
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    label: 'Retrying',
    icon: Loader2,
  },
}

function getEngineBadge(type?: DatabaseType | string) {
  switch (type) {
    case DatabaseType.POSTGRES:
      return { label: 'PostgreSQL', bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30' }
    case DatabaseType.MARIADB:
      return { label: 'MariaDB', bg: 'bg-teal-500/15 text-teal-400 border-teal-500/30' }
    case DatabaseType.MYSQL:
      return { label: 'MySQL', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    case DatabaseType.MONGODB:
      return { label: 'MongoDB', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    case DatabaseType.SQLITE:
      return { label: 'SQLite', bg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' }
    case DatabaseType.SQLSERVER:
      return { label: 'SQL Server', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
    case DatabaseType.REDIS:
      return { label: 'Redis', bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    default:
      return { label: 'Database', bg: 'bg-muted/40 text-muted-foreground border-border' }
  }
}

export function CrossDbSyncPage() {
  const [showEditor, setShowEditor] = useState(false)
  const [wizardMinimized, setWizardMinimized] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<SyncPipeline | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [pausedId, setPausedId] = useState<string | null>(null)
  const [selectedPipeline, setSelectedPipeline] = useState<SyncPipeline | null>(null)
  const [activeRun, setActiveRun] = useState<SyncRun | null>(null)
  const [progressState, setProgressState] = useState<ProgressState>(() =>
    createInitialProgress({ processed_rows: 0, total_rows: 0, error_count: 0 } as SyncRun)
  )
  const [progressLogs, setProgressLogs] = useState<MiniLog[]>([])
  const [detailTab, setDetailTab] = useState<DetailTab>('history')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | PipelineStatus>('all')

  const virtualRunCounter = useRef(0)
  const executingPipelineIdRef = useRef<string | null>(null)
  const [latestRuns, setLatestRuns] = useState<Record<string, SyncRun>>({})
  const queryClient = useQueryClient()

  const [prevRunKey, setPrevRunKey] = useState<string | undefined>(activeRun?.id)
  if (activeRun?.id !== prevRunKey) {
    setPrevRunKey(activeRun?.id)
    if (activeRun) {
      setProgressState(createInitialProgress(activeRun))
      setProgressLogs([])
    }
  }

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['sync-pipelines'],
    queryFn: () => syncService.list(),
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const connMap = useMemo(
    () => new Map(connections?.map((c) => [c.id, c]) ?? []),
    [connections]
  )

  useEffect(() => {
    if (!pipelines) return
    pipelines.forEach((p) => {
      syncService
        .listRuns(p.id)
        .then((runs) => {
          if (runs.length > 0) {
            setLatestRuns((prev) => ({ ...prev, [p.id]: runs[0] }))
          }
        })
        .catch(() => {})
    })
  }, [pipelines])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => syncService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
      if (selectedPipeline && !pipelines?.find((p) => p.id === selectedPipeline.id)) {
        setSelectedPipeline(null)
      }
      toast.success('Sync pipeline deleted')
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
      old?.map((pipe) => (pipe.id === p.id ? { ...pipe, status: PipelineStatus.Running } : pipe))
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
        old?.map((pipe) => (pipe.id === p.id ? { ...pipe, status: PipelineStatus.Ready } : pipe))
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
          old?.map((p) => (p.id === id ? { ...p, status: PipelineStatus.Running } : p))
        )
      } else {
        await syncService.pause(id)
        queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
          old?.map((p) => (p.id === id ? { ...p, status: PipelineStatus.Paused } : p))
        )
      }
    } catch {
      toast.error('Error pausing/resuming sync')
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
        old?.map((p) => (p.id === id ? { ...p, status: PipelineStatus.Cancelled } : p))
      )
      toast.success('Sync cancelled')
    } catch {
      toast.error('Error cancelling sync')
    }
  }

  useEffect(() => {
    const unlisten = listen<SyncEvent>('sync:event', (event) => {
      const e = event.payload
      if (e.PhaseCompleted) {
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
        toast.success(
          `Table "${e.PhaseCompleted.table}" synced: ${e.PhaseCompleted.total_rows.toLocaleString()} rows`
        )
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

        setActiveRun((prev) =>
          prev
            ? { ...prev, status: PipelineStatus.Completed, completed_at: new Date().toISOString() }
            : prev
        )
        if (pipeId) {
          queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
            old?.map((p) => (p.id === pipeId ? { ...p, status: PipelineStatus.Completed } : p))
          )
        }
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })

        if (pipeId) {
          syncService
            .listRuns(pipeId)
            .then((runs) => {
              if (runs.length > 0) {
                const latest = runs[0]
                setActiveRun(latest)
                setLatestRuns((prev) => ({ ...prev, [pipeId]: latest }))
              }
            })
            .catch(() => {})
        }
        toast.success('Sync completed')
      }
      if (e.Error) {
        const pipeId = executingPipelineIdRef.current
        setExecutingId(null)
        executingPipelineIdRef.current = null

        setActiveRun((prev) =>
          prev
            ? { ...prev, status: PipelineStatus.Failed, error_count: prev.error_count + 1 }
            : prev
        )
        if (pipeId) {
          queryClient.setQueryData(['sync-pipelines'], (old: SyncPipeline[] | undefined) =>
            old?.map((p) => (p.id === pipeId ? { ...p, status: PipelineStatus.Failed } : p))
          )
        }
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
        queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
        toast.error(`Sync error: ${e.Error.message}`)
      }
    })
    return () => {
      unlisten.then((f) => f())
    }
  }, [queryClient, selectedPipeline])

  useEffect(() => {
    const unlisten = listen<string>('sync:error', (event) => {
      setExecutingId(null)
      executingPipelineIdRef.current = null
      queryClient.invalidateQueries({ queryKey: ['sync-runs'] })
      queryClient.invalidateQueries({ queryKey: ['sync-pipelines'] })
      toast.error(`Sync error: ${event.payload}`)
    })
    return () => {
      unlisten.then((f) => f())
    }
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

  const totalPipelines = pipelines?.length ?? 0
  const runningPipelines =
    pipelines?.filter(
      (p) => p.status === PipelineStatus.Running || p.status === PipelineStatus.Retrying
    ).length ?? 0
  const totalSyncedRows = useMemo(() => {
    return Object.values(latestRuns).reduce((acc, r) => acc + (r.processed_rows || 0), 0)
  }, [latestRuns])

  const filteredPipelines = useMemo(() => {
    if (!pipelines) return []
    return pipelines.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const sc = connMap.get(p.source_connection_id)
      const tc = connMap.get(p.target_connection_id)
      return (
        p.name.toLowerCase().includes(q) ||
        (sc?.name?.toLowerCase() || '').includes(q) ||
        (tc?.name?.toLowerCase() || '').includes(q) ||
        (p.source_schema?.toLowerCase() || '').includes(q) ||
        (p.target_schema?.toLowerCase() || '').includes(q)
      )
    })
  }, [pipelines, statusFilter, searchQuery, connMap])

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-6 px-4 md:px-6">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-lg">
              <GitBranch className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">Cross-DB Sync</h1>
              <p className="text-[var(--ch-text-10)] text-muted-foreground mt-0.5 uppercase tracking-[0.2em] font-bold">
                Orchestrate and sync data between heterogeneous database engines
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-6 px-4 py-2 bg-secondary/40 border border-border/70 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground font-medium">Pipelines:</span>
              <span className="font-bold font-mono text-foreground">{totalPipelines}</span>
            </div>
            <div className="w-px h-4 bg-border/60" />
            <div className="flex items-center gap-2">
              <Activity className={cn('w-4 h-4', runningPipelines > 0 ? 'text-blue-400 animate-pulse' : 'text-muted-foreground')} />
              <span className="text-muted-foreground font-medium">Active:</span>
              <span className="font-bold font-mono text-foreground">{runningPipelines}</span>
            </div>
            <div className="w-px h-4 bg-border/60" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground font-medium">Synced Rows:</span>
              <span className="font-bold font-mono text-foreground">{totalSyncedRows.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md hover:brightness-110 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Sync
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-secondary/20 p-2.5 rounded-lg border border-border/60">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search pipelines, databases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border/80 pl-9 pr-3 py-1.5 text-xs rounded-md outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: PipelineStatus.Running, label: 'Running' },
              { id: PipelineStatus.Completed, label: 'Completed' },
              { id: PipelineStatus.Ready, label: 'Ready' },
              { id: PipelineStatus.Failed, label: 'Failed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-md transition-colors shrink-0',
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Pipelines list + Master Detail panel */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className={cn(selectedPipeline ? 'w-full lg:w-1/2' : 'w-full', 'space-y-4 transition-all')}>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-secondary/30 border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredPipelines.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredPipelines.map((p) => {
                const sc = connMap.get(p.source_connection_id)
                const tc = connMap.get(p.target_connection_id)
                const sBadge = getEngineBadge(sc?.type)
                const tBadge = getEngineBadge(tc?.type)
                const lastRun = latestRuns[p.id]
                const cfg = STATUS_CONFIG[p.status]
                const StatusIcon = cfg.icon
                const busy = isExecuting(p.id)
                const isSelected = selectedPipeline?.id === p.id

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPipeline(p)}
                    className={cn(
                      'group relative rounded-xl border bg-card/60 p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                        : 'border-border/70 hover:border-primary/40 hover:bg-muted/20'
                    )}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}

                    {/* Top Row: Title, Status, Action Buttons */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-sm tracking-tight truncate text-foreground">
                              {p.name}
                            </h3>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border rounded-md',
                                cfg.color
                              )}
                            >
                              <StatusIcon
                                className={cn(
                                  'w-3 h-3',
                                  p.status === PipelineStatus.Running || p.status === PipelineStatus.Retrying
                                    ? 'animate-spin'
                                    : ''
                                )}
                              />
                              {cfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Actions Toolbar */}
                        <div
                          className="flex items-center gap-1 bg-muted/40 p-1 rounded-md border border-border/50 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {busy ? (
                            <>
                              <button
                                onClick={() => handlePause(p.id)}
                                disabled={pausedId === p.id}
                                className={cn(
                                  'p-1.5 rounded text-muted-foreground transition-colors',
                                  p.status === PipelineStatus.Paused
                                    ? 'hover:text-emerald-400 hover:bg-emerald-500/10'
                                    : 'hover:text-yellow-400 hover:bg-yellow-500/10'
                                )}
                                title={p.status === PipelineStatus.Paused ? 'Resume' : 'Pause'}
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
                                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Cancel"
                              >
                                <Square className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStart(p)}
                                className="p-1.5 rounded text-primary hover:bg-primary/10 transition-colors"
                                title="Run Sync"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                              <button
                                onClick={() => handleEdit(p)}
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Edit Configuration"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete pipeline "${p.name}"?`)) {
                                deleteMutation.mutate(p.id)
                              }
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete Pipeline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Route Flow: Source ➔ Target */}
                      <div className="bg-secondary/30 rounded-lg p-2.5 border border-border/50 flex items-center justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              'inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border rounded mb-1 truncate',
                              sBadge.bg
                            )}
                          >
                            {sBadge.label}
                          </span>
                          <p className="text-xs font-semibold text-foreground truncate" title={sc?.name ?? p.source_connection_id}>
                            {sc?.name ?? p.source_connection_id.slice(0, 10)}
                          </p>
                          {p.source_schema && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate">{p.source_schema}</p>
                          )}
                        </div>

                        <div className="px-1 text-primary/70 shrink-0">
                          <ArrowRight className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 text-right">
                          <span
                            className={cn(
                              'inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border rounded mb-1 truncate',
                              tBadge.bg
                            )}
                          >
                            {tBadge.label}
                          </span>
                          <p className="text-xs font-semibold text-foreground truncate" title={tc?.name ?? p.target_connection_id}>
                            {tc?.name ?? p.target_connection_id.slice(0, 10)}
                          </p>
                          {p.target_schema && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate">{p.target_schema}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer Info: Mode, Table count, Last run */}
                    <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                          {p.mode === 'full' ? 'Full Sync' : 'Incremental'}
                        </span>
                        <span className="font-medium">
                          {p.tables.length} table{p.tables.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {lastRun && (
                        <div className="text-[10px] text-muted-foreground/80 flex items-center justify-between font-mono pt-0.5">
                          <span>
                            {lastRun.completed_at ? timeAgo(lastRun.completed_at) : timeAgo(lastRun.started_at ?? '')}
                          </span>
                          <span>
                            {lastRun.processed_rows.toLocaleString()} rows
                            {lastRun.error_count > 0 && (
                              <span className="text-destructive ml-1">({lastRun.error_count} err)</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Animated bottom bar during sync */}
                    {busy && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary overflow-hidden">
                        <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border rounded-xl bg-muted/10">
              <GitBranch className="w-12 h-12 mb-4 opacity-30 text-primary" />
              <h3 className="text-base font-semibold text-foreground mb-1">
                {searchQuery || statusFilter !== 'all' ? 'No matching sync pipelines' : 'No sync pipelines configured'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Create a sync pipeline to replicate and synchronize tables across different database engines.'}
              </p>
              {searchQuery || statusFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                  }}
                  className="mt-4 text-xs text-primary underline"
                >
                  Clear filters
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  className="mt-6 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md hover:brightness-110 shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" /> New Sync
                </button>
              )}
            </div>
          )}
        </div>

        {/* Master Detail Side Panel */}
        {selectedPipeline && (
          <div className="w-full lg:w-1/2 space-y-4 bg-card/80 border border-border/80 rounded-xl p-5 shadow-lg backdrop-blur-sm sticky top-6">
            {/* Master Detail Header */}
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black tracking-tight text-foreground truncate">
                    {selectedPipeline.name}
                  </h2>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border rounded-md',
                      STATUS_CONFIG[selectedPipeline.status].color
                    )}
                  >
                    {STATUS_CONFIG[selectedPipeline.status].label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {selectedPipeline.tables.length} table{selectedPipeline.tables.length !== 1 ? 's' : ''} mapped ·{' '}
                  {selectedPipeline.mode === 'full' ? 'Full Sync' : 'Incremental'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isExecuting(selectedPipeline.id) ? (
                  <button
                    onClick={() => handlePause(selectedPipeline.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 text-xs font-bold transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                ) : (
                  <button
                    onClick={() => handleStart(selectedPipeline)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:brightness-110 text-xs font-bold shadow-sm transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Run Sync
                  </button>
                )}

                <button
                  onClick={() => handleEdit(selectedPipeline)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Edit Pipeline"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSelectedPipeline(null)
                    setActiveRun(null)
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Close Detail"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex gap-1 border-b border-border/60 pb-1">
              {[
                { id: 'history' as DetailTab, icon: History, label: 'History' },
                { id: 'progress' as DetailTab, icon: BarChart3, label: 'Live Progress' },
                { id: 'logs' as DetailTab, icon: ScrollText, label: 'Logs' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all',
                    detailTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            {detailTab === 'progress' &&
              (activeRun ? (
                <SyncProgress
                  key={activeRun?.id ?? 'none'}
                  run={activeRun}
                  progress={progressState}
                  logs={progressLogs}
                  onProgressChange={setProgressState}
                  onLogsChange={setProgressLogs}
                />
              ) : (
                <div className="border border-border/60 rounded-lg bg-muted/20 p-8 text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">
                    No active run currently in progress. Start a new sync or select a run from history.
                  </p>
                </div>
              ))}

            {detailTab === 'logs' &&
              (activeRun ? (
                <SyncLogViewer runId={activeRun.id} />
              ) : (
                <div className="border border-border/60 rounded-lg bg-muted/20 p-8 text-center">
                  <ScrollText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Select a run from the history tab to inspect its logs.
                  </p>
                </div>
              ))}

            {detailTab === 'history' && (
              <SyncHistory
                pipelineId={selectedPipeline.id}
                activeRunId={activeRun?.id}
                onSelectRun={(run) => {
                  setActiveRun(run)
                  setDetailTab('progress')
                }}
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
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border px-4 py-2.5 shadow-xl rounded-lg hover:bg-muted/50 transition-colors"
        >
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {editingPipeline ? 'Edit' : 'New'} Sync
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            Minimized
          </span>
        </button>
      )}
    </div>
  )
}
