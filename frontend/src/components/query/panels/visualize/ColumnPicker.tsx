import { cn } from '@/lib/utils'
import type { ColumnProfile } from '@/lib/column-detection'

interface ColumnPickerProps {
  profiles: ColumnProfile[]
  xColumn: string | null
  yColumns: string[]
  groupColumn: string | null
  onXChange: (col: string) => void
  onYChange: (cols: string[]) => void
  onGroupChange: (col: string | null) => void
}

const ROLE_LABEL: Record<string, string> = {
  categorical: 'category',
  temporal: 'date',
  numeric: 'number',
  id: 'ID',
}

export function ColumnPicker({
  profiles,
  xColumn,
  yColumns,
  groupColumn,
  onXChange,
  onYChange,
  onGroupChange,
}: ColumnPickerProps) {
  const numericCols = profiles.filter((p) => p.role === 'numeric')
  const categoryCols = profiles.filter((p) => p.role === 'categorical' || p.role === 'temporal')
  const idCols = profiles.filter((p) => p.role === 'id')
  const xOptions = [...categoryCols, ...idCols, ...numericCols]
  const groupOptions = profiles.filter(
    (p) => p.uniqueValues <= 20 && p.uniqueValues > 1 && p.role !== 'id' && p.role !== 'numeric',
  )

  return (
    <div className="flex items-center gap-4 flex-wrap">

      <div className="flex items-center gap-1.5">
        <label className="text-[var(--ch-text-9)] font-semibold text-muted-foreground uppercase tracking-wider">
          Axis
        </label>
        <select
          value={xColumn ?? ''}
          onChange={(e) => onXChange(e.target.value)}
          className="h-7 text-[var(--ch-text-10)] px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px]"
          style={{ colorScheme: 'dark' }}
        >
          <option value="" disabled>
            Select column
          </option>
          {xOptions.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({ROLE_LABEL[p.role] ?? p.role})
            </option>
          ))}
        </select>
      </div>


      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <label className="text-[var(--ch-text-9)] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          Values
        </label>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {numericCols.map((p) => {
            const selected = yColumns.includes(p.name)
            return (
              <button
                key={p.name}
                onClick={() =>
                  onYChange(
                    selected
                      ? yColumns.filter((c) => c !== p.name)
                      : [...yColumns, p.name],
                  )
                }
                className={cn(
                  'text-[var(--ch-text-9)] px-1.5 py-0.5 rounded border transition-colors text-xs shrink-0',
                  selected
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border/40 hover:bg-muted',
                )}
              >
                {p.name}
              </button>
            )
          })}
          {numericCols.length === 0 && (
            <span className="text-[var(--ch-text-9)] text-muted-foreground/50 italic shrink-0">
              No numeric columns
            </span>
          )}
        </div>
      </div>


      {groupOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label className="text-[var(--ch-text-9)] font-semibold text-muted-foreground uppercase tracking-wider">
            Color
          </label>
          <select
            value={groupColumn ?? ''}
            onChange={(e) => onGroupChange(e.target.value || null)}
            className="h-7 text-[var(--ch-text-10)] px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[90px]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">None</option>
            {groupOptions.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.uniqueValues})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
