import { MessageSquare, Gauge, Database, Zap, Plug, Sparkles, X } from 'lucide-react'
import { useAssistantStore, type AssistantTab } from '@/store/assistantStore'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { QueriesPanel } from './panels/QueriesPanel'
import { PerformancePanel } from './panels/PerformancePanel'
import { StructuresPanel } from './panels/StructuresPanel'
import { UsagePanel } from './panels/UsagePanel'
import { ConnectHelpPanel } from './panels/ConnectHelpPanel'

const TABS: { id: AssistantTab; label: string; icon: React.ElementType; perkId: string | null }[] = [
  { id: 'queries', label: 'Queries', icon: MessageSquare, perkId: 'ai_assistant' },
  { id: 'performance', label: 'Performance', icon: Gauge, perkId: 'data_visualizer' },
  { id: 'structures', label: 'Structures', icon: Database, perkId: 'data_visualizer' },
  { id: 'usage', label: 'Usage', icon: Zap, perkId: null },
  { id: 'connect', label: 'Connect', icon: Plug, perkId: null },
]

const PANELS: Record<AssistantTab, React.ReactNode> = {
  queries: <QueriesPanel />,
  performance: <PerformancePanel />,
  structures: <StructuresPanel />,
  usage: <UsagePanel />,
  connect: <ConnectHelpPanel />,
}

export function AssistantLayout() {
  const activeTab = useAssistantStore((s) => s.activeTab)
  const setActiveTab = useAssistantStore((s) => s.setActiveTab)
  const setShowAssistant = useAssistantStore((s) => s.setShowAssistant)

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">Assistant</span>
        </div>
        <button
          onClick={() => setShowAssistant(false)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Close assistant"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0 px-2 pt-1 gap-0.5">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const content = (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-all relative rounded-t-lg',
                isActive
                  ? 'text-primary bg-primary/[0.04]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          )
          if (tab.perkId) {
            return (
              <FeatureGate key={tab.id} perkId={tab.perkId} showLocked={false}>
                {content}
              </FeatureGate>
            )
          }
          return content
        })}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {(() => {
          const activeTabDef = TABS.find((t) => t.id === activeTab)
          if (activeTabDef?.perkId) {
            return (
              <FeatureGate perkId={activeTabDef.perkId} showLocked={true}>
                {PANELS[activeTab]}
              </FeatureGate>
            )
          }
          return PANELS[activeTab]
        })()}
      </div>
    </div>
  )
}
