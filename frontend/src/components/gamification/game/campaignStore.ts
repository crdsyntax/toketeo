import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from './types'

interface CampaignState {
  completedNodes: string[]
  nodePos: number
  lang: Lang
  nodePuzzleIndex: Record<string, number>
  introSeen: boolean
  completeNode: (id: string) => void
  setNodePos: (pos: number) => void
  setLang: (lang: Lang) => void
  setNodePuzzleIndex: (nodeId: string, index: number) => void
  setIntroSeen: (seen: boolean) => void
  resetCampaign: () => void
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set) => ({
      completedNodes: [],
      nodePos: 0,
      lang: 'en',
      nodePuzzleIndex: {},
      introSeen: false,
      completeNode: (id) =>
        set((s) => ({
          completedNodes: s.completedNodes.includes(id)
            ? s.completedNodes
            : [...s.completedNodes, id],
        })),
      setNodePos: (pos) => set({ nodePos: pos }),
      setLang: (lang) => set({ lang }),
      setNodePuzzleIndex: (nodeId, index) =>
        set((s) => ({ nodePuzzleIndex: { ...s.nodePuzzleIndex, [nodeId]: index } })),
      setIntroSeen: (seen) => set({ introSeen: seen }),
      resetCampaign: () => set({ completedNodes: [], nodePos: 0, nodePuzzleIndex: {} }),
    }),
    { name: 'toketeo-data-defender' },
  ),
)
