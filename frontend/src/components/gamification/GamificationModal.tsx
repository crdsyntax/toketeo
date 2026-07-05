import React, { useState, useEffect, useRef } from 'react';
import { useGamificationStore } from '@/store/gamificationStore';
import { getXPForNextLevel, getThematicLevelName, MISSIONS, APP_PERKS } from '@/lib/gamification';
import { 
  X, Trophy, Flame, CheckCircle2, CircleDashed, Lock, Unlock, 
  Swords, Crosshair, Wand2, Zap, Skull, Hammer, Wrench, Anvil, 
  Pickaxe, Sparkles, Map, Compass, Castle, ScrollText, BookOpen, 
  Backpack, Gem, Sunrise, Hourglass, CalendarClock, Crown,
  Palette, Bot, LineChart, Clock, Network, GitBranch, Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardPixelArt } from './WizardPixelArt';
import { SOUL_ITEMS } from './assets/objects';
import { useDraggableList } from '@/hooks/useDraggableList';
import { characterService } from '@/services/character.service';

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
  Palette, Bot, LineChart, Clock, Network, GitBranch,
};

export function GamificationModal({ isOpen, onClose }: GamificationModalProps) {
  const { level, xp, streak, progress, completedMissions, unlockedPerks } = useGamificationStore();
  const [activeTab, setActiveTab] = useState<'quests' | 'perks'>('quests');
  const [showSoulSlots, setShowSoulSlots] = useState(false);
  const [showCharacterEditor, setShowCharacterEditor] = useState(false);
  const [characterName, setCharacterName] = useState('Unnamed Hero');
  const [characterLore, setCharacterLore] = useState('');
  const [characterLoading, setCharacterLoading] = useState(true);
  const savedRef = useRef(true);

  const {
    items: soulItems,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    isDragging,
    setItems: setSoulItems,
  } = useDraggableList(SOUL_ITEMS);
  
  useEffect(() => {
    characterService.get().then((char) => {
      setCharacterName(char.name);
      setCharacterLore(char.lore);
      if (char.slotOrder && char.slotOrder !== '[]') {
        try {
          const order = JSON.parse(char.slotOrder) as string[];
          const reordered = order
            .map((id) => SOUL_ITEMS.find((item) => item.id === id))
            .filter(Boolean) as typeof SOUL_ITEMS;
          if (reordered.length === SOUL_ITEMS.length) {
            setSoulItems(reordered);
          }
        } catch {}
      }
    }).finally(() => setCharacterLoading(false));
  }, []);

  useEffect(() => {
    if (characterLoading) return;
    const timer = setTimeout(() => {
      savedRef.current = false;
      characterService.save({
        id: 'default',
        name: characterName,
        lore: characterLore,
        slotOrder: JSON.stringify(soulItems.map((item) => item.id)),
      }).then(() => { savedRef.current = true; }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [soulItems, characterName, characterLore, characterLoading]);

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
            <button
              onClick={() => setShowCharacterEditor(true)}
              className="relative group shrink-0"
              title="Edit character"
            >
              <WizardPixelArt />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/30 transition-colors">
                <Pencil className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>

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
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black mb-1">{getThematicLevelName(level)}</h2>
              
              {characterName && characterName !== 'Unnamed Hero' && (
                <p className="text-sm font-semibold text-foreground/90 truncate">{characterName}</p>
              )}
              {characterLore && (
                <p className="text-[11px] text-muted-foreground/70 line-clamp-2">{characterLore}</p>
              )}
              
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 mt-2">
                <span>{progressPercentage.toFixed(0)}% to Level {level + 1}</span>
                <span className="text-muted-foreground/30">·</span>
                <span>{xpInLevel} / {xpNeeded} XP</span>
              </div>
              
              <div className="flex items-center gap-4 mt-3">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/10 px-6 py-3">
          <div className="flex items-center">
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

          <button
            onClick={() => setShowSoulSlots((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200 transition-all hover:border-amber-400/60 hover:bg-amber-500/20"
          >
            <Skull className="h-3.5 w-3.5" />
            Soul Slots
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          {showSoulSlots && (
            <div className="mb-4 rounded-2xl border border-amber-500/20 bg-[radial-gradient(circle_at_top,_rgba(255,193,7,0.16),_transparent_65%)] p-4 shadow-[0_0_24px_rgba(0,0,0,0.35)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-300/80">Dark Soul Cache</p>
                  <h3 className="text-sm font-bold text-amber-100">Five sacred slots</h3>
                </div>
                <div className="rounded-full border border-amber-500/20 bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">
                  Ascended
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {soulItems.map((asset, index) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragOver={handleDragOver(index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border bg-gradient-to-br from-stone-900 via-zinc-950 to-black shadow-[inset_0_0_18px_rgba(255,255,255,0.04)] transition-all",
                      isDragging(index)
                        ? "border-amber-300/70 opacity-60 scale-95 shadow-[0_0_20px_rgba(255,193,7,0.3)]"
                        : "border-amber-500/25 hover:border-amber-400/50"
                    )}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_rgba(255,193,7,0.18),_transparent_40%)]" />
                    <div className="absolute inset-[1px] rounded-[10px] border border-amber-500/10" />
                    <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-[linear-gradient(135deg,_rgba(255,193,7,0.22),_rgba(0,0,0,0.75))] shadow-[0_0_16px_rgba(255,193,7,0.18)]">
                        <div className="flex flex-col items-center justify-center">
                          {asset.pixels.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex leading-none">
                              {row.split('').map((cell, colIndex) => (
                                <div
                                  key={colIndex}
                                  className="w-[2px] h-[2px] shrink-0"
                                  style={cell === '.' ? {} : { backgroundColor: asset.palette[cell] || '#fbbf24' }}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/90">
                        {asset.name.split(' ')[0]}
                      </span>
                      <span className="text-[9px] text-muted-foreground/70">{index === 2 ? 'Active' : 'Locked'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
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

      {showCharacterEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-[420px] max-w-[90vw] rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black">Character Editor</h3>
              <button
                onClick={() => setShowCharacterEditor(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">
                  Name
                </label>
                <input
                  value={characterName === 'Unnamed Hero' ? '' : characterName}
                  onChange={(e) => setCharacterName(e.target.value || 'Unnamed Hero')}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40"
                  placeholder="Your character's name..."
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">
                  Lore
                </label>
                <textarea
                  value={characterLore}
                  onChange={(e) => setCharacterLore(e.target.value)}
                  rows={4}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors resize-none placeholder:text-muted-foreground/40"
                  placeholder="Write a brief lore for your character..."
                />
              </div>

              <button
                onClick={() => setShowCharacterEditor(false)}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
