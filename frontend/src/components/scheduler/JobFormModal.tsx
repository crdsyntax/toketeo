import { useState, useEffect } from 'react'
import { X, Clock, Database, FileDown, FileJson, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobType } from '@/types/database'
import type { ScheduledJob, CreateScheduledJobDto } from '@/types/database'
import { connectionService } from '@/services/connection.service'
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

  useEffect(() => {
    connectionService.getAll().then(setConnections).catch(() => {})
  }, [])

  const handleSave = () => {
    const config: Record<string, unknown> = { outputDir }
    if (jobType !== JobType.Backup) {
      config.query = query
    }
    onSave({ name, connectionId, jobType, cronExpression, config })
  }

  const canSave = name && connectionId && cronExpression && (jobType === JobType.Backup || query)

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
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            >
              <option value="">Select connection...</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
          {jobType !== JobType.Backup && (
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
