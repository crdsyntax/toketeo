import { AssistantSidebar } from '@/components/assistant/AssistantSidebar'
import { ASSISTANT_TABS, ASSISTANT_PANELS } from '@/components/assistant/assistantTabs'
import { useAssistantStore } from '@/store/assistantStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'

export function AssistantPage() {
  const activeTab = useAssistantStore((s) => s.activeTab)

  const def = ASSISTANT_TABS.find((t) => t.id === activeTab)
  const panel = ASSISTANT_PANELS[activeTab]
  const label = def?.label ?? 'Assistant'

  return (
    <div className="h-full flex bg-card overflow-hidden">
      <AssistantSidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-border bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              {def && <def.icon className="w-3 h-3 text-primary" />}
            </div>
            <span className="text-xs font-semibold text-foreground truncate">{label}</span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {def?.perkId ? (
            <FeatureGate perkId={def.perkId} showLocked={true}>
              {panel}
            </FeatureGate>
          ) : (
            panel
          )}
        </div>
      </div>
    </div>
  )
}
