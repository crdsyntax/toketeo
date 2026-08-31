import { Sparkles, X } from 'lucide-react'
import { useAssistantStore } from '@/store/assistantStore'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { ASSISTANT_TABS } from './assistantTabs'


export function AssistantSidebar() {
  const activeTab = useAssistantStore((s) => s.activeTab)
  const setActiveTab = useAssistantStore((s) => s.setActiveTab)

  return (
    <div className="w-10 shrink-0 flex flex-col items-center gap-0.5 pt-2 border-r border-border bg-card">
      {ASSISTANT_TABS.map((tab) => {
        const isActive = activeTab === tab.id
        const btn = (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative w-9 h-9 flex items-center justify-center rounded-lg transition-all group',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
            title={tab.label}
          >
            <tab.icon className="w-4 h-4" />
            {isActive && (
              <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
            )}
          </button>
        )
        if (tab.perkId) {
          return (
            <FeatureGate key={tab.id} perkId={tab.perkId} showLocked={false}>
              {btn}
            </FeatureGate>
          )
        }
        return btn
      })}
    </div>
  )
}


export function AssistantHeader() {
  const activeTab = useAssistantStore((s) => s.activeTab)
  const setShowAssistant = useAssistantStore((s) => s.setShowAssistant)
  const label = ASSISTANT_TABS.find((t) => t.id === activeTab)?.label ?? 'Assistant'

  return (
    <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground truncate">{label}</span>
      </div>
      <button
        onClick={() => setShowAssistant(false)}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Close assistant"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
