import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Plus, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { JobCard } from '@/components/scheduler/JobCard'
import { JobFormModal } from '@/components/scheduler/JobFormModal'
import { useSchedulerStore } from '@/store/schedulerStore'
import { connectionService } from '@/services/connection.service'
import type { ScheduledJob, CreateScheduledJobDto, JobCompletedPayload, JobStartedPayload, JobProgressPayload, JobAlertPayload, Connection } from '@/types/database'
import toast from 'react-hot-toast'
import { listen } from '@tauri-apps/api/event'

export function SchedulerPage() {
  const { jobs, loading, error, fetchJobs, createJob, updateJob, deleteJob, runJobNow, stopJobNow, setLastCompleted, setJobStarted, setJobProgress, setJobAlert, clearRunningJob, runningJobs } = useSchedulerStore()
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])

  useEffect(() => {
    fetchJobs()
    connectionService.getAll().then(setConnections).catch(() => {})
  }, [fetchJobs])

  useEffect(() => {
    const unlistenStarted = listen<JobStartedPayload>('scheduler:job-started', (event) => {
      setJobStarted(event.payload.jobId, event.payload.jobName)
    })

    const unlistenProgress = listen<JobProgressPayload>('scheduler:job-progress', (event) => {
      setJobProgress(event.payload)
    })

    const unlistenAlert = listen<JobAlertPayload>('scheduler:job-alert', (event) => {
      const p = event.payload
      if (p.level === 'warning') {
        toast.error(`${p.jobName}: ${p.message}`, { duration: 5000 })
      } else {
        toast.success(`${p.jobName}: ${p.message}`, { duration: 4000 })
      }
      setJobAlert(p)
    })

    const unlistenCompleted = listen<JobCompletedPayload>('scheduler:job-completed', (event) => {
      const p = event.payload
      setLastCompleted(p)
      clearRunningJob(p.jobId)
      if (p.status === 'success') {
        toast.success(`Job "${p.jobName}" completed`, { duration: 4000 })
      } else {
        toast.error(`Job "${p.jobName}" failed: ${p.error ?? 'Unknown error'}`, { duration: 6000 })
      }
      fetchJobs()
    })

    return () => {
      unlistenStarted.then((f) => f())
      unlistenProgress.then((f) => f())
      unlistenAlert.then((f) => f())
      unlistenCompleted.then((f) => f())
    }
  }, [fetchJobs, setLastCompleted, setJobStarted, setJobProgress, setJobAlert, clearRunningJob])

  const handleSave = useCallback(async (dto: CreateScheduledJobDto) => {
    setSaving(true)
    try {
      if (editingJob) {
        await updateJob(editingJob.id, {
          name: dto.name,
          cronExpression: dto.cronExpression,
          config: dto.config,
        })
        toast.success('Job updated')
      } else {
        await createJob(dto)
        toast.success('Job created')
      }
      setShowForm(false)
      setEditingJob(null)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }, [editingJob, createJob, updateJob])

  const handleEdit = useCallback((job: ScheduledJob) => {
    setEditingJob(job)
    setShowForm(true)
  }, [])

  const handleDelete = useCallback(async (job: ScheduledJob) => {
    if (!confirm(`Delete job "${job.name}"?`)) return
    try {
      await deleteJob(job.id)
      toast.success('Job deleted')
    } catch (e) {
      toast.error(String(e))
    }
  }, [deleteJob])

  const handleRunNow = useCallback(async (job: ScheduledJob) => {
    try {
      await runJobNow(job.id)
      toast.success(`"${job.name}" triggered`, { icon: '🚀' })
    } catch (e) {
      toast.error(String(e))
    }
  }, [runJobNow])

  const handleStopNow = useCallback(async (job: ScheduledJob) => {
    try {
      await stopJobNow(job.id)
      toast.success(`"${job.name}" stop requested`)
    } catch (e) {
      toast.error(String(e))
    }
  }, [stopJobNow])

  const handleToggleEnabled = useCallback(async (job: ScheduledJob) => {
    try {
      await updateJob(job.id, { enabled: !job.enabled })
      toast.success(job.enabled ? `Schedule de "${job.name}" desactivado` : `Schedule de "${job.name}" activado`)
    } catch (e) {
      toast.error(String(e))
    }
  }, [updateJob])

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" />
              Query Scheduler
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Schedule queries to run on a recurring basis</p>
          </div>
          <button
            onClick={fetchJobs}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        <FeatureGate perkId="query_scheduler">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? 's' : ''} scheduled</p>
            <button
              onClick={() => { setEditingJob(null); setShowForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--ch-text-10)] font-bold uppercase tracking-widest rounded-lg bg-primary text-primary-foreground hover:brightness-110 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              New Job
            </button>
          </div>

          {jobs.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border rounded-xl bg-muted/20">
              <CalendarClock className="w-12 h-12 mb-4 opacity-30" />
              <h3 className="text-base font-semibold text-foreground mb-1">No scheduled jobs yet</h3>
              <p className="text-sm max-w-md">
                Create your first backup, report, or CSV export schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  connections={connections}
                  runningJob={runningJobs[job.id] ?? null}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRunNow={handleRunNow}
                  onStopNow={handleStopNow}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </div>
          )}
        </FeatureGate>
      </div>

      {showForm && (
        <JobFormModal
          job={editingJob}
          onClose={() => { setShowForm(false); setEditingJob(null) }}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  )
}
