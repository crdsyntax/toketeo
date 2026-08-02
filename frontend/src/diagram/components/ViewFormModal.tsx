import { useState } from 'react'
import { X, Eye } from 'lucide-react'

interface ViewFormModalProps {
  initialName: string
  initialQuery?: string
  onClose: () => void
  onSave: (name: string, query?: string) => void
}

export function ViewFormModal({ initialName, initialQuery = '', onClose, onSave }: ViewFormModalProps) {
  const [name, setName] = useState(initialName)
  const [query, setQuery] = useState(initialQuery)

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed, query.trim() || undefined)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-[520px] max-w-[90vw] max-h-[85vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-500" />
            Edit View
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              View Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. active_users"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Query (SQL)
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'SELECT u.id, u.name, COUNT(o.id) AS orders\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id, u.name'}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50 resize-y"
            />
            <p className="text-[var(--ch-text-10)] text-muted-foreground/60 mt-1">
              La consulta se muestra en el nodo y se incluye en el export Mermaid.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
