import { useState, useEffect } from 'react'
import { BookOpen, Star, Search, Copy, Check, FileCode, Loader2 } from 'lucide-react'
import { assistantService } from '@/services/assistant.service'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { KnowledgeCase } from '@/types/assistant'

export function LibraryPanel() {
  const [cases, setCases] = useState<KnowledgeCase[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const activeConnection = useAppStore((s) => s.activeConnection)

  const engine = activeConnection?.type ?? 'mysql'

  const loadAll = async () => {
    setLoading(true)
    try {
      const list = await assistantService.listKnowledge(engine)
      setCases(list)
    } catch { /* silent */ }
    setLoading(false)
  }

  const handleSearch = async () => {
    if (!search.trim()) {
      await loadAll()
      return
    }
    setLoading(true)
    try {
      const results = await assistantService.searchKnowledge(search, engine, 50)
      setCases(results)
    } catch { /* silent */ }
    setLoading(false)
  }

  const handleToggleFavorite = async (id: string) => {
    const newVal = await assistantService.toggleKnowledgeFavorite(id)
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, favorite: newVal } : c)),
    )
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOpenInEditor = (sql: string) => {
    const { updateTabQuery, tabs, activeTabId } = useAppStore.getState()
    const tabId = activeTabId || (tabs.length > 0 ? tabs[0].id : null)
    if (tabId) updateTabQuery(tabId, sql)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await assistantService.listKnowledge(engine)
        if (!cancelled) setCases(list)
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [engine])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search saved queries..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <button
          onClick={handleSearch}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <BookOpen className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Knowledge Library</span>
        <span className="text-[var(--ch-text-10)] text-muted-foreground ml-auto">
          {cases.length} {cases.length === 1 ? 'case' : 'cases'}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <BookOpen className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-xs">No saved queries yet.</p>
            <p className="text-[var(--ch-text-10)]">Rate assistant responses to build your library.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cases.map((c) => (
              <div key={c.id} className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => handleToggleFavorite(c.id)}
                      className={cn(
                        'shrink-0 p-0.5 rounded transition-colors',
                        c.favorite
                          ? 'text-yellow-500'
                          : 'text-muted-foreground/30 hover:text-yellow-500',
                      )}
                      title={c.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className="w-3 h-3" fill={c.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <span className="text-xs font-medium text-foreground truncate">
                      {c.question}
                    </span>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[var(--ch-text-10)] px-1.5 py-0.5 rounded font-medium',
                    c.rating === 'positive'
                      ? 'text-green-600 bg-green-500/10'
                      : 'text-red-600 bg-red-500/10',
                  )}>
                    {c.rating}
                  </span>
                </div>

                {/* SQL block */}
                <div className="bg-[#0d1117] rounded-lg overflow-hidden ml-5 mb-1">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22]">
                    <span className="text-[var(--ch-text-10)] font-mono text-[#8b949e]">SQL</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenInEditor(c.sqlText)}
                        className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
                        title="Open in Editor"
                      >
                        <FileCode className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleCopy(c.sqlText, c.id)}
                        className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
                        title="Copy"
                      >
                        {copiedId === c.id
                          ? <Check className="w-3 h-3 text-green-500" />
                          : <Copy className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </div>
                  <pre className="text-[var(--ch-text-11)] font-mono leading-relaxed p-3 overflow-x-auto text-[#e6edf3] m-0">
                    {c.sqlText}
                  </pre>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 ml-5 text-[var(--ch-text-10)] text-muted-foreground">
                  <span>Used {c.usedCount} times</span>
                  <span>·</span>
                  <span>{c.engine}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
