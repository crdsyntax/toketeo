import { AlertCircle, X, FileCode, AlertTriangle, Sparkles, Loader2 } from 'lucide-react'
import type { QueryTab } from '@/store/useAppStore'
import { useAppStore } from '@/store/useAppStore'
import { ExecutionStatus } from '@/types/database'
import type { SqlFixResult } from '@/types/assistant'

interface ResultsPanelErrorProps {
  activeTab: QueryTab | null
  updateTabResults: (tabId: string, updates: Partial<QueryTab>) => void
  safeDeleteSuggestion: string | null
  setSafeDeleteSuggestion: (suggestion: string | null) => void
  sqlFixSuggestion: SqlFixResult | null
  setSqlFixSuggestion: (suggestion: SqlFixResult | null) => void
  sqlFixLoading: boolean
}

export function ResultsPanelError({
  activeTab,
  updateTabResults,
  safeDeleteSuggestion,
  setSafeDeleteSuggestion,
  sqlFixSuggestion,
  setSqlFixSuggestion,
  sqlFixLoading,
}: ResultsPanelErrorProps) {
  if (activeTab?.status !== ExecutionStatus.ERROR) return null

  const handleOpenInEditor = () => {
    if (!safeDeleteSuggestion || !activeTab) return
    const { updateTabQuery, tabs, activeTabId } = useAppStore.getState()
    const tabId = activeTabId || (tabs.length > 0 ? tabs[0].id : null)
    if (tabId) {
      updateTabQuery(tabId, safeDeleteSuggestion)
    }
  }

  const handleReplaceWithFix = (sql: string) => {
    if (!activeTab) return
    const { updateTabQuery, tabs, activeTabId } = useAppStore.getState()
    const tabId = activeTabId || (tabs.length > 0 ? tabs[0].id : null)
    if (tabId) {
      updateTabQuery(tabId, sql)
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

      {sqlFixLoading && (
        <div className="bg-primary/10 border border-primary/25 text-primary flex items-center gap-2.5 p-3 rounded-lg backdrop-blur-md">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold leading-none">Analyzing with AI</p>
            <p className="text-[var(--ch-text-11)] opacity-80">Asking the assistant for a corrected query…</p>
          </div>
        </div>
      )}

      {sqlFixSuggestion && sqlFixSuggestion.status === 'ok' && sqlFixSuggestion.sql && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5 p-3 rounded-lg backdrop-blur-md">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <p className="text-xs font-semibold leading-none">Suggested SQL Fix</p>
            {sqlFixSuggestion.explanation && (
              <p className="text-[var(--ch-text-11)] opacity-80 text-xs whitespace-pre-wrap">
                {sqlFixSuggestion.explanation}
              </p>
            )}
            <div className="space-y-2">
              <div className="space-y-1.5">
                <pre className="text-[var(--ch-text-11)] bg-black/20 dark:bg-black/30 rounded-md p-2.5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {sqlFixSuggestion.sql}
                </pre>
                <button
                  onClick={() => handleReplaceWithFix(sqlFixSuggestion.sql!)}
                  className="flex items-center gap-1.5 text-[var(--ch-text-11)] font-medium px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                >
                  <FileCode className="w-3 h-3" />
                  Replace query with fixed SQL
                </button>
              </div>

              {sqlFixSuggestion.alternatives && sqlFixSuggestion.alternatives.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-emerald-500/70">
                    Alternatives
                  </p>
                  {sqlFixSuggestion.alternatives.map((alt, i) => (
                    <div key={i} className="space-y-1.5">
                      <pre className="text-[var(--ch-text-11)] bg-black/20 dark:bg-black/30 rounded-md p-2.5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                        {alt}
                      </pre>
                      <button
                        onClick={() => handleReplaceWithFix(alt)}
                        className="flex items-center gap-1.5 text-[var(--ch-text-11)] font-medium px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                      >
                        <FileCode className="w-3 h-3" />
                        Use this alternative
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setSqlFixSuggestion(null)}
            className="p-1 hover:bg-emerald-500/20 rounded-md text-emerald-500/80 hover:text-emerald-500 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {sqlFixSuggestion && sqlFixSuggestion.status !== 'ok' && (
        <div className="bg-primary/10 border border-primary/25 text-primary flex items-start gap-2.5 p-3 rounded-lg backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold leading-none">AI SQL Fix Unavailable</p>
            <p className="text-[var(--ch-text-11)] opacity-80 text-xs whitespace-pre-wrap">{sqlFixSuggestion.explanation}</p>
          </div>
          <button
            onClick={() => setSqlFixSuggestion(null)}
            className="p-1 hover:bg-primary/20 rounded-md text-primary/80 hover:text-primary transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {safeDeleteSuggestion && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-2.5 p-3 rounded-lg backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-semibold leading-none">Safe Delete Available</p>
            <p className="text-[var(--ch-text-11)] opacity-80">
              The delete failed due to a foreign key constraint. A safe delete script has been generated that deletes dependent tables first.
            </p>
            <button
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 text-[var(--ch-text-11)] font-medium px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
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
