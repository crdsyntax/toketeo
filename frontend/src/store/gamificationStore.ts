import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  MISSIONS, 
  type MissionType, 
  calculateLevel, 
  GAMIFICATION_CONFIG, 
  APP_PERKS 
} from '../lib/gamification';
import toast from 'react-hot-toast';

function calculateUnlockedPerks(level: number, completedMissions: string[]): string[] {
  return APP_PERKS
    .filter(p => p.requiredLevel <= level && p.requiredQuests.every(q => completedMissions.includes(q)))
    .map(p => p.id);
}

interface GamificationState {
  level: number;
  xp: number;
  streak: number;
  lastLoginDate: string | null;
  
  // Progress tracking
  progress: Record<MissionType, number>;
  completedMissions: string[];
  unlockedPerks: string[];

  // Track already-executed queries (hash → first execution already rewarded)
  executedQueryHashes: string[];

  // Actions
  addXP: (amount: number, reason?: string) => void;
  trackAction: (type: MissionType, amount?: number) => void;
  checkStreak: () => void;
  isQueryFirstTime: (hash: string) => boolean;
  markQueryExecuted: (hash: string) => void;
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      level: 1,
      xp: 0,
      streak: 0,
      lastLoginDate: null,
      progress: {
        EXECUTE_QUERY: 0,
        EDIT_ROW: 0,
        CREATE_CONNECTION: 0,
        DAILY_LOGIN: 0,
        EXPORT_DATA: 0,
      },
      completedMissions: [],
      unlockedPerks: calculateUnlockedPerks(1, []),
      executedQueryHashes: [],

      addXP: (amount: number, reason?: string) => {
        void reason;
        const { xp, level, unlockedPerks, completedMissions } = get();
        const newXp = xp + amount;
        const newLevel = calculateLevel(newXp);
        
        if (newLevel > level) {
          toast.success(`🎉 Level Up! You reached Level ${newLevel}!`, { 
            duration: 5000, 
            position: 'bottom-right',
            style: { background: '#10b981', color: '#fff' }
          });
        }

        const newUnlockedPerks = calculateUnlockedPerks(newLevel, completedMissions);
        const freshlyUnlocked = newUnlockedPerks.filter(p => !unlockedPerks.includes(p));

        freshlyUnlocked.forEach(perkId => {
          const perk = APP_PERKS.find(p => p.id === perkId);
          if (perk) {
            toast.success(`🔓 Feature Unlocked: ${perk.title}\n${perk.description}`, {
              duration: 6000,
              position: 'bottom-right',
              style: { background: '#8b5cf6', color: '#fff', fontWeight: 'bold', padding: '16px', borderRadius: '12px' },
              icon: '✨'
            });
          }
        });

        set({ xp: newXp, level: newLevel, unlockedPerks: newUnlockedPerks });
      },

      trackAction: (type: MissionType, amount: number = 1) => {
        const { progress, completedMissions, level, unlockedPerks, addXP } = get();
        const currentProgress = progress[type] || 0;
        const newProgress = currentProgress + amount;

        const newlyCompleted = MISSIONS.filter(
          m => m.type === type && 
               !completedMissions.includes(m.id) && 
               newProgress >= m.targetCount
        );

        const newCompletedMissions = [...completedMissions];
        let totalXpGained = 0;

        newlyCompleted.forEach(mission => {
          newCompletedMissions.push(mission.id);
          totalXpGained += mission.xpReward;
          toast.success(`🏆 Quest Completed: ${mission.title}\n+${mission.xpReward} XP`, {
            duration: 5000,
            icon: '🎯'
          });
        });

        set({
          progress: {
            ...progress,
            [type]: newProgress,
          },
          completedMissions: newCompletedMissions,
        });

        if (totalXpGained > 0) {
          addXP(totalXpGained);
        }

        // Re-check perks now that quests may have been completed
        const newUnlockedPerks = calculateUnlockedPerks(level, newCompletedMissions);
        const freshlyUnlocked = newUnlockedPerks.filter(p => !unlockedPerks.includes(p));

        if (freshlyUnlocked.length > 0) {
          freshlyUnlocked.forEach(perkId => {
            const perk = APP_PERKS.find(p => p.id === perkId);
            if (perk) {
              toast.success(`🔓 Feature Unlocked: ${perk.title}\n${perk.description}`, {
                duration: 6000,
                position: 'bottom-right',
                style: { background: '#8b5cf6', color: '#fff', fontWeight: 'bold', padding: '16px', borderRadius: '12px' },
                icon: '✨'
              });
            }
          });
          set({ unlockedPerks: newUnlockedPerks });
        }
      },

      checkStreak: () => {
        const { lastLoginDate, streak, addXP, trackAction } = get();
        const today = new Date().toISOString().split('T')[0];
        
        if (lastLoginDate === today) return; // Already logged in today

        if (!lastLoginDate) {
          set({ lastLoginDate: today, streak: 1 });
          addXP(GAMIFICATION_CONFIG.STREAK_BASE_XP, 'Daily Login');
          trackAction('DAILY_LOGIN');
          return;
        }

        const last = new Date(lastLoginDate);
        const current = new Date(today);
        const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 3600 * 24));

        if (diffDays === 1) {
          const newStreak = streak + 1;
          set({ lastLoginDate: today, streak: newStreak });
          
          const rawStreakXp = GAMIFICATION_CONFIG.STREAK_BASE_XP + (newStreak * GAMIFICATION_CONFIG.STREAK_BONUS_PER_DAY);
          const streakXp = Math.min(rawStreakXp, GAMIFICATION_CONFIG.STREAK_MAX_BONUS);
          addXP(streakXp, `Daily Login Streak: ${newStreak}🔥`);
          trackAction('DAILY_LOGIN');
          
          toast.success(`Streak: ${newStreak} days!\n+${streakXp} XP`, {
            duration: 5000,
            position: 'bottom-right',
            style: { background: '#f97316', color: '#fff', fontWeight: 'bold', padding: '16px', borderRadius: '12px' },
            icon: '🔥'
          });
        } else if (diffDays > 1) {
          set({ lastLoginDate: today, streak: 1 });
          addXP(GAMIFICATION_CONFIG.STREAK_BASE_XP, 'Daily Login');
          trackAction('DAILY_LOGIN');
          toast('Streak broken. Back to day 1.', { 
            icon: '🥺',
            position: 'bottom-right',
            style: { background: '#3f3f46', color: '#fff', padding: '12px' }
          });
        }
      },

      isQueryFirstTime: (hash: string) => {
        return !get().executedQueryHashes.includes(hash);
      },

      markQueryExecuted: (hash: string) => {
        const { executedQueryHashes } = get();
        if (!executedQueryHashes.includes(hash)) {
          const MAX_HASHES = 1000;
          const updated = executedQueryHashes.length >= MAX_HASHES
            ? [...executedQueryHashes.slice(1), hash]
            : [...executedQueryHashes, hash];
          set({ executedQueryHashes: updated });
        }
      },
    }),
    {
      name: 'toketeo-gamification-storage',
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) return;
          const calculated = calculateUnlockedPerks(state.level, state.completedMissions);
          if (JSON.stringify(state.unlockedPerks) !== JSON.stringify(calculated)) {
            state.unlockedPerks = calculated;
          }
        };
      },
    }
  )
);
