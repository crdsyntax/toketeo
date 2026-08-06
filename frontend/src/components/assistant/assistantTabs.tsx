import { MessageSquare, BookOpen, Gauge, Database, Zap, Plug } from 'lucide-react'
import type { AssistantTab } from '@/store/assistantStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { QueriesPanel } from './panels/QueriesPanel'
import { PerformancePanel } from './panels/PerformancePanel'
import { StructuresPanel } from './panels/StructuresPanel'
import { UsagePanel } from './panels/UsagePanel'
import { ConnectHelpPanel } from './panels/ConnectHelpPanel'
import { LibraryPanel } from './panels/LibraryPanel'

export interface AssistantTabDef {
  id: AssistantTab
  label: string
  icon: React.ElementType
  perkId: string | null
}

export const ASSISTANT_TABS: AssistantTabDef[] = [
  { id: 'queries', label: 'Queries', icon: MessageSquare, perkId: 'ai_assistant' },
  { id: 'library', label: 'Library', icon: BookOpen, perkId: 'ai_assistant' },
  { id: 'performance', label: 'Performance', icon: Gauge, perkId: 'data_visualizer' },
  { id: 'structures', label: 'Structures', icon: Database, perkId: 'data_visualizer' },
  { id: 'usage', label: 'Usage', icon: Zap, perkId: null },
  { id: 'connect', label: 'Connect', icon: Plug, perkId: null },
]

export const ASSISTANT_PANELS: Record<AssistantTab, React.ReactNode> = {
  queries: <QueriesPanel />,
  library: <LibraryPanel />,
  performance: <PerformancePanel />,
  structures: <StructuresPanel />,
  usage: <UsagePanel />,
  connect: <ConnectHelpPanel />,
}

export function renderPanel(tab: AssistantTab) {
  const def = ASSISTANT_TABS.find((t) => t.id === tab)
  const panel = ASSISTANT_PANELS[tab]
  if (def?.perkId) {
    return (
      <FeatureGate key={tab} perkId={def.perkId} showLocked={true}>
        {panel}
      </FeatureGate>
    )
  }
  return panel
}
