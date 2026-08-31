import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import { connectionService } from '@/services/connection.service'
import { monitorService, type InnoDbSection, type ProcessEntry, type InnoDbStatus } from '@/services/monitor.service'
import { DatabaseType, type Connection } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'react-hot-toast'
import {
  Activity, AlertTriangle, Check, Copy, Database, Gauge, Loader2, Plug,
  RefreshCw, ShieldAlert, ShieldCheck, Skull, Terminal, XCircle,
  ChevronDown,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'

type MonitorTab = 'process' | 'slow' | 'innodb'

const SLOW_THRESHOLD = 5
const REFRESH_MS = 3000

function supportsMonitoring(conn?: Connection | null): boolean {
  return (
    conn?.type === DatabaseType.MARIADB ||
    conn?.type === DatabaseType.MYSQL ||
    conn?.type === DatabaseType.POSTGRES
  )
}

function fmtTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}s`
}

function KillButton({ conn, entry, onDone }: {
  conn: Connection
  entry: ProcessEntry
  onDone: () => void
}) {
  const setMiniToast = useAppStore((s) => s.setMiniToast)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const id = String(entry.ID)
  const isProduction = conn.environment?.toLowerCase() === 'production'

  const handleKill = useCallback(async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      const msg = await monitorService.killProcess(conn.id, id)
      setMiniToast(`kill-${id}`, { type: 'success', text: msg })
      onDone()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Kill failed'
      setMiniToast(`kill-${id}`, { type: 'error', text: message })
    } finally {
      setConfirming(false)
      setBusy(false)
    }
  }, [confirming, conn.id, id, onDone, setMiniToast])

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleKill() }}
      disabled={busy}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50',
        confirming
          ? 'bg-destructive text-white hover:bg-destructive/90'
          : 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive hover:text-white'
      )}
      title={confirming ? 'Click again to confirm kill' : 'Kill process'}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
      {confirming ? (isProduction ? 'Confirm kill' : 'Confirm') : 'Kill'}
    </button>
  )
}

function ProcessTable({ conn, entries, onKill }: {
  conn: Connection
  entries: ProcessEntry[]
  onKill: () => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
        <Activity className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No active queries</p>
        <p className="text-xs text-muted-foreground/70">All connections are idle</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto border border-border rounded-md bg-surface shadow-sm">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b border-border">
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">ID</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">User</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">DB</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Command</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Time</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">State</th>
            <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground">Query</th>
            <th className="px-3 py-2.5 w-20 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((row, idx) => {
            const timeNum = Number(row.TIME ?? 0)
            const isSlow = timeNum > SLOW_THRESHOLD
            return (
              <tr key={`${String(row.ID)}-${idx}`} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{String(row.ID)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{row.USER ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{row.DB ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="text-[var(--ch-text-9)] font-bold uppercase text-xs px-1.5 py-0.5 rounded border border-border bg-muted">
                    {row.COMMAND ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={cn(
                    'font-mono text-xs font-semibold px-1.5 py-0.5 rounded',
                    isSlow ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10'
                  )}>
                    {fmtTime(row.TIME)}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{row.STATE ?? '—'}</td>
                <td className="px-3 py-2 min-w-0">
                  <code className="text-[var(--ch-text-10)] font-mono bg-muted px-1.5 py-0.5 rounded block truncate text-xs">
                    {row.INFO?.trim() || '(empty)'}
                  </code>
                </td>
                <td className="px-3 py-2 text-right">
                  <KillButton conn={conn} entry={row} onDone={onKill} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}



function isSectionHeader(line: string, next: string | undefined): boolean {
  const t = line.trim()
  if (!t || /[a-z]/.test(t)) return false
  const nt = next?.trim() ?? ''
  return nt !== '' && nt.split('').every((c) => c === '-')
}


function highlightLine(line: string) {
  return line.split(/(LOCK WAIT|DEADLOCK|ACTIVE)/g).map((part, i) => {
    if (part === 'LOCK WAIT' || part === 'DEADLOCK') {
      return <span key={i} className="text-red-500 font-bold">{part}</span>
    }
    if (part === 'ACTIVE') {
      return <span key={i} className="text-amber-500 font-bold">{part}</span>
    }
    return part
  })
}


function InnodbRawViewer({ sections }: { sections: InnoDbSection[] }) {
  const [copied, setCopied] = useState(false)
  const [activeName, setActiveName] = useState<string | null>(null)

  const active = useMemo(() => {
    if (sections.length === 0) return null
    return (
      sections.find((s) => s.name === activeName) ??
      sections.find((s) => s.name === 'TRANSACTIONS') ??
      sections[0]
    )
  }, [sections, activeName])

  const copy = useCallback(async () => {
    if (!active) return
    try {
      await navigator.clipboard.writeText(active.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {

    }
  }, [active])

  if (!active) {
    return (
      <div className="px-3 py-4 rounded-md border border-border bg-surface shadow-sm text-xs text-muted-foreground">
        No engine status returned.
      </div>
    )
  }

  const lines = active.content.split('\n')

  return (
    <div className="shrink-0 overflow-hidden border border-border rounded-md bg-surface shadow-sm flex flex-col">

      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <span className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ml-1.5 truncate text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">
          SHOW ENGINE INNODB STATUS
        </span>
        <button
          onClick={copy}
          title="Copy section to clipboard"
          className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>


      {sections.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-border bg-muted/20">
          {sections.map((s) => (
            <button
              key={s.name}
              onClick={() => setActiveName(s.name)}
              className={cn(
                'px-2 py-1 rounded text-[var(--ch-text-9)] font-mono text-[10px] uppercase tracking-wider transition-colors',
                active.name === s.name
                  ? 'bg-accent-muted text-accent font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}


      <div className="max-h-80 min-h-0 overflow-auto">
        <pre className="py-2 pr-3 text-[var(--ch-text-10)] font-mono text-xs leading-relaxed">
          {lines.map((line, i) => {
            const isHeader = isSectionHeader(line, lines[i + 1])
            return (
              <div key={i} className="flex">
                <span className="w-10 shrink-0 text-right pr-3 select-none text-muted-foreground/40">{i + 1}</span>
                <span className={cn('whitespace-pre', isHeader && 'text-accent font-bold')}>
                  {highlightLine(line) || '\u00A0'}
                </span>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}

function InnodbView({ status }: { status: InnoDbStatus | undefined }) {
  const [showRaw, setShowRaw] = useState(false)
  const sections = useMemo<InnoDbSection[]>(() => {
    if (!status) return []
    if (status.sections.length > 0) return status.sections
    return status.status ? [{ name: 'STATUS', content: status.status }] : []
  }, [status])
  if (!status) return null
  const { summary } = status

  const healthConfig = {
    ok: {
      icon: ShieldCheck,
      label: 'Healthy',
      color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
      bar: 'bg-emerald-500',
    },
    warning: {
      icon: AlertTriangle,
      label: 'Under pressure',
      color: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
      bar: 'bg-amber-500',
    },
    critical: {
      icon: Skull,
      label: 'Needs attention',
      color: 'border-red-500/40 bg-red-500/10 text-red-500',
      bar: 'bg-red-500',
    },
  }[summary.health]

  const HealthIcon = healthConfig.icon
  const levelStyles: Record<string, { dot: string; chip: string }> = {
    ok: { dot: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
    info: { dot: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
    warning: { dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    critical: { dot: 'bg-red-500', chip: 'bg-red-500/10 text-red-500 border-red-500/30' },
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-3 pr-1">

      <div className={cn('flex items-start gap-3 px-4 py-3 rounded-lg border', healthConfig.color)}>
        <HealthIcon className="w-6 h-6 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider">{healthConfig.label}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{summary.healthMessage}</p>
        </div>
      </div>


      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {summary.indicators.map((ind) => {
          const st = levelStyles[ind.level]
          return (
            <Tooltip key={ind.id} content={ind.hint} side="top">
              <div className="p-3 rounded-lg border border-border bg-surface shadow-sm cursor-help">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">
                    {ind.label}
                  </span>
                  <span className={cn('w-2 h-2 rounded-full', st.dot)} />
                </div>
                <p className={cn('text-2xl font-bold', ind.level !== 'ok' && st.chip && '')}>{ind.value}</p>
                <p className="text-[var(--ch-text-10)] text-muted-foreground mt-1 leading-snug">{ind.hint}</p>
              </div>
            </Tooltip>
          )
        })}
      </div>


      <div className="shrink-0">
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
          {showRaw ? 'Hide' : 'Show'} engine detail (for developers)
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showRaw && 'rotate-180')} />
        </button>
      </div>

      {showRaw && (
        <InnodbRawViewer sections={sections} />
      )}
    </div>
  )
}

export default function MonitorPage() {
  const queryClient = useQueryClient()
  const { activeConnection, setActiveConnection, setConnectedConnection, connectedConnectionIds } = useAppStore()
  const [selectedConnId, setSelectedConnId] = useState<string>('')
  const [tab, setTab] = useState<MonitorTab>('process')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [slowThreshold, setSlowThreshold] = useState(SLOW_THRESHOLD)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })


  const connId = selectedConnId || activeConnection?.id || connectedConnectionIds[0] || ''
  const conn = connections.find((c: Connection) => c.id === connId) || activeConnection || null

  const target = conn && supportsMonitoring(conn) ? conn : null

  const autoConnect = useCallback(async (c: Connection) => {
    if (connectedConnectionIds.includes(c.id)) return
    try {
      await connectionService.connect(c)
      setConnectedConnection(c.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to connect to database'
      console.error('[monitor] auto-connect failed:', e)
      useAppStore.getState().setConnectionError(c.id, message)
      toast.error(`Monitor: ${message}`)
    }
  }, [connectedConnectionIds, setConnectedConnection])

  useEffect(() => { if (conn && !connectedConnectionIds.includes(conn.id)) autoConnect(conn) }, [conn, connectedConnectionIds, autoConnect])

  const refetchInterval = autoRefresh && tab !== 'innodb' ? REFRESH_MS : false

  const processQuery = useQuery({
    queryKey: ['monitor-process', connId],
    queryFn: () => monitorService.processList(connId),
    enabled: !!target && !!connId,
    refetchInterval,
  })

  const slowQuery = useQuery({
    queryKey: ['monitor-slow', connId, slowThreshold],
    queryFn: () => monitorService.slowQueries(connId, slowThreshold),
    enabled: !!target && !!connId,
    refetchInterval,
  })

  const innodbQuery = useQuery({
    queryKey: ['monitor-innodb', connId],
    queryFn: () => monitorService.innodbStatus(connId),
    enabled: !!target && !!connId,
  })

  const activeEntries = tab === 'slow' ? slowQuery.data : processQuery.data
  const activeQuery = tab === 'slow' ? slowQuery : processQuery

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['monitor-process', connId] })
    queryClient.invalidateQueries({ queryKey: ['monitor-slow', connId, slowThreshold] })
    queryClient.invalidateQueries({ queryKey: ['monitor-innodb', connId] })
  }, [queryClient, connId, slowThreshold])

  const tabs: { key: MonitorTab; label: string; icon: typeof Activity }[] = useMemo(() => [
    { key: 'process', label: 'Process List', icon: Activity },
    { key: 'slow', label: `Slow Queries (>${slowThreshold}s)`, icon: AlertTriangle },
    { key: 'innodb', label: 'InnoDB Status', icon: Database },
  ], [slowThreshold])

  if (!conn) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Plug className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Connect to a database to start monitoring</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Supports MySQL, MariaDB and PostgreSQL</p>
      </div>
    )
  }

  if (!target) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <ShieldAlert className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Monitoring not supported for {conn.type}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Real-time query monitoring is available for MySQL, MariaDB and PostgreSQL</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex justify-between items-center shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Live Monitor
          </h1>
          <p className="text-sm text-muted-foreground">Active queries, slow queries and engine diagnostics in real time.</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={connId}
            onChange={(e) => {
              setSelectedConnId(e.target.value)
              const c = connections.find((x: Connection) => x.id === e.target.value)
              if (c) setActiveConnection(c)
            }}
            className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            {connections.map((c: Connection) => (
              <option key={c.id} value={c.id} disabled={!supportsMonitoring(c)}>
                {c.name} ({c.type}){connectedConnectionIds.includes(c.id) ? '' : ' — not connected'}
              </option>
            ))}
          </select>

          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
              autoRefresh
                ? 'bg-accent-muted text-accent border-accent/30'
                : 'border-border hover:bg-muted text-muted-foreground'
            )}
            title={autoRefresh ? 'Auto-refresh every 3s' : 'Auto-refresh off'}
          >
            <RefreshCw className={cn('w-4 h-4', autoRefresh && 'animate-[spin_4s_linear_infinite]')} />
            Auto
          </button>

          <button
            onClick={refresh}
            disabled={activeQuery.isFetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', activeQuery.isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {conn.environment?.toLowerCase() === 'production' && tab !== 'innodb' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-wider shrink-0">
          <Skull className="w-4 h-4" />
          Production — killing a query interrupts the application. Confirm each kill.
        </div>
      )}

      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg border border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'slow' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground font-medium">Min seconds</label>
            <input
              type="number"
              min={1}
              value={slowThreshold}
              onChange={(e) => setSlowThreshold(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 bg-muted border border-border rounded-md px-2 py-1 text-sm text-center focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        )}
      </div>

      {tab === 'innodb' ? (
        <InnodbView status={innodbQuery.data} />
      ) : (
        <ProcessTable
          conn={conn}
          entries={activeEntries ?? []}
          onKill={() => {
            refresh()
          }}
        />
      )}

      {activeQuery.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {activeQuery.isError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs shrink-0">
          <XCircle className="w-4 h-4" />
          {(activeQuery.error as Error)?.message ?? 'Failed to load queries'}
        </div>
      )}
    </div>
  )
}
