import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AssistantTab = 'queries' | 'performance' | 'structures' | 'usage' | 'connect'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  timestamp: number
}

interface AssistantState {
  activeTab: AssistantTab
  messages: AssistantMessage[]
  showAssistant: boolean
  onboardingCompleted: boolean
  dismissedTips: string[]

  setActiveTab: (tab: AssistantTab) => void
  addMessage: (msg: AssistantMessage) => void
  clearMessages: () => void
  setShowAssistant: (show: boolean) => void
  completeOnboarding: () => void
  dismissTip: (id: string) => void
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      activeTab: 'queries',
      messages: [],
      showAssistant: false,
      onboardingCompleted: false,
      dismissedTips: [],

      setActiveTab: (tab) => set({ activeTab: tab }),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      clearMessages: () => set({ messages: [] }),
      setShowAssistant: (show) => set({ showAssistant: show }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      dismissTip: (id) => set((s) => ({
        dismissedTips: s.dismissedTips.includes(id) ? s.dismissedTips : [...s.dismissedTips, id],
      })),
    }),
    {
      name: 'toketeo-assistant-storage',
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        dismissedTips: state.dismissedTips,
      }),
    },
  ),
)
