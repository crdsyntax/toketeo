import React, { useState } from 'react';
import { useGamificationStore } from '@/store/gamificationStore';
import { getXPForNextLevel, getThematicLevelName, MISSIONS, APP_PERKS } from '@/lib/gamification';
import { 
  X, Trophy, Flame, CheckCircle2, CircleDashed, Lock, Unlock, 
  Swords, Crosshair, Wand2, Zap, Skull, Hammer, Wrench, Anvil, 
  Pickaxe, Sparkles, Map, Compass, Castle, ScrollText, BookOpen, 
  Backpack, Gem, Sunrise, Hourglass, CalendarClock, Crown,
  Palette, Bot, LineChart, Clock, Network
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GamificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICONS: Record<string, React.ElementType> = {
  Swords, Crosshair, Wand2, Zap, Flame, Skull,
  Hammer, Wrench, Anvil, Pickaxe, Sparkles,
  Map, Compass, Castle,
  ScrollText, BookOpen, Backpack, Gem,
  Sunrise, Hourglass, CalendarClock, Crown,
  Palette, Bot, LineChart, Clock, Network,
};

export function GamificationModal({ isOpen, onClose }: GamificationModalProps) {
  const { level, xp, streak, progress, completedMissions, unlockedPerks } = useGamificationStore();
  const [activeTab, setActiveTab] = useState<'quests' | 'perks'>('quests');
  
  if (!isOpen) return null;

  const xpForNext = getXPForNextLevel(level);
  const xpForCurrent = level === 1 ? 0 : getXPForNextLevel(level - 1);
  const xpInLevel = xp - xpForCurrent;
  const xpNeeded = xpForNext - xpForCurrent;
  const progressPercentage = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-[600px] max-w-[90vw] max-h-[85vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-6">
            {/* Level Avatar */}
            <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="44" className="stroke-muted/30 fill-none" strokeWidth="6" />
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  className="stroke-primary fill-none transition-all duration-1000 ease-out"
                  strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={2 * Math.PI * 44 * (1 - progressPercentage / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-0.5">Level</span>
                <span className="text-3xl font-black text-primary leading-none block">{level}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1">
              <h2 className="text-2xl font-black mb-1">{getThematicLevelName(level)}</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Progress: {progressPercentage.toFixed(2)}% ({xpInLevel} / {xpNeeded} XP to Level {level + 1})
              </p>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-bold">{xp.toLocaleString()} Total XP</span>
                </div>
                <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20 text-orange-500">
                  <Flame className="w-4 h-4" />
                  <span className="text-sm font-bold">{streak} Day Streak</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted/10 px-6">
          <button
            onClick={() => setActiveTab('quests')}
            className={cn(
              "px-4 py-3 text-sm font-bold border-b-2 transition-colors",
              activeTab === 'quests' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Available Quests
          </button>
          <button
            onClick={() => setActiveTab('perks')}
            className={cn(
              "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
              activeTab === 'perks' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Unlockable Perks
            <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
              {unlockedPerks?.length || 0}/{APP_PERKS.length}
            </span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          
          {activeTab === 'quests' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              {MISSIONS.map((mission) => {
              const isCompleted = completedMissions.includes(mission.id);
              const currentProgress = Math.min(mission.targetCount, progress[mission.type] || 0);
              const Icon = ICONS[mission.icon] || Trophy;

              return (
                <div 
                  key={mission.id}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    isCompleted 
                      ? "bg-primary/5 border-primary/20 opacity-70" 
                      : "bg-card border-border hover:border-primary/50 shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    isCompleted ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={cn("font-bold truncate", isCompleted && "text-primary")}>
                        {mission.title}
                      </h4>
                      <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-md shrink-0">
                        +{mission.xpReward} XP
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 truncate">
                      {mission.description}
                    </p>
                    
                    {/* Progress Bar inside Mission */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full transition-all duration-500", isCompleted ? "bg-primary" : "bg-blue-500")}
                          style={{ width: `${(currentProgress / mission.targetCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground w-8 text-right shrink-0">
                        {currentProgress}/{mission.targetCount}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <CircleDashed className="w-6 h-6 text-muted-foreground/30" />
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}

          {activeTab === 'perks' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              {APP_PERKS.map((perk) => {
                const isUnlocked = unlockedPerks?.includes(perk.id);
                const Icon = ICONS[perk.icon] || Trophy;
                return (
                  <div 
                    key={perk.id}
                    className={cn(
                      "p-4 rounded-xl border transition-all",
                      isUnlocked 
                        ? "bg-card border-primary/30 shadow-sm" 
                        : "bg-muted/50 border-border/50 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                        isUnlocked ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground"
                      )}>
                        <Icon className="w-6 h-6" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={cn("font-bold truncate", isUnlocked ? "text-foreground" : "text-muted-foreground")}>
                            {perk.title}
                          </h4>
                          {!isUnlocked && (
                            <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Lvl {perk.requiredLevel}
                            </span>
                          )}
                          {isUnlocked && (
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              Unlocked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {perk.description}
                        </p>
                      </div>
                    </div>

                    {/* Required quests */}
                    {!isUnlocked && perk.requiredQuests.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">
                          Required Quests
                        </p>
                        {perk.requiredQuests.map(qId => {
                          const mission = MISSIONS.find(m => m.id === qId);
                          const done = completedMissions.includes(qId);
                          return (
                            <div key={qId} className="flex items-center gap-2">
                              {done ? (
                                <CheckCircle2 className="w-3 h-3 text-primary" />
                              ) : (
                                <CircleDashed className="w-3 h-3 text-muted-foreground/30" />
                              )}
                              <span className={cn(
                                "text-[10px]",
                                done ? "text-primary/80" : "text-muted-foreground/50"
                              )}>
                                {mission?.title ?? qId}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isUnlocked && (
                      <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        <span className="text-[10px] text-primary/80 font-medium">
                          All requirements met
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
