import { AssistantSidebar, AssistantHeader } from './AssistantSidebar'
import { ASSISTANT_TABS, ASSISTANT_PANELS } from './assistantTabs'
import { useAssistantStore } from '@/store/assistantStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'

/** Full assistant layout with sidebar + inline panel.
 *  Used by QueryEditor side-panel (w-80 container). */
export function AssistantLayout() {
  const activeTab = useAssistantStore((s) => s.activeTab)

  const def = ASSISTANT_TABS.find((t) => t.id === activeTab)
  const panel = ASSISTANT_PANELS[activeTab]

  return (
    <div className="h-full flex bg-card overflow-hidden">
      <AssistantSidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AssistantHeader />
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
