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
    <div className="h-full flex flex-col bg-card border-l border-border overflow-hidden">
      {/* Header */}
      <div className="h-11 border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Assistant</span>
        </div>
        <button
          onClick={() => setShowAssistant(false)}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => {
          const content = (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
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
          const activeTabDef = TABS.find((t) => t.id === activeTab);
          if (activeTabDef?.perkId) {
            return (
              <FeatureGate perkId={activeTabDef.perkId} showLocked={true}>
                {PANELS[activeTab]}
              </FeatureGate>
            );
          }
          return PANELS[activeTab];
        })()}
      </div>
    </div>
  )
}
