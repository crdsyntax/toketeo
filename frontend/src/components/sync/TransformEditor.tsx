import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnTransform } from '@/types/sync'

interface TransformEditorProps {
  transform?: ColumnTransform
  onChange: (t: ColumnTransform | undefined) => void
}

const TRANSFORM_TYPES = [
  { value: 'trim', label: 'Trim' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'default_value', label: 'Default Value' },
  { value: 'regex', label: 'Regex Replace' },
  { value: 'concat', label: 'Concat' },
  { value: 'cast', label: 'Cast Type' },
  { value: 'date_format', label: 'Date Format' },
] as const

export function TransformEditor({ transform, onChange }: TransformEditorProps) {
  const [type, setType] = useState(transform?.type ?? 'none')

  if (type === 'none') {
    return (
      <button
        onClick={() => { setType('trim'); onChange({ type: 'trim' }) }}
        className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-3 h-3 inline mr-1" />Add Transform
      </button>
    )
  }

  const update = (partial: Partial<ColumnTransform>) => {
    onChange({ type: type as ColumnTransform['type'], ...partial } as ColumnTransform)
  }

  return (
    <div className="border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground">Transform</span>
        <button
          onClick={() => { setType('none'); onChange(undefined) }}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <select
        className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
        value={type}
        onChange={(e) => { setType(e.target.value); onChange({ type: e.target.value } as ColumnTransform) }}
      >
        {TRANSFORM_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Param inputs per type */}
      {(type === 'default_value') && (
        <div className="space-y-1">
          <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Value</label>
          <input
            className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
            value={transform?.value ?? ''}
            onChange={(e) => update({ value: e.target.value })}
            placeholder="Default value when null"
          />
        </div>
      )}

      {(type === 'regex') && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Pattern</label>
            <input
              className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
              value={transform?.pattern ?? ''}
              onChange={(e) => update({ pattern: e.target.value })}
              placeholder="e.g. [^a-zA-Z0-9]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Replacement</label>
            <input
              className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
              value={transform?.replacement ?? ''}
              onChange={(e) => update({ replacement: e.target.value })}
              placeholder="e.g. _"
            />
          </div>
        </div>
      )}

      {(type === 'concat') && (
        <ConcatPartsEditor parts={transform?.parts} onChange={(parts) => update({ parts })} />
      )}

      {(type === 'cast') && (
        <div className="space-y-1">
          <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target Type</label>
          <select
            className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={transform?.target_type ?? 'string'}
            onChange={(e) => update({ target_type: e.target.value })}
          >
            {['string', 'int', 'float', 'bool'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      {(type === 'date_format') && (
        <div className="space-y-1">
          <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Format</label>
          <input
            className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
            value={transform?.format ?? ''}
            onChange={(e) => update({ format: e.target.value })}
            placeholder="%Y-%m-%d"
          />
        </div>
      )}
    </div>
  )
}

function ConcatPartsEditor({ parts, onChange }: { parts?: string[]; onChange: (parts: string[]) => void }) {
  const items = parts ?? ['']

  return (
    <div className="space-y-2">
      <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Parts</label>
      {items.map((part, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="flex-1 bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
            value={part}
            onChange={(e) => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={`Part ${i + 1}`}
          />
          {items.length > 1 && (
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-primary hover:text-primary/80 flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Add Part
      </button>
    </div>
  )
}
