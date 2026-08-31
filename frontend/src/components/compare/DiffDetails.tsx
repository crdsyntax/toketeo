import type React from 'react'
import { cn } from '@/lib/utils'
import type {
  ObjectDiff,
  IndexDiff,
  FkDiff,
  TableDiff,
  ColumnDiffDetail,
} from '@/types/compare'

function Cell({ value, highlight }: { value: React.ReactNode; highlight?: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-1.5 text-xs font-mono border-b border-border/40 align-top',
        highlight ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 'text-foreground'
      )}
    >
      {value ?? <span className="text-muted-foreground">—</span>}
    </td>
  )
}

export function TableColumnsDiff({ item }: { item: ObjectDiff }) {
  const details = item.details as unknown as TableDiff | undefined
  if (!details?.columns || details.columns.length === 0) return null
  const diffCols = details.columns.filter((c) => c.status !== 'equal')
  if (diffCols.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-muted/40">
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columna</th>
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">A</th>
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">B</th>
          </tr>
        </thead>
        <tbody>
          {diffCols.map((col: ColumnDiffDetail) => {
            const removed = col.status === 'missing'
            const added = col.status === 'new'
            return (
              <tr key={col.name}>
                <td className="px-3 py-1.5 text-xs font-mono border-b border-border/40 whitespace-nowrap">
                  {col.name}
                  <span
                    className={cn(
                      'ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium',
                      removed && 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
                      added && 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
                      !removed && !added && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                    )}
                  >
                    {removed ? 'solo en A' : added ? 'solo en B' : 'modificado'}
                  </span>
                </td>
                <Cell
                  value={removed ? undefined : col.source_type}
                  highlight={removed}
                />
                <Cell
                  value={added ? undefined : col.target_type}
                  highlight={added}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
      {diffCols.some((c) => c.status === 'modified') && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border/40 bg-muted/20">
          Detalle de cambios en columnas modificadas:
          <ul className="mt-1 space-y-0.5">
            {diffCols
              .filter((c) => c.status === 'modified')
              .map((c) => {
                const parts: string[] = []
                if (c.source_type !== c.target_type) parts.push(`tipo ${c.source_type ?? '?'} → ${c.target_type ?? '?'}`)
                if (c.source_nullable !== c.target_nullable) parts.push(`nullable ${c.source_nullable} → ${c.target_nullable}`)
                if (c.source_default !== c.target_default) parts.push(`default ${c.source_default ?? 'NULL'} → ${c.target_default ?? 'NULL'}`)
                return (
                  <li key={c.name} className="font-mono">
                    {c.name}: {parts.join(' · ') || 'cambio estructural'}
                  </li>
                )
              })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function IndexDetail({ item }: { item: IndexDiff }) {
  if (item.status !== 'modified') return null
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {item.columns_changed && (
        <div>
          Columnas: <span className="font-mono">[{item.columns_changed[0].join(', ')}]</span> → <span className="font-mono">[{item.columns_changed[1].join(', ')}]</span>
        </div>
      )}
      {item.unique_changed && (
        <div>
          Unique: <span className="font-mono">{String(item.unique_changed[0])}</span> → <span className="font-mono">{String(item.unique_changed[1])}</span>
        </div>
      )}
      {item.type_changed && (
        <div>
          Tipo: <span className="font-mono">{item.type_changed[0]}</span> → <span className="font-mono">{item.type_changed[1]}</span>
        </div>
      )}
    </div>
  )
}

export function FkDetail({ item }: { item: FkDiff }) {
  if (item.status !== 'modified') return null
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {item.referenced_table && (
        <div>
          Tabla referenciada: <span className="font-mono">{item.referenced_table[0]}</span> → <span className="font-mono">{item.referenced_table[1]}</span>
        </div>
      )}
      {item.on_delete && (
        <div>
          ON DELETE: <span className="font-mono">{item.on_delete[0] || '—'}</span> → <span className="font-mono">{item.on_delete[1] || '—'}</span>
        </div>
      )}
      {item.on_update && (
        <div>
          ON UPDATE: <span className="font-mono">{item.on_update[0] || '—'}</span> → <span className="font-mono">{item.on_update[1] || '—'}</span>
        </div>
      )}
    </div>
  )
}
