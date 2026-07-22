import { AlertCircle, X, FileCode, AlertTriangle } from 'lucide-react'
import type { QueryTab } from '@/store/useAppStore'
import { useAppStore } from '@/store/useAppStore'
import { ExecutionStatus } from '@/types/database'

interface ResultsPanelErrorProps {
  activeTab: QueryTab | null
  updateTabResults: (tabId: string, updates: Partial<QueryTab>) => void
  safeDeleteSuggestion: string | null
  setSafeDeleteSuggestion: (suggestion: string | null) => void
}

export function ResultsPanelError({ activeTab, updateTabResults, safeDeleteSuggestion, setSafeDeleteSuggestion }: ResultsPanelErrorProps) {
  if (activeTab?.status !== ExecutionStatus.ERROR) return null

  const handleOpenInEditor = () => {
    if (!safeDeleteSuggestion || !activeTab) return
    const { updateTabQuery, tabs, activeTabId } = useAppStore.getState()
    const tabId = activeTabId || (tabs.length > 0 ? tabs[0].id : null)
    if (tabId) {
      updateTabQuery(tabId, safeDeleteSuggestion)
    }
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-30 m-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2.5 p-3 rounded-lg backdrop-blur-md">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-semibold leading-none">Query Execution Failed</p>
          <p className="text-xs font-mono opacity-90 break-all">{activeTab.error}</p>
        </div>
        <button
          onClick={() => updateTabResults(activeTab.id, { status: ExecutionStatus.IDLE, error: null })}
          className="p-1 hover:bg-destructive/20 rounded-md text-destructive/80 hover:text-destructive transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {safeDeleteSuggestion && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-2.5 p-3 rounded-lg backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-semibold leading-none">Safe Delete Available</p>
            <p className="text-[11px] opacity-80">
              The delete failed due to a foreign key constraint. A safe delete script has been generated that deletes dependent tables first.
            </p>
            <button
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
            >
              <FileCode className="w-3 h-3" />
              Replace query with safe delete
            </button>
          </div>
          <button
            onClick={() => setSafeDeleteSuggestion(null)}
            className="p-1 hover:bg-amber-500/20 rounded-md text-amber-500/80 hover:text-amber-500 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}