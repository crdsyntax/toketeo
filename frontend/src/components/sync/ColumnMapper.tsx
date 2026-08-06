import { Plus, X, ArrowRight } from 'lucide-react'
import { TransformEditor } from './TransformEditor'
import type { ColumnMapping } from '@/types/sync'

interface ColumnMapperProps {
  sourceColumns: string[]
  targetColumns: string[]
  mappings: ColumnMapping[]
  onChange: (mappings: ColumnMapping[]) => void
}

export function ColumnMapper({ sourceColumns, targetColumns, mappings, onChange }: ColumnMapperProps) {
  const addMapping = () => {
    onChange([...mappings, { source_column: '', destination_column: '' }])
  }

  const updateMapping = (i: number, field: keyof ColumnMapping, value: unknown) => {
    const next = mappings.map((m, j) => j === i ? { ...m, [field]: value } as ColumnMapping : m)
    onChange(next)
  }

  const removeMapping = (i: number) => {
    onChange(mappings.filter((_, j) => j !== i))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground">Column Mappings</span>
        <button
          onClick={addMapping}
          className="flex items-center gap-1 text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Mapping
        </button>
      </div>

      <div className="space-y-2">
        {mappings.map((mapping, i) => (
          <div key={i} className="border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 mb-3">
              <select
                className="flex-1 bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                value={mapping.source_column}
                onChange={(e) => updateMapping(i, 'source_column', e.target.value)}
              >
                <option value="">— Select Source —</option>
                {sourceColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>

              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

              <select
                className="flex-1 bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                value={mapping.destination_column}
                onChange={(e) => updateMapping(i, 'destination_column', e.target.value)}
              >
                <option value="">— Select Target —</option>
                {targetColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>

              <button
                onClick={() => removeMapping(i)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <TransformEditor
              transform={mapping.transform}
              onChange={(t) => updateMapping(i, 'transform', t)}
            />
          </div>
        ))}
      </div>

      {mappings.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border">
          No column mappings defined. Click "Add Mapping" to start.
        </p>
      )}
    </div>
  )
}
