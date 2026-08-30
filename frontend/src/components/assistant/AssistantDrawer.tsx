import { useEffect } from 'react'
import { Sparkles, X, MessageSquarePlus, MessageSquare } from 'lucide-react'
import { useAssistantStore } from '@/store/assistantStore'
import { useAppStore } from '@/store/useAppStore'
import { assistantService } from '@/services/assistant.service'
import { AgentChatView } from './AgentChatView'

/**
 * Global assistant drawer. Mounted once in MainLayout so the agent is
 * reachable from every screen via the header icon or Ctrl/Cmd+I. Shares
 * conversation state with the /assistant page through assistantStore.
 */
export function AssistantDrawer() {
  const showAssistant = useAssistantStore((s) => s.showAssistant)
  const setShowAssistant = useAssistantStore((s) => s.setShowAssistant)
  const hasMessages = useAssistantStore((s) => s.messages.length > 0)

  // Global shortcut: Ctrl/Cmd+I toggles the drawer from any screen.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setShowAssistant(!useAssistantStore.getState().showAssistant)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setShowAssistant])

  if (!showAssistant) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[min(380px,88vw)] 2xl:w-[min(420px,88vw)] max-w-full border-l border-border bg-[#0d0d0d] shadow-2xl flex flex-col overflow-hidden">
      <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Start a fresh conversation: clear memory + persisted history. */}
          {hasMessages && (
            <button
              onClick={() => {
                const store = useAssistantStore.getState()
                store.clearMessages()
                store.setLiveMessage(null)
                store.setPendingConfirmation(null)
                const conn = useAppStore.getState().activeConnection
                if (conn) {
                  assistantService.clearMessages(conn.id).catch(() => undefined)
                }
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              title="New conversation"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          )}
          {!hasMessages && (
            <span
              className="p-1.5 rounded-md text-muted-foreground"
              title="New conversation"
            >
              <MessageSquare className="w-4 h-4" />
            </span>
          )}
          <button
            onClick={() => setShowAssistant(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Close (Ctrl+I)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <AgentChatView variant="drawer" />
      </div>
    </div>
  )
}
