import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MISSIONS, MissionType } from '../lib/missions';
import toast from 'react-hot-toast';

interface GamificationState {
  level: number;
  xp: number;
  streak: number;
  lastLoginDate: string | null;
  
  // Progress tracking
  progress: Record<MissionType, number>;
  completedMissions: string[];

  // Actions
  addXP: (amount: number, reason?: string) => void;
  trackAction: (type: MissionType, amount?: number) => void;
  checkStreak: () => void;
}

const calculateLevel = (xp: number) => {
  // Level 1: 0-499, Level 2: 500-1199, Level 3: 1200-2099...
  // Simple exponential curve: Level = floor(sqrt(xp / 100)) + 1
  if (xp < 500) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
};

export const getXPForNextLevel = (level: number) => {
  if (level === 1) return 500;
  // Reverse the formula: xp = ((level - 1)^2) * 100
  return Math.pow(level, 2) * 100;
};

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

      addXP: (amount: number, reason?: string) => {
        const { xp, level } = get();
        const newXp = xp + amount;
        const newLevel = calculateLevel(newXp);
        
        if (newLevel > level) {
          toast.success(`🎉 Level Up! You reached Level ${newLevel}!`, { 
            duration: 5000, 
            position: 'bottom-right',
            style: { background: '#10b981', color: '#fff' }
          });
        } else if (reason) {
          // Optional: silent mini-toast for normal XP gains could be added here
        }

        set({ xp: newXp, level: newLevel });
      },

      trackAction: (type: MissionType, amount: number = 1) => {
        const { progress, completedMissions, addXP } = get();
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
      },

      checkStreak: () => {
        const { lastLoginDate, streak, addXP } = get();
        const today = new Date().toISOString().split('T')[0];
        
        if (lastLoginDate === today) return; // Already logged in today

        if (!lastLoginDate) {
          set({ lastLoginDate: today, streak: 1 });
          addXP(10, 'Daily Login');
          return;
        }

        const last = new Date(lastLoginDate);
        const current = new Date(today);
        const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 3600 * 24));

        if (diffDays === 1) {
          const newStreak = streak + 1;
          set({ lastLoginDate: today, streak: newStreak });
          
          const streakXp = 10 + (newStreak * 5);
          addXP(streakXp, `Daily Login Streak: ${newStreak}🔥`);
          toast.success(`🔥 Streak: ${newStreak} days! +${streakXp} XP`);
        } else if (diffDays > 1) {
          set({ lastLoginDate: today, streak: 1 });
          addXP(10, 'Daily Login');
          toast('Streak broken. Back to 1 🔥', { icon: '🥺' });
        }
      }
    }),
    {
      name: 'toketeo-gamification-storage',
    }
  )
);
