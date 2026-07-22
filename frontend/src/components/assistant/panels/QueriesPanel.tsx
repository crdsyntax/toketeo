import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Bot, User, Copy, Check, FileCode, AlertTriangle, Table2, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useAssistantStore, type AssistantMessage } from '@/store/assistantStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { useAppStore } from '@/store/useAppStore'
import { schemaService } from '@/services/schema.service'
import { tauriApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ColumnResponse } from '@/types/database'

const EXAMPLES = [
  'Show top 5 customers by revenue',
  'Which products are out of stock?',
  'List all tables with their row counts',
  'Find duplicate email addresses',
]

const SYSTEM_RESPONSES: Record<string, string> = {
  'show top 5 customers by revenue': 'SELECT c.name, SUM(o.total) as revenue\nFROM customers c\nJOIN orders o ON c.id = o.customer_id\nGROUP BY c.id, c.name\nORDER BY revenue DESC\nLIMIT 5;',
  'which products are out of stock': 'SELECT name, stock_quantity\nFROM products\nWHERE stock_quantity = 0 OR stock_quantity IS NULL\nORDER BY name;',
  'list all tables with their row counts': "SELECT table_name AS table_name, (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass) AS row_count\nFROM information_schema.tables\nWHERE table_schema NOT IN ('pg_catalog', 'information_schema')\nORDER BY table_name;",
  'find duplicate email addresses': 'SELECT email, COUNT(*) as occurrences\nFROM users\nGROUP BY email\nHAVING COUNT(*) > 1\nORDER BY occurrences DESC;',
}

const SPANISH_STOP_WORDS = new Set([
  'en', 'la', 'tabla', 'como', 'de', 'del', 'el', 'un', 'una', 'los', 'las',
  'con', 'por', 'para', 'que', 'es', 'se', 'no', 'su', 'lo', 'le', 'y', 'a',
  'e', 'o', 'pero', 'mas', 'table',
])

function pluralize(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') ||
      word.endsWith('ch') || word.endsWith('sh')) return word + 'es'
  if (word.endsWith('y') && !'aeiou'.includes(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies'
  }
  return word + 's'
}

function generateUpdateSql(prompt: string): string | null {
  const tableMatch = prompt.match(/(?:en\s+(?:la\s+)?tabla\s+|table\s+)\s*[`'"']?(\w+)[`'"']?/i)
  if (!tableMatch) return null
  const table = pluralize(tableMatch[1])
  const assignments: string[] = []
  const conditions: string[] = []

  const marcarMatch = prompt.match(/marcar\s+como\s+(\w+)/i)
  if (marcarMatch) {
    const val = marcarMatch[1].toLowerCase()
    if (val === 'verified') {
      assignments.push(`status = 'status_verified'`)
      conditions.push(`status != 'status_verified'`)
    } else {
      assignments.push(`${val} = true`)
      conditions.push(`${val} != true`)
    }
  }

  const fieldRegex = /(\w+)\s*[:=]\s*(\w+|'[^']*'|"[^"]*")/g
  let fieldMatch
  while ((fieldMatch = fieldRegex.exec(prompt)) !== null) {
    const field = fieldMatch[1].toLowerCase()
    if (SPANISH_STOP_WORDS.has(field)) continue
    let value = fieldMatch[2]
    if (value.toLowerCase() === 'true') value = 'true'
    else if (value.toLowerCase() === 'false') value = 'false'
    else if (value.toLowerCase() === 'null') value = 'NULL'
    else if (value.toLowerCase() === 'undefined') value = 'NULL'
    else if (!value.startsWith("'") && !value.startsWith('"') && isNaN(Number(value))) {
      value = `'${value.replace(/'/g, "''")}'`
    }
    assignments.push(`${field} = ${value}`)
    conditions.push(`${field} != ${value}`)
  }
  if (assignments.length === 0) return null
  return `UPDATE ${table}\nSET ${assignments.join(',\n    ')}\nWHERE ${conditions.join('\n   OR ')};`
}

const CONDITION_MAP: Record<string, string> = {
  activo: 'active = true', activos: 'active = true', activa: 'active = true',
  publicado: 'published = true', publicados: 'published = true', publicada: 'published = true',
  pendiente: "status = 'pending'", pendientes: "status = 'pending'",
  verificado: "status = 'verified'", verificados: "status = 'verified'",
  eliminado: 'deleted_at IS NULL', eliminados: 'deleted_at IS NULL',
  inactivo: 'active = false', inactivos: 'active = false',
}

function generateAddUpdateSql(prompt: string): string | null {
  const addMatch = prompt.match(/(?:agregar|sumar|incrementar|aumentar|add|increment)\s+(\w+)\s+(?:a\s+)?(?:los|las|la|el|al)?\s*(?:tabla\s+)?(\w+)/i)
  if (!addMatch) return null
  const field = addMatch[1].toLowerCase()
  const table = pluralize(addMatch[2])
  const afterTable = prompt.slice(prompt.toLowerCase().indexOf(addMatch[2].toLowerCase()) + addMatch[2].length)
  const conditions: string[] = []
  for (const [word, sql] of Object.entries(CONDITION_MAP)) {
    if (afterTable.toLowerCase().includes(word) || prompt.toLowerCase().includes(word)) {
      if (!conditions.includes(sql)) conditions.push(sql)
    }
  }
  const whereClause = conditions.length > 0 ? `\nWHERE ${conditions.join('\n   AND ')}` : ''
  return `UPDATE ${table}\nSET ${field} = ${field} + ?${whereClause};`
}

function generateRemoveUpdateSql(prompt: string): string | null {
  const removeMatch = prompt.match(/(?:remover|quitar|restar|decrementar|remove|subtract)\s+(\w+)\s+(?:de\s+)?(?:los|las|la|el|al)?\s*(?:tabla\s+)?(\w+)/i)
  if (!removeMatch) return null
  const field = removeMatch[1].toLowerCase()
  const table = pluralize(removeMatch[2])
  const afterTable = prompt.slice(prompt.toLowerCase().indexOf(removeMatch[2].toLowerCase()) + removeMatch[2].length)
  const conditions: string[] = []
  for (const [word, sql] of Object.entries(CONDITION_MAP)) {
    if (afterTable.toLowerCase().includes(word) || prompt.toLowerCase().includes(word)) {
      if (!conditions.includes(sql)) conditions.push(sql)
    }
  }
  const whereClause = conditions.length > 0 ? `\nWHERE ${conditions.join('\n   AND ')}` : ''
  return `UPDATE ${table}\nSET ${field} = ${field} - ?${whereClause};`
}

export function QueriesPanel() {
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messages = useAssistantStore((s) => s.messages)
  const addMessage = useAssistantStore((s) => s.addMessage)
  const clearMessages = useAssistantStore((s) => s.clearMessages)
  const updateMessageFeedback = useAssistantStore((s) => s.updateMessageFeedback)
  const schemaCache = useAssistantStore((s) => s.schemaCache)
  const setSchemaCache = useAssistantStore((s) => s.setSchemaCache)
  const clearSchemaCache = useAssistantStore((s) => s.clearSchemaCache)
  const trackAction = useGamificationStore((s) => s.trackAction)
  const addXP = useGamificationStore((s) => s.addXP)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const listRef = useRef<HTMLDivElement>(null)

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

  const nowRef = useRef(0)

  const handleSend = async (text: string) => {
    if (!text.trim()) return
    const ts = (nowRef.current = nowRef.current + 1)
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text, timestamp: ts }
    addMessage(userMsg)
    setInput('')
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

    const updateSql = generateUpdateSql(text)
    if (updateSql) {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: updateSql, sql: updateSql, timestamp: (nowRef.current = nowRef.current + 1) })
      return
    }

    const addSql = generateAddUpdateSql(text)
    if (addSql) {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: addSql, sql: addSql, timestamp: (nowRef.current = nowRef.current + 1) })
      return
    }

    const removeSql = generateRemoveUpdateSql(text)
    if (removeSql) {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: removeSql, sql: removeSql, timestamp: (nowRef.current = nowRef.current + 1) })
      return
    }

    const key = text.toLowerCase().trim()
    const sql = SYSTEM_RESPONSES[key] || generateFallbackSql(text, schemaCache.tables, schemaCache.columns)
    setTimeout(() => {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: sql, sql, timestamp: (nowRef.current = nowRef.current + 1) })
    }, 600)
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

  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    updateMessageFeedback(messageId, feedback)
    schemaService.updateAssistantFeedback(messageId, feedback).catch(() => undefined)
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
      const msgs: Record<string, unknown>[] = messages.map(m => ({
        ...m, connectionId: activeConnection.id, timestamp: m.timestamp,
      }))
      schemaService.saveAssistantMessages(msgs).catch(() => undefined)
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeConnection?.id])

  const hasTables = schemaCache.tables.length > 0
  const connLabel = activeConnection
    ? `${activeConnection.name} · ${activeConnection.type}`
    : null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-5 py-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center mb-4 shadow-sm">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">AI Query Assistant</h3>
            <p className="text-[11px] text-muted-foreground text-center mb-5 leading-relaxed max-w-[260px]">
              Describe the query you need in natural language. I'll generate SQL based on your database schema.
            </p>

            {/* Example prompts */}
            <div className="flex flex-wrap gap-1.5 justify-center mb-4">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleSend(ex)}
                  className="text-[10px] px-3 py-1.5 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted hover:border-muted-foreground/30 transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Tables section */}
            {hasTables && (
              <>
                <div className="flex items-center gap-3 w-full max-w-[260px] mb-3">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Your Tables</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-[260px]">
                  {schemaCache.tables.slice(0, 10).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => handleSend(`select * from ${t.name}`)}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-full border border-primary/10 bg-primary/[0.03] text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
                    >
                      <Table2 className="w-2.5 h-2.5 shrink-0" />
                      {t.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {connLabel && (
              <div className="mt-5 text-[9px] text-muted-foreground/40 font-mono tracking-wider uppercase">
                {connLabel}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm border-b border-border/40 flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => { if (confirm('Clear all conversation messages?')) clearMessages() }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/5"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>

            {/* Messages */}
            <div className="px-3 pt-2 pb-3 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[88%] rounded-xl px-3 py-2',
                    msg.role === 'user'
                      ? 'bg-primary/10 border border-primary/15 rounded-tr-sm'
                      : 'bg-muted/25 border border-border/50 rounded-tl-sm',
                  )}>
                    {/* Role label */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {msg.role === 'assistant' ? (
                        <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center">
                          <Bot className="w-2.5 h-2.5 text-primary" />
                        </div>
                      ) : (
                        <User className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {msg.role === 'assistant' ? 'Assistant' : 'You'}
                      </span>
                    </div>

                    {/* SQL message */}
                    {msg.sql ? (
                      <div>
                        {msg.isSafeDelete && (
                          <div className="flex items-center gap-1 mb-2 text-[10px] text-amber-500 bg-amber-500/8 rounded px-1.5 py-0.5 border border-amber-500/15">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Safe delete — FK-safe order</span>
                          </div>
                        )}
                        <div className="relative group">
                          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
                              <span className="text-[9px] font-medium text-[#8b949e] uppercase tracking-wider">SQL</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleOpenInEditor(msg.sql!)}
                                  className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
                                  title="Open in Editor"
                                >
                                  <FileCode className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleCopy(msg.sql!, msg.id)}
                                  className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
                                  title="Copy"
                                >
                                  {copiedId === msg.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                            <pre className="text-[11px] font-mono leading-relaxed p-3 overflow-x-auto text-[#e6edf3] m-0">{msg.sql}</pre>
                          </div>
                        </div>
                        {/* Feedback thumbs */}
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <button
                              onClick={() => handleFeedback(msg.id, 'positive')}
                              className={cn(
                                'p-1 rounded transition-colors',
                                msg.feedback === 'positive'
                                  ? 'text-green-500 bg-green-500/10'
                                  : 'text-muted-foreground/40 hover:text-green-500 hover:bg-green-500/10',
                              )}
                              title="Useful"
                            >
                              <ThumbsUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg.id, 'negative')}
                              className={cn(
                                'p-1 rounded transition-colors',
                                msg.feedback === 'negative'
                                  ? 'text-red-500 bg-red-500/10'
                                  : 'text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10',
                              )}
                              title="Not useful"
                            >
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Text message */
                      <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border shrink-0 px-3 py-2.5 bg-card/95">
        <div className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-xl px-3 py-2 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
            placeholder="Describe the query you need..."
            className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground/40 border-none outline-none"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim()}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function generateFallbackSql(prompt: string, realTables: { name: string }[], columns: Record<string, ColumnResponse[]>): string {
  const lower = prompt.toLowerCase()
  const actionWords = ['actualizar', 'cambiar', 'modificar', 'agregar', 'remover', 'quitar', 'update', 'set', 'insert', 'delete']
  if (actionWords.some(w => lower.includes(w))) {
    return `-- I couldn't determine the exact table and fields for: "${prompt}"\n-- Please provide more details (table name and field assignments).\n-- Example: "set status = 'active' in products"`
  }
  const matched = realTables.find((t) => lower.includes(t.name.toLowerCase())) || realTables[0]
  if (matched) {
    const cols = columns[matched.name]
    const colStr = cols && cols.length > 0 ? cols.map(c => c.name).join(', ') : '*'
    return `-- Based on table "${matched.name}"\nSELECT ${colStr}\nFROM ${matched.name}\nWHERE condition\nLIMIT 100;`
  }
  const hardcoded = ['users', 'orders', 'products', 'customers', 'transactions']
  const table = hardcoded.find((t) => lower.includes(t)) || 'table_name'
  return `-- Generated suggestion for: "${prompt}"\n-- Toketeo AI is still learning. Here's a template:\n\nSELECT *\nFROM ${table}\nWHERE condition\nLIMIT 100;`
}
