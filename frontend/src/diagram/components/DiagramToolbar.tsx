import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Save, Download, Upload, Plus, Table2, Eye, Keyboard } from 'lucide-react'

interface DiagramToolbarProps {
  diagramName: string
  onRename: (name: string) => void
  onAddTable: () => void
  onAddView: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onBack: () => void
  isSaving?: boolean
}

export function DiagramToolbar({
  diagramName,
  onRename,
  onAddTable,
  onAddView,
  onSave,
  onExport,
  onImport,
  onBack,
  isSaving,
}: DiagramToolbarProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(diagramName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(diagramName)
  }, [diagramName])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

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
          onClick={() => setEditing(true)}
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
      </div>

      <div className="h-4 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
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
