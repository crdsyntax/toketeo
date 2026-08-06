import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Save, Download, Upload, Plus, Table2, Eye, PanelLeftClose, PanelLeft, Braces, Copy, FileDown } from 'lucide-react'
import toast from 'react-hot-toast'

interface DiagramToolbarProps {
  diagramName: string
  mermaidCode: string
  onRename: (name: string) => void
  onAddTable: () => void
  onAddView: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onBack: () => void
  isSaving?: boolean
  hasConnection?: boolean
  showSchemaSidebar?: boolean
  onToggleSchemaSidebar?: () => void
}

export function DiagramToolbar({
  diagramName,
  mermaidCode,
  onRename,
  onAddTable,
  onAddView,
  onSave,
  onExport,
  onImport,
  onBack,
  isSaving,
  hasConnection,
  showSchemaSidebar,
  onToggleSchemaSidebar,
}: DiagramToolbarProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(diagramName)
  const [mermaidOpen, setMermaidOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mermaidRef = useRef<HTMLDivElement>(null)

  const startEditing = () => {
    setName(diagramName)
    setEditing(true)
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mermaidRef.current && !mermaidRef.current.contains(e.target as Node)) {
        setMermaidOpen(false)
      }
    }
    if (mermaidOpen) {
      setTimeout(() => document.addEventListener('mousedown', handler), 0)
    }
    return () => document.removeEventListener('mousedown', handler)
  }, [mermaidOpen])

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode)
      toast.success('Mermaid code copied to clipboard')
    } catch {
      // Fallback for restricted webviews
      const ta = document.createElement('textarea')
      ta.value = mermaidCode
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      toast.success('Mermaid code copied to clipboard')
    }
    setMermaidOpen(false)
  }

  const handleDownloadMermaid = () => {
    const blob = new Blob([mermaidCode], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${diagramName.replace(/[^\w]+/g, '_') || 'diagram'}.mmd`
    a.click()
    URL.revokeObjectURL(url)
    setMermaidOpen(false)
    toast.success('Mermaid file downloaded')
  }

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== diagramName) {
      onRename(trimmed)
    } else {
      setName(diagramName)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
      <button
        onClick={onBack}
        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
        title="Back to diagrams"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      <div className="h-4 w-px bg-border mx-1" />

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') { setName(diagramName); setEditing(false) }
          }}
          className="bg-muted border border-border rounded px-2 py-0.5 text-sm font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary/50 min-w-[200px]"
        />
      ) : (
        <button
          onClick={startEditing}
          className="text-sm font-semibold text-foreground hover:text-primary transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
          title="Click to rename"
        >
          {diagramName}
        </button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={onAddTable}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors"
          title="Add Table (T)"
        >
          <Plus className="w-3.5 h-3.5" />
          <Table2 className="w-3.5 h-3.5" />
          Table
        </button>
        <button
          onClick={onAddView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-md transition-colors"
          title="Add View"
        >
          <Plus className="w-3.5 h-3.5" />
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
        {hasConnection && (
          <button
            onClick={onToggleSchemaSidebar}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-md transition-colors"
            title={showSchemaSidebar ? 'Hide table selector' : 'Show table selector'}
          >
            {showSchemaSidebar ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            {showSchemaSidebar ? 'Hide Tables' : 'Tables'}
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <div className="relative" ref={mermaidRef}>
          <button
            onClick={() => setMermaidOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 rounded-md transition-colors"
            title="Export to Mermaid (erDiagram)"
          >
            <Braces className="w-3.5 h-3.5" />
            Mermaid
          </button>
          {mermaidOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px]">
              <button
                onClick={handleCopyMermaid}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors text-left"
              >
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                Copy code
              </button>
              <button
                onClick={handleDownloadMermaid}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors text-left"
              >
                <FileDown className="w-3.5 h-3.5 text-muted-foreground" />
                Download .mmd
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
          title="Save (Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
        <button
          onClick={onExport}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Export diagram"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onImport}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Import diagram"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
