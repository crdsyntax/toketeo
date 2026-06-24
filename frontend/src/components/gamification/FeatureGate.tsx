import { Lock } from 'lucide-react'
import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS } from '@/lib/gamification'
import { cn } from '@/lib/utils'

interface FeatureGateProps {
  perkId: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showLocked?: boolean
}

export function FeatureGate({ perkId, children, fallback, showLocked = true }: FeatureGateProps) {
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const isUnlocked = unlockedPerks.includes(perkId)
  const perk = APP_PERKS.find((p) => p.id === perkId)

  if (isUnlocked) return <>{children}</>

  if (!showLocked) return null

  if (fallback) return <>{fallback}</>

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
              Unlock at Level {perk?.requiredLevel ?? '?'}
            </p>
          </div>
        </div>
      </div>
      <div className={cn('pointer-events-none select-none opacity-30')}>
        {children}
      </div>
    </div>
  )
}

export function useFeatureLock(perkId: string) {
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const isUnlocked = unlockedPerks.includes(perkId)
  const perk = APP_PERKS.find((p) => p.id === perkId)
  return { isUnlocked, requiredLevel: perk?.requiredLevel ?? 0 }
}
