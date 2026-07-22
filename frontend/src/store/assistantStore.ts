import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TableResponse, ColumnResponse } from '@/types/database'

export type AssistantTab = 'queries' | 'performance' | 'structures' | 'usage' | 'connect'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  isSafeDelete?: boolean
  feedback?: 'positive' | 'negative'
  timestamp: number
}

export interface SchemaCache {
  tables: TableResponse[]
  columns: Record<string, ColumnResponse[]>
}

interface AssistantState {
  activeTab: AssistantTab
  messages: AssistantMessage[]
  showAssistant: boolean
  onboardingCompleted: boolean
  dismissedTips: string[]
  schemaCache: SchemaCache

  setActiveTab: (tab: AssistantTab) => void
  addMessage: (msg: AssistantMessage) => void
  clearMessages: () => void
  setShowAssistant: (show: boolean) => void
  completeOnboarding: () => void
  dismissTip: (id: string) => void
  setSchemaCache: (cache: SchemaCache) => void
  clearSchemaCache: () => void
  updateMessageFeedback: (id: string, feedback: 'positive' | 'negative') => void
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      activeTab: 'queries',
      messages: [],
      showAssistant: false,
      onboardingCompleted: false,
      dismissedTips: [],
      schemaCache: { tables: [], columns: {} },

      setActiveTab: (tab) => set({ activeTab: tab }),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      clearMessages: () => set({ messages: [] }),
      setShowAssistant: (show) => set({ showAssistant: show }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      dismissTip: (id) => set((s) => ({
        dismissedTips: s.dismissedTips.includes(id) ? s.dismissedTips : [...s.dismissedTips, id],
      })),
      setSchemaCache: (schemaCache) => set({ schemaCache }),
      clearSchemaCache: () => set({ schemaCache: { tables: [], columns: {} } }),
      updateMessageFeedback: (id, feedback) => set((s) => ({
        messages: s.messages.map((m) => m.id === id ? { ...m, feedback } : m),
      })),
    }),
    {
      name: 'toketeo-assistant-storage',
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        dismissedTips: state.dismissedTips,
        messages: state.messages,
      }),
    },
  ),
)
