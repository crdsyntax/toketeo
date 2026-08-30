import { AgentChatView } from '@/components/assistant/AgentChatView'
import { useGamificationStore } from '@/store/gamificationStore'

/**
 * Chat panel of the /assistant page. All chat logic and UI live in
 * AgentChatView + useAgentChat so the page, the QueryEditor embed and the
 * global AssistantDrawer share the exact same behavior.
 */
export function QueriesPanel() {
  const trackAction = useGamificationStore((s) => s.trackAction)
  const addXP = useGamificationStore((s) => s.addXP)

  return (
    <AgentChatView
      variant="panel"
      onBeforeSend={() => {
        trackAction('EXECUTE_QUERY')
        addXP(5)
      }}
    />
  )
}
