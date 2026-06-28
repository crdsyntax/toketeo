import { useState, useEffect, useCallback } from 'react'
import { X, Clock, Database, FileDown, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobType, DatabaseType } from '@/types/database'
import type { ScheduledJob, CreateScheduledJobDto } from '@/types/database'
import { connectionService } from '@/services/connection.service'
import { schedulerService } from '@/services/scheduler.service'
import type { Connection } from '@/types/database'

interface JobFormModalProps {
  job?: ScheduledJob | null
  onClose: () => void
  onSave: (dto: CreateScheduledJobDto) => void
  saving?: boolean
}

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 8 AM', value: '0 8 * * *' },
  { label: 'Weekly (Mon 6 AM)', value: '0 6 * * 1' },
  { label: 'Monthly (1st 3 AM)', value: '0 3 1 * *' },
]

const JOB_TYPES = [
  { type: JobType.Backup, label: 'Database Backup', icon: FileDown, desc: 'Full or partial schema/data dump' },
  { type: JobType.Report, label: 'Report (JSON)', icon: FileJson, desc: 'Run a query and save results as JSON' },
  { type: JobType.CsvExport, label: 'CSV Export', icon: FileSpreadsheet, desc: 'Run a query and save results as CSV' },
]

export function JobFormModal({ job, onClose, onSave, saving }: JobFormModalProps) {
  const [name, setName] = useState(job?.name ?? '')
  const [connectionId, setConnectionId] = useState(job?.connectionId ?? '')
  const [jobType, setJobType] = useState(job?.jobType ?? JobType.Backup)
  const [cronExpression, setCronExpression] = useState(job?.cronExpression ?? '')
  const [query, setQuery] = useState((job?.config?.query as string) ?? '')
  const [outputDir, setOutputDir] = useState((job?.config?.outputDir as string) ?? '/tmp')
  const [connections, setConnections] = useState<Connection[]>([])

  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState((job?.config?.database as string) ?? '')
  const [tables, setTables] = useState<string[]>([])
  const [selectedTables, setSelectedTables] = useState<Set<string>>(
    new Set((job?.config?.tables as string[]) ?? [])
  )
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [loadingTables, setLoadingTables] = useState(false)

  useEffect(() => {
    connectionService.getAll().then(setConnections).catch(() => {})
  }, [])

  const isBackup = jobType === JobType.Backup

  useEffect(() => {
    if (!isBackup || !connectionId) {
      setDatabases([])
      setSelectedDatabase('')
      setTables([])
      setSelectedTables(new Set())
      return
    }
    setLoadingDbs(true)
    schedulerService.getDatabases(connectionId)
      .then((dbs) => {
        setDatabases(dbs)
        if (dbs.length > 0 && !job) {
          setSelectedDatabase(dbs[0])
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDbs(false))
  }, [connectionId, isBackup, job])

  useEffect(() => {
    if (!isBackup || !connectionId || !selectedDatabase) {
      setTables([])
      setSelectedTables(new Set())
      return
    }
    setLoadingTables(true)
    schedulerService.getTables(connectionId, selectedDatabase)
      .then((tbls) => {
        setTables(tbls)
        if (!job) {
          setSelectedTables(new Set(tbls))
        } else {
          const existing = new Set((job?.config?.tables as string[]) ?? [])
          setSelectedTables(new Set(tbls.filter((t) => existing.has(t))))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTables(false))
  }, [connectionId, selectedDatabase, isBackup, job])

  const toggleTable = useCallback((table: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedTables.size === tables.length) {
      setSelectedTables(new Set())
    } else {
      setSelectedTables(new Set(tables))
    }
  }, [tables, selectedTables])

  const handleSave = () => {
    const config: Record<string, unknown> = { outputDir }
    if (isBackup) {
      config.database = selectedDatabase
      config.tables = Array.from(selectedTables)
    } else {
      config.query = query
    }
    onSave({ name, connectionId, jobType, cronExpression, config })
  }

  const canSave = name && connectionId && cronExpression && (isBackup || query)

  const selectedConn = connections.find((c) => c.id === connectionId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-bold text-foreground">{job ? 'Edit Job' : 'New Job'}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 space-y-4 pb-5">
          {/* Name */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40"
              placeholder="My Scheduled Job"
            />
          </div>

          {/* Connection */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Database className="w-3 h-3" /> Connection
            </label>
            <div className="relative mt-1">
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground appearance-none cursor-pointer pr-8"
              >
                <option value="">Select connection...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          {/* Job Type */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Job Type</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {JOB_TYPES.map((jt) => {
                const Icon = jt.icon
                const active = jobType === jt.type
                return (
                  <button
                    key={jt.type}
                    onClick={() => setJobType(jt.type)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all',
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[9px] font-semibold leading-tight">{jt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Database (Backup only) */}
          {isBackup && connectionId && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Database
              </label>
              {loadingDbs ? (
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading databases...
                </div>
              ) : databases.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">No databases found</p>
              ) : (
                <select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  {databases.map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Tables / Collections (Backup only) */}
          {isBackup && selectedDatabase && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {selectedConn?.type === DatabaseType.MONGODB ? 'Collections' : 'Tables'}
                </label>
                {tables.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-[9px] font-semibold uppercase tracking-wider text-primary hover:underline"
                  >
                    {selectedTables.size === tables.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
              {loadingTables ? (
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </div>
              ) : tables.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">No tables found</p>
              ) : (
                <div className="mt-1 max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {tables.map((table) => (
                    <label
                      key={table}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTables.has(table)}
                        onChange={() => toggleTable(table)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground truncate">{table}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cron Expression */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Cron Expression
            </label>
            <input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm font-mono bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40"
              placeholder="0 8 * * *"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setCronExpression(p.value)}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-medium rounded-md border transition-colors',
                    cronExpression === p.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Query (for Report / CSV) */}
          {!isBackup && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SQL Query</label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 text-sm font-mono bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40 resize-none"
                placeholder="SELECT * FROM ..."
              />
            </div>
          )}

          {/* Output Directory */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Output Directory</label>
            <input
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm font-mono bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40"
              placeholder="/tmp"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={cn(
              'px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all',
              canSave && !saving
                ? 'bg-primary text-primary-foreground hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {saving ? 'Saving...' : job ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}