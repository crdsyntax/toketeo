import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowUp, AlertTriangle, Table2, ThumbsUp, ThumbsDown, ArrowUpToLine, ChevronDown, Sparkles, Check, Eraser } from 'lucide-react'
import { useAgentChat, type UseAgentChatOptions } from '@/hooks/useAgentChat'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '@/types/assistant'

const EXAMPLES = [
  'Show top 5 customers by revenue',
  'Which products are out of stock?',
  'List all tables with their row counts',
  'Find duplicate email addresses',
]

// Detect free models: trust the backend `tier`/`isFree` flags when present,
// fall back to common patterns in model names for providers without tiers.
function isFreeModel(model: ModelInfo): boolean {
  if (model.tier === 'free' || model.isFree === true) return true
  if (model.tier) return false

  const name = model.name.toLowerCase()
  const id = model.id.toLowerCase()

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
  if (groups.has('') && sections.length === 0) {
    sections.push({ key: '', label: '', models: groups.get('')! })
  }
  return sections
}

function markdownToHtml(content: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Extract fenced code blocks first so their content is not processed.
  const codeBlocks: string[] = []
  let text = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) => {
    codeBlocks.push(
      `<pre class="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 my-2 whitespace-pre-wrap break-words"><code class="text-[13px] font-mono text-[#e6edf3]">${escapeHtml(code)}</code></pre>`,
    )
    return `@@CODE${codeBlocks.length - 1}@@`
  })

  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // GFM table: header row + separator row (| --- | --- |)
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const headers = parseRow(line)
      i += 2
      const bodyRows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseRow(lines[i]))
        i++
      }
      out.push(
        `<div class="my-2 overflow-x-hidden"><table class="w-full border-collapse text-[12px]">` +
          `<thead><tr>${headers
            .map(
              (h) =>
                `<th class="border border-[#333] bg-[#1a1a1a] px-2 py-1 text-left font-semibold text-[#ccc]">${h}</th>`,
            )
            .join('')}</tr></thead>` +
          `<tbody>${bodyRows
            .map(
              (r) =>
                `<tr>${r
                  .map(
                    (c) =>
                      `<td class="border border-[#333] px-2 py-1 align-top">${c}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('')}</tbody></table></div>`,
      )
      continue
    }
    out.push(line)
    i++
  }
  text = out.join('\n')

  const result = text
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

  return `<p class="mb-0">${result}</p>`.replace(
    /@@CODE(\d+)@@/g,
    (_, idx) => codeBlocks[Number(idx)] ?? '',
  )
}

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content), [content])

  return (
    <div
      className="text-[13px] leading-relaxed text-[#b4b4b4] whitespace-pre-wrap break-words min-w-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function StreamStatus({ status }: { status: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-[12px] text-[#888]">{status}</span>
    </div>
  )
}

/** Detect multiple-choice options ("(A) …", "**B)** …", "A) …") in the last
 * assistant message so they can be answered with one click. */
function extractOptionLetters(content: string): string[] {
  const letters = new Set<string>()
  const re = /(?:^|\n|\s)\(?([A-D])[).:]\s|\((?:\*\*)?([A-D])(?:\*\*)?\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const letter = m[1] ?? m[2]
    if (letter) letters.add(letter)
  }
  return [...letters].sort()
}

export interface AgentChatViewProps extends UseAgentChatOptions {
  /** Visual variant: full panel or compact drawer. */
  variant?: 'panel' | 'drawer'
}

export function AgentChatView({ variant = 'panel', onBeforeSend }: AgentChatViewProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    schemaCache,
    isStreaming,
    pendingConfirmation,
    liveMessage,
    models,
    selectedModel,
    input,
    handleInputChange,
    handleInputKeyDown,
    handleModelChange,
    handleSend,
    handleFeedback,
    loadInEditor,
    clearConversation,
    confirmPending,
  } = useAgentChat({ onBeforeSend })

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const compact = variant === 'drawer'

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Messages area */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden" ref={listRef}>
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
          <div className={cn('py-4 space-y-4', compact ? 'px-3' : 'px-4')}>
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
                    'max-w-[85%] min-w-0 rounded-2xl px-4 py-3 break-words',
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
                      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden min-w-0">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
                          <span className="text-[11px] font-medium text-[#666] uppercase tracking-wider">SQL</span>
                          <button
                            onClick={() => loadInEditor(msg.sql!)}
                            className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors"
                            title="Load SQL in editor"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                            Load in Editor
                          </button>
                        </div>
                        <div className="relative">
                          <pre className="text-[13px] font-mono leading-relaxed p-4 text-[#e6edf3] m-0 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
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
                    <div>
                      <MarkdownContent content={msg.content} />
                      {/* Multiple-choice options (A/B/C...) → clickable chips */}
                      {msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id && !isStreaming &&
                        extractOptionLetters(msg.content).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {extractOptionLetters(msg.content).map((letter) => (
                              <button
                                key={letter}
                                onClick={() => handleSend(letter)}
                                className="text-[12px] px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold"
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-transparent px-4 py-3 max-w-[85%]">
                  {liveMessage?.content ? (
                    <div>
                      <MarkdownContent content={liveMessage.content} />
                      {liveMessage.status && <StreamStatus status={liveMessage.status} />}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      <span className="text-[13px] text-[#666]">{liveMessage?.status ?? 'Thinking...'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {pendingConfirmation && !isStreaming && (
              <div className="flex justify-start px-4">
                <button
                  onClick={confirmPending}
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
      <div className="border-t border-[#222] px-4 py-3 bg-[#0d0d0d] min-w-0">
        <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-2xl px-4 py-3 focus-within:border-[#555] transition-all min-w-0">
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
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
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              disabled={isStreaming}
              className="flex items-center gap-1.5 text-[11px] text-[#888] hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Limpiar conversación (borra también el historial guardado)"
            >
              <Eraser className="w-3 h-3" />
              Limpiar
            </button>
          )}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={models.length === 0}
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
                          onClick={() => { handleModelChange(model); setShowModelDropdown(false) }}
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
