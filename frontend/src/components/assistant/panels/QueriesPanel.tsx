import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowUp, AlertTriangle, Table2, ThumbsUp, ThumbsDown, ArrowUpToLine, ChevronDown, Sparkles, Check } from 'lucide-react'
import { useAssistantStore, type AssistantMessage } from '@/store/assistantStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { useAppStore } from '@/store/useAppStore'
import { schemaService } from '@/services/schema.service'
import { assistantService } from '@/services/assistant.service'
import { tauriApi } from '@/lib/api'
import { requestRunQuery } from '@/lib/queryRunEvents'
import { cn } from '@/lib/utils'
import type { ColumnResponse } from '@/types/database'
import type { ModelInfo, ProviderConfig } from '@/types/assistant'

const EXAMPLES = [
  'Show top 5 customers by revenue',
  'Which products are out of stock?',
  'List all tables with their row counts',
  'Find duplicate email addresses',
]

// Detect a SQL query inside a user message: a fenced ```sql block, or a
// message that starts with a SQL statement keyword.
function extractSqlFromText(text: string): string | null {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fence) {
    const sql = fence[1].trim()
    if (sql) return sql
  }
  const trimmed = text.trim()
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|SHOW|DESCRIBE|EXPLAIN|CREATE|ALTER|DROP|TRUNCATE|USE|CALL|EXEC)\b/i.test(trimmed)) {
    return trimmed
  }
  return null
}

// Detect free models: trust the backend `tier`/`isFree` flags when present,
// fall back to common patterns in model names for providers without tiers.
function isFreeModel(model: ModelInfo): boolean {
  if (model.tier === 'free' || model.isFree === true) return true
  if (model.tier) return false

  const name = model.name.toLowerCase()
  const id = model.id.toLowerCase()

  // Common patterns for free models
  const freePatterns = [
    'free',
    'mini',
    'flash',
    'nano',
    'tiny',
    'lite',
    'small',
    'basic',
    'community',
    'open-source',
  ]

  return freePatterns.some(pattern => name.includes(pattern) || id.includes(pattern))
}

// Sections shown in the model dropdown, in display order.
const MODEL_TIERS = [
  { key: 'go', label: 'Zen Go' },
  { key: 'zen', label: 'Zen' },
  { key: 'free', label: 'Free' },
]

function groupModels(models: ModelInfo[]): { key: string; label: string; models: ModelInfo[] }[] {
  const groups = new Map<string, ModelInfo[]>()
  for (const m of models) {
    const tier = m.tier ?? ''
    if (!groups.has(tier)) groups.set(tier, [])
    groups.get(tier)!.push(m)
  }
  const sections = MODEL_TIERS
    .filter(({ key }) => groups.has(key))
    .map(({ key, label }) => ({ key, label, models: groups.get(key)! }))
  // Providers without tiers render as a flat list (single unlabeled group).
  if (groups.has('') && sections.length === 0) {
    sections.push({ key: '', label: '', models: groups.get('')! })
  }
  return sections
}

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    // Simple markdown to HTML converter
    const result = content
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 my-2 overflow-x-auto"><code class="text-[13px] font-mono text-[#e6edf3]">$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[13px] font-mono text-[#e6edf3]">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-foreground mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-foreground mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-lg font-semibold text-foreground mt-4 mb-2">$1</h1>')
      // Lists
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-[13px] text-[#b4b4b4]">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-[13px] text-[#b4b4b4]">$2</li>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="mb-3">')
      // Line breaks
      .replace(/\n/g, '<br/>')
    
    return `<p class="mb-0">${result}</p>`
  }, [content])
  
  return (
    <div 
      className="text-[13px] leading-relaxed text-[#b4b4b4] whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function QueriesPanel() {
  const [input, setInput] = useState('')
  const messages = useAssistantStore((s) => s.messages)
  const addMessage = useAssistantStore((s) => s.addMessage)
  const updateMessageFeedback = useAssistantStore((s) => s.updateMessageFeedback)
  const schemaCache = useAssistantStore((s) => s.schemaCache)
  const setSchemaCache = useAssistantStore((s) => s.setSchemaCache)
  const clearSchemaCache = useAssistantStore((s) => s.clearSchemaCache)
  const trackAction = useGamificationStore((s) => s.trackAction)
  const addXP = useGamificationStore((s) => s.addXP)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const isStreaming = useAssistantStore((s) => s.isStreaming)
  const setStreaming = useAssistantStore((s) => s.setStreaming)
  const pendingConfirmation = useAssistantStore((s) => s.pendingConfirmation)
  const setPendingConfirmation = useAssistantStore((s) => s.setPendingConfirmation)
  const listRef = useRef<HTMLDivElement>(null)
  const recallIndexRef = useRef(-1)
  const userMessagesRef = useRef<string[]>([])
  const isArrowRecallRef = useRef(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Keep user messages ref in sync
  useEffect(() => {
    userMessagesRef.current = messages.filter((m) => m.role === 'user').map((m) => m.content)
  }, [messages])

  useEffect(() => {
    if (!activeConnection) { clearSchemaCache(); return }
    let cancelled = false
    const schema = (activeConnection as { database?: string }).database
    ;(async () => {
      try {
        const tables = await schemaService.getTables(activeConnection.id, schema)
        const columns: Record<string, ColumnResponse[]> = {}
        await Promise.all(tables.map(async (t) => {
          try { columns[t.name] = await schemaService.getColumns(activeConnection.id, t.name, schema) } catch { /* silent */ }
        }))
        if (!cancelled) setSchemaCache({ tables, columns })
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id, clearSchemaCache, setSchemaCache])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Load available models
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingModels(true)
      try {
        const configs = await assistantService.getProviderConfigs()
        if (cancelled || configs.length === 0) {
          setIsLoadingModels(false)
          return
        }
        const config = configs[0]
        const modelsList = await assistantService.getModels(config.providerId, config)
        if (cancelled) return
        setModels(modelsList)
        // Select current model or first available
        const currentModel = modelsList.find(m => m.id === config.model) || modelsList[0]
        setSelectedModel(currentModel || null)
      } catch {
        // Silent fail - models are optional
      } finally {
        if (!cancelled) setIsLoadingModels(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleModelChange = async (model: ModelInfo) => {
    setSelectedModel(model)
    setShowModelDropdown(false)
    try {
      const configs = await assistantService.getProviderConfigs()
      if (configs.length === 0) return
      const config = configs[0]
      const updatedConfig: ProviderConfig = {
        ...config,
        model: model.id,
      }
      await assistantService.saveProviderConfig(updatedConfig)
    } catch {
      // Silent fail
    }
  }

  const nowRef = useRef(0)

  const handleSend = async (text: string, confirmDestructive = false) => {
    if (!text.trim() || isStreaming) return
    const ts = (nowRef.current = nowRef.current + 1)
    // Confirmation retries are implicit: the original user message is already
    // in the chat, so no "CONFIRMADO..." echo is added.
    if (!confirmDestructive) {
      addMessage({ id: crypto.randomUUID(), role: 'user' as const, content: text, timestamp: ts })
    }
    setInput('')
    recallIndexRef.current = -1
    trackAction('EXECUTE_QUERY')
    addXP(5)

    const deleteMatch = text.match(/(?:DELETE|delete|eliminar|borrar)\s+(?:FROM|from|de)\s+[`'"']?(\w+)[`'"']?/i)
    if (deleteMatch && activeConnection) {
      const table = deleteMatch[1]
      try {
        const sql = await schemaService.generateSafeDeleteSql(activeConnection.id, table, activeConnection.database)
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: sql, sql, isSafeDelete: true, timestamp: (nowRef.current = nowRef.current + 1) })
      } catch (err) {
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : 'Failed', timestamp: (nowRef.current = nowRef.current + 1) })
      }
      return
    }

    // User-provided SQL: run it directly in the editor and save it to the
    // knowledge library instead of sending it to the model.
    const userSql = extractSqlFromText(text)
    if (userSql) {
      const engine = activeConnection?.type ?? 'mysql'
      updateTabQuery(activeTabId, userSql)
      requestRunQuery(userSql)
      assistantService.recordCase(text.trim(), userSql, engine, 'positive').catch(() => undefined)
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: 'Consulta ejecutada en el editor y guardada en la biblioteca de conocimiento.', sql: userSql, timestamp: (nowRef.current = nowRef.current + 1) })
      return
    }

    setStreaming(true)
    try {
      const response = await assistantService.chat(activeConnection?.id ?? '', text, confirmDestructive)
      addMessage({ id: response.turnId, role: 'assistant', content: response.answer, sql: response.sql ?? undefined, toolUsed: response.toolUsed ?? null, timestamp: (nowRef.current = nowRef.current + 1) })
      // A destructive tool was blocked — ask the user to confirm before retrying.
      setPendingConfirmation(response.requiresConfirmation ? { question: text } : null)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : 'Failed to get response', timestamp: (nowRef.current = nowRef.current + 1) })
    } finally {
      setStreaming(false)
    }
  }

  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    updateMessageFeedback(messageId, feedback)
    schemaService.updateAssistantFeedback(messageId, feedback).catch(() => undefined)
    if (activeConnection) {
      assistantService.recordFeedback(
        messageId,
        activeConnection.id,
        feedback,
        'openai',
      ).catch(() => undefined)
    }
  }

  useEffect(() => {
    if (!activeConnection) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = await tauriApi.invoke<AssistantMessage[]>('load_assistant_messages', { connectionId: activeConnection.id })
        if (!cancelled && stored.length > 0) {
          const store = useAssistantStore.getState()
          if (store.messages.length === 0) {
            for (const m of stored) store.addMessage(m as AssistantMessage)
          }
        }
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!activeConnection || messages.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const msgs = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sql: m.sql,
        isSafeDelete: m.isSafeDelete,
        feedback: m.feedback,
        timestamp: m.timestamp,
        connectionId: activeConnection.id,
      }))
      schemaService.saveAssistantMessages(msgs).catch(() => undefined)
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeConnection?.id])

  const activeTabId = useAppStore((s) => s.activeTabId)
  const updateTabQuery = useAppStore((s) => s.updateTabQuery)

  const handleLoadInEditor = (sql: string) => {
    if (activeTabId) {
      updateTabQuery(activeTabId, sql)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-medium text-[#b4b4b4] mb-1">AI Query Assistant</h3>
            <p className="text-[13px] text-[#666] text-center mb-5 max-w-[260px]">
              Describe the query you need in natural language. I'll generate SQL based on your database schema.
            </p>

            {/* Example prompts */}
            <div className="flex flex-wrap gap-2 justify-center mb-5 max-w-[300px]">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleSend(ex)}
                  className="text-[13px] px-3 py-1.5 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#888] hover:text-[#ccc] hover:border-[#555] transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Tables section */}
            {schemaCache.tables.length > 0 && (
              <>
                <div className="flex items-center gap-3 w-full max-w-[300px] mb-3">
                  <div className="flex-1 h-px bg-[#333]" />
                  <span className="text-[11px] font-medium text-[#555] uppercase tracking-wider">Your Tables</span>
                  <div className="flex-1 h-px bg-[#333]" />
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-[300px]">
                  {schemaCache.tables.slice(0, 10).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => handleSend(`select * from ${t.name}`)}
                      className="flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#888] hover:text-primary hover:border-primary/30 transition-all"
                    >
                      <Table2 className="w-3 h-3 shrink-0" />
                      {t.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-[#1a1a1a] border border-[#333] rounded-br-md'
                      : 'bg-transparent'
                  )}
                >
                  {/* SQL message */}
                  {msg.sql ? (
                    <div>
                      {msg.isSafeDelete && (
                        <div className="flex items-center gap-1.5 mb-2 text-[12px] text-amber-400 bg-amber-400/10 rounded-lg px-2.5 py-1.5 border border-amber-400/20">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Safe delete — FK-safe order</span>
                        </div>
                      )}
                      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
                          <span className="text-[11px] font-medium text-[#666] uppercase tracking-wider">SQL</span>
                          <button
                            onClick={() => handleLoadInEditor(msg.sql!)}
                            className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors"
                            title="Load SQL in editor"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                            Load in Editor
                          </button>
                        </div>
                        <div className="relative">
                          <pre className="text-[13px] font-mono leading-relaxed p-4 text-[#e6edf3] m-0 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                            {msg.sql}
                          </pre>
                        </div>
                      </div>
                      {/* Feedback */}
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 mt-2">
                          <button
                            onClick={() => handleFeedback(msg.id, 'positive')}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              msg.feedback === 'positive'
                                ? 'text-green-400 bg-green-400/10'
                                : 'text-[#555] hover:text-green-400 hover:bg-green-400/10',
                            )}
                            title="Useful"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, 'negative')}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              msg.feedback === 'negative'
                                ? 'text-red-400 bg-red-400/10'
                                : 'text-[#555] hover:text-red-400 hover:bg-red-400/10',
                            )}
                            title="Not useful"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : msg.toolUsed ? (
                    /* Tool result */
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg px-2 py-0.5">
                          Tool: {msg.toolUsed}
                        </span>
                      </div>
                      <MarkdownContent content={msg.content} />
                    </div>
                  ) : (
                    /* Text message */
                    <MarkdownContent content={msg.content} />
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-transparent px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-[13px] text-[#666]">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            {pendingConfirmation && !isStreaming && (
              <div className="flex justify-start px-4">
                <button
                  onClick={() => {
                    const q = pendingConfirmation.question
                    setPendingConfirmation(null)
                    handleSend(q, true)
                  }}
                  className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-400/30 hover:bg-amber-500/20 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Confirmar y continuar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-[#222] px-4 py-3 bg-[#0d0d0d]">
        <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-2xl px-4 py-3 focus-within:border-[#555] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); if (!isArrowRecallRef.current) recallIndexRef.current = -1; isArrowRecallRef.current = false }}
            onKeyDown={(e) => {
              const userMsgs = userMessagesRef.current
              if (e.key === 'ArrowUp' && userMsgs.length > 0) {
                e.preventDefault()
                isArrowRecallRef.current = true
                const next = Math.min(recallIndexRef.current + 1, userMsgs.length - 1)
                recallIndexRef.current = next
                setInput(userMsgs[userMsgs.length - 1 - next])
                return
              }
              if (e.key === 'ArrowDown' && recallIndexRef.current >= 0) {
                e.preventDefault()
                isArrowRecallRef.current = true
                const next = recallIndexRef.current - 1
                if (next < 0) {
                  recallIndexRef.current = -1
                  setInput('')
                } else {
                  recallIndexRef.current = next
                  setInput(userMsgs[userMsgs.length - 1 - next])
                }
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) }
            }}
            placeholder="Ask anything, / for commands, @ for context..."
            className="flex-1 text-[13px] bg-transparent text-[#e6edf3] placeholder:text-[#555] border-none outline-none"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2 px-1">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={isLoadingModels || models.length === 0}
              className="flex items-center gap-1.5 text-[11px] text-[#888] hover:text-[#ccc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>{selectedModel?.name || 'Loading...'}</span>
              {selectedModel && isFreeModel(selectedModel) && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">FREE</span>
              )}
              <ChevronDown className={cn("w-3 h-3 transition-transform", showModelDropdown && "rotate-180")} />
            </button>
            
            {showModelDropdown && (
              <div className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-50">
                <div className="p-2">
                  {groupModels(models).map((section) => (
                    <div key={section.key || 'other'}>
                      {section.label && (
                        <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#555]">
                          {section.label}
                        </div>
                      )}
                      {section.models.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelChange(model)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                            selectedModel?.id === model.id
                              ? "bg-primary/10 text-primary"
                              : "text-[#ccc] hover:bg-[#2a2a2a]"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium truncate">{model.name}</span>
                              {isFreeModel(model) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">FREE</span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#666]">{model.provider}</div>
                          </div>
                          {selectedModel?.id === model.id && (
                            <Check className="w-4 h-4 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
