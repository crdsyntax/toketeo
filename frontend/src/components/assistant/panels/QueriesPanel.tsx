import { AgentChatView } from '@/components/assistant/AgentChatView'
import { useGamificationStore } from '@/store/gamificationStore'



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
