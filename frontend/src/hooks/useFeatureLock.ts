import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS, MISSIONS } from '@/lib/gamification'

export function useFeatureLock(perkId: string) {
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const completedMissions = useGamificationStore((s) => s.completedMissions)
  const isUnlocked = unlockedPerks.includes(perkId)
  const perk = APP_PERKS.find((p) => p.id === perkId)
  const missingQuests = (perk?.requiredQuests ?? [])
    .map(qId => MISSIONS.find(m => m.id === qId))
    .filter(Boolean)
    .filter(m => !completedMissions.includes(m!.id))

  return {
    isUnlocked,
    isLocked: !isUnlocked,
    perk,
    missingQuests,
  }
}
