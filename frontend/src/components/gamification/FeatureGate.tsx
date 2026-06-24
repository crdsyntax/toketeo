import { Lock, Trophy } from 'lucide-react'
import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS, MISSIONS } from '@/lib/gamification'
import { cn } from '@/lib/utils'

interface FeatureGateProps {
  perkId: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showLocked?: boolean
}

export function FeatureGate({ perkId, children, fallback, showLocked = true }: FeatureGateProps) {
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const completedMissions = useGamificationStore((s) => s.completedMissions)
  const isUnlocked = unlockedPerks.includes(perkId)
  const perk = APP_PERKS.find((p) => p.id === perkId)

  if (isUnlocked) return <>{children}</>

  if (!showLocked) return null

  if (fallback) return <>{fallback}</>

  const missingQuests = (perk?.requiredQuests ?? [])
    .map(qId => MISSIONS.find(m => m.id === qId))
    .filter(Boolean)
    .filter(m => !completedMissions.includes(m!.id))

  return (
    <div className="relative group">
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[1px] rounded-lg">
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{perk?.title ?? 'Feature Locked'}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Level {perk?.requiredLevel ?? '?'} required
            </p>
            {missingQuests.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {missingQuests.map(m => (
                  <p key={m!.id} className="text-[9px] text-muted-foreground/40 flex items-center gap-1 justify-center">
                    <Trophy className="w-2.5 h-2.5" />
                    Complete "{m!.title}"
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={cn('pointer-events-none select-none opacity-30')}>
        {children}
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
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
    requiredLevel: perk?.requiredLevel ?? 0,
    requiredQuests: perk?.requiredQuests ?? [],
    missingQuests: missingQuests.map(m => m!.id),
  }
}
