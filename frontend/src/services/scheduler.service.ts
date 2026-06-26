import { tauriApi } from '@/lib/api'
import type { ScheduledJob, CreateScheduledJobDto, UpdateScheduledJobDto } from '@/types/database'

export const schedulerService = {
  getAll: async (): Promise<ScheduledJob[]> => {
    return await tauriApi.invoke<ScheduledJob[]>('get_scheduled_jobs')
  },

  create: async (dto: CreateScheduledJobDto): Promise<ScheduledJob> => {
    return await tauriApi.invoke<ScheduledJob>('create_scheduled_job', {
      name: dto.name,
      connectionId: dto.connectionId,
      jobType: dto.jobType,
      cronExpression: dto.cronExpression,
      config: dto.config,
    })
  },

  update: async (id: string, dto: UpdateScheduledJobDto): Promise<ScheduledJob> => {
    return await tauriApi.invoke<ScheduledJob>('update_scheduled_job', { id, ...dto })
  },

  delete: async (id: string): Promise<void> => {
    await tauriApi.invoke('delete_scheduled_job', { id })
  },

  runNow: async (id: string): Promise<void> => {
    await tauriApi.invoke('run_job_now', { id })
  },
}
