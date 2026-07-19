import { create } from 'zustand'
import { schedulerService } from '@/services/scheduler.service'
import type { ScheduledJob, CreateScheduledJobDto, UpdateScheduledJobDto, JobCompletedPayload, JobProgressPayload } from '@/types/database'

export interface RunningJob {
  jobId: string
  jobName: string
  currentTable: string
  tableIndex: number
  totalTables: number
}

interface SchedulerState {
  jobs: ScheduledJob[]
  loading: boolean
  error: string | null
  lastCompleted: JobCompletedPayload | null
  runningJobs: Record<string, RunningJob>
  fetchJobs: () => Promise<void>
  createJob: (dto: CreateScheduledJobDto) => Promise<void>
  updateJob: (id: string, dto: UpdateScheduledJobDto) => Promise<void>
  deleteJob: (id: string) => Promise<void>
  runJobNow: (id: string) => Promise<void>
  stopJobNow: (id: string) => Promise<void>
  setLastCompleted: (payload: JobCompletedPayload | null) => void
  setJobStarted: (jobId: string, jobName: string) => void
  setJobProgress: (payload: JobProgressPayload) => void
  clearRunningJob: (jobId: string) => void
}

export const useSchedulerStore = create<SchedulerState>()((set, get) => ({
  jobs: [],
  loading: false,
  error: null,
  lastCompleted: null,
  runningJobs: {},

  fetchJobs: async () => {
    set({ loading: true, error: null })
    try {
      const jobs = await schedulerService.getAll()
      set({ jobs, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createJob: async (dto) => {
    set({ loading: true, error: null })
    try {
      const job = await schedulerService.create(dto)
      set({ jobs: [...get().jobs, job], loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
      throw e
    }
  },

  updateJob: async (id, dto) => {
    set({ loading: true, error: null })
    try {
      const updated = await schedulerService.update(id, dto)
      set({
        jobs: get().jobs.map((j) => (j.id === id ? updated : j)),
        loading: false,
      })
    } catch (e) {
      set({ error: String(e), loading: false })
      throw e
    }
  },

  deleteJob: async (id) => {
    set({ loading: true, error: null })
    try {
      await schedulerService.delete(id)
      set({ jobs: get().jobs.filter((j) => (j.id !== id)), loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  runJobNow: async (id) => {
    await schedulerService.runNow(id)
  },

  stopJobNow: async (id) => {
    await schedulerService.stopNow(id)
  },

  setLastCompleted: (payload) => set({ lastCompleted: payload }),

  setJobStarted: (jobId, jobName) => set((state) => ({
    runningJobs: {
      ...state.runningJobs,
      [jobId]: { jobId, jobName, currentTable: '', tableIndex: 0, totalTables: 0 },
    },
  })),

  setJobProgress: (payload) => set((state) => ({
    runningJobs: {
      ...state.runningJobs,
      [payload.jobId]: {
        jobId: payload.jobId,
        jobName: payload.jobName,
        currentTable: payload.currentTable,
        tableIndex: payload.tableIndex,
        totalTables: payload.totalTables,
      },
    },
  })),

  clearRunningJob: (jobId) => set((state) => {
    const { [jobId]: _, ...rest } = state.runningJobs
    return { runningJobs: rest }
  }),
}))
