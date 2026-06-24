import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Bot, User, Copy, Check } from 'lucide-react'
import { useAssistantStore } from '@/store/assistantStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { cn } from '@/lib/utils'

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

export function QueriesPanel() {
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messages = useAssistantStore((s) => s.messages)
  const addMessage = useAssistantStore((s) => s.addMessage)
  const trackAction = useGamificationStore((s) => s.trackAction)
  const addXP = useGamificationStore((s) => s.addXP)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const nowRef = useRef(0)

  const handleSend = (text: string) => {
    if (!text.trim()) return
    const ts = (nowRef.current = nowRef.current + 1)
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text, timestamp: ts }
    addMessage(userMsg)
    setInput('')
    trackAction('EXECUTE_QUERY')
    addXP(5)

    const key = text.toLowerCase().trim()
    const sql = SYSTEM_RESPONSES[key] || generateFallbackSql(text)
    setTimeout(() => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: sql,
        sql,
        timestamp: (nowRef.current = nowRef.current + 1),
      })
    }, 600)
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-3 space-y-3" ref={listRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">AI Query Assistant</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">Describe what you want in natural language and I'll generate the SQL.</p>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleSend(ex)}
                  className="text-[10px] px-2.5 py-1.5 rounded-full border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-lg p-3',
              msg.role === 'user' ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30 border border-border',
            )}>
              <div className="flex items-center gap-1.5 mb-1.5">
                {msg.role === 'assistant' ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-[10px] font-medium text-muted-foreground">
                  {msg.role === 'assistant' ? 'Assistant' : 'You'}
                </span>
              </div>
              {msg.sql ? (
                <div className="relative group">
                  <pre className="text-[11px] font-mono bg-background/50 rounded p-2 overflow-x-auto leading-relaxed">{msg.sql}</pre>
                  <button
                    onClick={() => handleCopy(msg.sql!, msg.id)}
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copiedId === msg.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-foreground whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
            placeholder="Describe the query you need..."
            className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim()}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function generateFallbackSql(prompt: string): string {
  const tables = ['users', 'orders', 'products', 'customers', 'transactions']
  const table = tables.find((t) => prompt.toLowerCase().includes(t)) || 'table_name'
  return `-- Generated suggestion for: "${prompt}"\n-- Toketeo AI is still learning. Here's a template:\n\nSELECT *\nFROM ${table}\nWHERE condition\nLIMIT 100;`
}
