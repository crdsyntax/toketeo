import React from 'react';
import { useGamificationStore } from '@/store/gamificationStore';
import { getXPForNextLevel, getThematicLevelName } from '@/lib/gamification';
import { cn } from '@/lib/utils';
import { Trophy, Flame } from 'lucide-react';
import { WizardPixelArt } from './WizardPixelArt';

interface LevelBadgeProps {
  className?: string;
  onClick?: () => void;
  collapsed?: boolean;
  hideWizard?: boolean;
}

export function LevelBadge({ className, onClick, collapsed, hideWizard }: LevelBadgeProps) {
  const { level, xp, streak } = useGamificationStore();
  
  const xpForNext = getXPForNextLevel(level);
  const xpForCurrent = level === 1 ? 0 : getXPForNextLevel(level - 1);
  const xpInLevel = xp - xpForCurrent;
  const xpNeeded = xpForNext - xpForCurrent;
  const progressPercentage = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));

  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
      title={`Level ${level} - ${xp} XP (${streak} day streak)`}
    >
      <div className="flex items-center gap-2">
        {!hideWizard && <WizardPixelArt />}
        <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <defs>
              <linearGradient id="level-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-hover)" />
              </linearGradient>
            </defs>
            <circle
              cx="20"
              cy="20"
              r="18"
              className="stroke-muted/30 fill-none"
              strokeWidth="3"
            />
            <circle
              cx="20"
              cy="20"
              r="18"
              fill="none"
              strokeWidth="3"
              stroke="url(#level-ring-grad)"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={2 * Math.PI * 18 * (1 - progressPercentage / 100)}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <span className="text-xs font-bold text-accent">{level}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="ml-3 flex flex-col justify-center min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground truncate">Lvl {level} {getThematicLevelName(level)}</span>
            {streak > 1 && (
              <span className="flex items-center text-[var(--ch-text-10)] text-orange-500 font-bold" title={`${streak} days streak`}>
                <Flame className="w-3 h-3 mr-0.5" />
                {streak}
              </span>
            )}
          </div>
          <div className="flex items-center text-[var(--ch-text-10)] text-muted-foreground mt-0.5">
            <Trophy className="w-3 h-3 mr-1 text-yellow-500" />
            <span className="truncate">{progressPercentage.toFixed(2)}% to Level {level + 1}</span>
          </div>
        </div>
      )}
    </div>
  );
}
