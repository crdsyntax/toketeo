import type { MissionType } from '../lib/gamification'

export interface GamificationState {
  level: number
  xp: number
  streak: number
  lastLoginDate: string | null
  progress: Record<MissionType, number>
  completedMissions: string[]
  unlockedPerks: string[]
  executedQueryHashes: string[]
  addXP: (amount: number, reason?: string) => void
  trackAction: (type: MissionType, amount?: number) => void
  checkStreak: () => void
  isQueryFirstTime: (hash: string) => boolean
  markQueryExecuted: (hash: string) => void
}
