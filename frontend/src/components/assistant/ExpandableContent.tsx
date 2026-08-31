import { useState, useRef, useEffect } from 'react'
import { Maximize2, Copy, Check, FileCode, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

interface ExpandableContentProps {
  children: React.ReactNode

  text: string

  isSql?: boolean

  maxHeight?: string

  variant?: 'text' | 'sql'
}

export function ExpandableContent({
  children,
  text,
  isSql,
  maxHeight,
  variant = 'text',
}: ExpandableContentProps) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (el) {
      setTruncated(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    }
  }, [children])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenInEditor = () => {
    const { updateTabQuery, tabs, activeTabId } = useAppStore.getState()
    const tabId = activeTabId || (tabs.length > 0 ? tabs[0].id : null)
    if (tabId) updateTabQuery(tabId, text)
    setExpanded(false)
  }

  const mh = maxHeight ?? (variant === 'sql' ? '180px' : '4.5em')

  return (
    <>

      <div className="relative">
        <div
          ref={contentRef}
          className={cn(
            'overflow-hidden',
            variant === 'sql' ? '' : 'line-clamp-4',
          )}
          style={{ maxHeight: variant === 'sql' ? mh : undefined }}
        >
          {children}
        </div>

        {truncated && !expanded && (
          <div className="relative mt-1.5">
            <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 text-[var(--ch-text-10)] font-medium text-primary hover:text-primary/80 transition-colors px-1"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
          </div>
        )}
      </div>


      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setExpanded(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              width: 'min(90vw, 800px)',
              height: 'min(80vh, 600px)',
              resize: 'both',
              minWidth: 320,
              minHeight: 200,
            }}
          >

            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-foreground flex-1 truncate">
                {isSql ? 'SQL' : 'Message'}
              </span>
              {isSql && (
                <button
                  onClick={handleOpenInEditor}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in Editor"
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {variant === 'sql' ? (
                <pre className="text-[var(--ch-text-13)] font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all m-0">
                  {text}
                </pre>
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
              )}
            </div>

            <div className="h-3 shrink-0 flex items-center justify-center border-t border-border text-muted-foreground/30">
              <div className="flex gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-current" />
                <div className="w-0.5 h-0.5 rounded-full bg-current" />
                <div className="w-0.5 h-0.5 rounded-full bg-current" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
