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
  const groupOptions = profiles.filter((p) => p.uniqueValues <= 20 && p.uniqueValues > 1 && p.role !== 'id' && p.role !== 'numeric')

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">X</label>
        <select
          value={xColumn ?? ''}
          onChange={(e) => onXChange(e.target.value)}
          className="h-7 text-[11px] px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            Select X axis
          </option>
          {xOptions.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.role})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Y</label>
        <div className="flex gap-1 flex-wrap max-w-[200px]">
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
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  selected
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border/40 hover:bg-muted'
                }`}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      </div>

      {groupOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Group
          </label>
          <select
            value={groupColumn ?? ''}
            onChange={(e) => onGroupChange(e.target.value || null)}
            className="h-7 text-[11px] px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
