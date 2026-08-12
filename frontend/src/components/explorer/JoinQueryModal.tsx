import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { schemaService } from '@/services/schema.service'
import type { ColumnResponse, ForeignKeyResponse } from '@/types/database'
import { DatabaseType } from '@/types/database'
import { quoteIdent, quoteTableName } from '@/lib/sqlGenerator'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'

type JoinType = 'INNER' | 'LEFT' | 'RIGHT'

interface JoinCondition {
  leftCol: string
  rightCol: string
}

interface JoinDef {
  type: JoinType
  conditions: JoinCondition[]
}

interface JoinQueryModalProps {
  open: boolean
  onClose: () => void
  connectionId: string
  schema?: string
  dbType?: DatabaseType
  tables: string[]
}

function resolveCondition(
  leftTable: string,
  rightTable: string,
  columns: Record<string, ColumnResponse[]>,
  fks: Record<string, ForeignKeyResponse[]>,
): JoinCondition | null {
  const leftCols = columns[leftTable] ?? []
  const rightCols = columns[rightTable] ?? []
  if (leftCols.length === 0 || rightCols.length === 0) return null

  const fk = (fks[leftTable] ?? []).find((f) => f.referencedTable === rightTable)
    ?? (fks[rightTable] ?? []).find((f) => f.referencedTable === leftTable)
  if (fk) {
    const fromLeft = (fks[leftTable] ?? []).includes(fk)
    return fromLeft
      ? { leftCol: fk.columnName, rightCol: fk.referencedColumn }
      : { leftCol: fk.referencedColumn, rightCol: fk.columnName }
  }

  const leftPk = leftCols.find((c) => c.isPrimaryKey) ?? leftCols[0]
  const rightPk = rightCols.find((c) => c.isPrimaryKey) ?? rightCols[0]
  return { leftCol: leftPk.name, rightCol: rightPk.name }
}

export function JoinQueryModal({ open, onClose, connectionId, schema, dbType, tables }: JoinQueryModalProps) {
  const navigate = useNavigate()
  const openTab = useAppStore((s) => s.openTab)
  const [columnsByTable, setColumnsByTable] = useState<Record<string, ColumnResponse[]>>({})
  const [fksByTable, setFksByTable] = useState<Record<string, ForeignKeyResponse[]>>({})
  const [loading, setLoading] = useState(true)
  const [joins, setJoins] = useState<JoinDef[]>([])

  // Scope key: when the modal opens with a different set of tables/schema, reset
  // the local state (allowed React pattern: adjusting state during render).
  const scopeKey = open ? `${connectionId}|${schema ?? ''}|${tables.join('\u0001')}` : ''
  const [scopeState, setScopeState] = useState(scopeKey)
  if (scopeState !== scopeKey) {
    setScopeState(scopeKey)
    setColumnsByTable({})
    setFksByTable({})
    setJoins([])
    setLoading(true)
  }

  useEffect(() => {
    if (!open || tables.length < 2) return
    let cancelled = false

    Promise.all([
      Promise.all(tables.map((t) => schemaService.getColumns(connectionId, t, schema).catch(() => [] as ColumnResponse[]))),
      Promise.all(tables.map((t) => schemaService.getForeignKeys(connectionId, t, schema).catch(() => [] as ForeignKeyResponse[]))),
    ])
      .then(([colsRes, fksRes]) => {
        if (cancelled) return
        const cols: Record<string, ColumnResponse[]> = {}
        const fks: Record<string, ForeignKeyResponse[]> = {}
        tables.forEach((t, i) => {
          cols[t] = colsRes[i]
          fks[t] = fksRes[i]
        })
        setColumnsByTable(cols)
        setFksByTable(fks)
        setJoins(tables.slice(0, -1).map((leftTable, i) => {
          const rightTable = tables[i + 1]
          const condition = resolveCondition(leftTable, rightTable, cols, fks)
          return {
            type: 'INNER' as JoinType,
            conditions: condition ? [condition] : [],
          }
        }))
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Failed to load columns for the selected tables')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, scopeKey, connectionId, schema, tables])

  const sql = useMemo(() => {
    if (tables.length === 0) return ''
    const parts = [quoteTableName(tables[0], dbType)]
    joins.forEach((join, i) => {
      const leftTable = tables[i]
      const rightTable = tables[i + 1]
      const on = join.conditions
        .filter((c) => c.leftCol && c.rightCol)
        .map((c) => `${quoteIdent(leftTable, dbType)}.${quoteIdent(c.leftCol, dbType)} = ${quoteIdent(rightTable, dbType)}.${quoteIdent(c.rightCol, dbType)}`)
        .join(' AND ')
      parts.push(`${join.type} JOIN ${quoteTableName(rightTable, dbType)}${on ? ` ON ${on}` : ''}`)
    })
    return `SELECT * FROM ${parts.join(' ')};`
  }, [tables, joins, dbType])

  const updateJoin = (index: number, patch: Partial<JoinDef>) => {
    setJoins((prev) => prev.map((j, i) => (i === index ? { ...j, ...patch } : j)))
  }

  const updateCondition = (joinIndex: number, condIndex: number, patch: Partial<JoinCondition>) => {
    setJoins((prev) => prev.map((j, i) => i !== joinIndex ? j : {
      ...j,
      conditions: j.conditions.map((c, ci) => (ci === condIndex ? { ...c, ...patch } : c)),
    }))
  }

  const addCondition = (joinIndex: number) => {
    const leftTable = tables[joinIndex]
    const rightTable = tables[joinIndex + 1]
    const condition = resolveCondition(leftTable, rightTable, columnsByTable, fksByTable)
    setJoins((prev) => prev.map((j, i) => i !== joinIndex ? j : {
      ...j,
      conditions: [...j.conditions, condition ?? { leftCol: '', rightCol: '' }],
    }))
  }

  const removeCondition = (joinIndex: number, condIndex: number) => {
    setJoins((prev) => prev.map((j, i) => i !== joinIndex ? j : {
      ...j,
      conditions: j.conditions.filter((_, ci) => ci !== condIndex),
    }))
  }

  const handleSend = () => {
    if (!sql) return
    openTab(`JOIN ${tables.join('_')}`, sql, connectionId)
    onClose()
    navigate('/query')
  }

  const columnOptions = (table: string) =>
    (columnsByTable[table] ?? []).map((c) => (
      <option key={c.name} value={c.name}>
        {c.name} ({c.type})
      </option>
    ))

  return (
    <Dialog open={open} onClose={onClose} title={`Build JOIN query — ${tables.length} tables`} size="lg">
      <DialogBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {tables.map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="px-2 py-1 rounded-md bg-muted/40 border border-border text-xs font-mono">
                <span className="text-primary font-bold mr-1">t{i + 1}</span>
                {t}
              </span>
              {i < tables.length - 1 && <span className="text-muted-foreground text-xs">JOIN</span>}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading columns...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {joins.map((join, i) => {
              const leftTable = tables[i]
              const rightTable = tables[i + 1]
              return (
                <div key={`${leftTable}-${rightTable}`} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground">
                      t{i + 1} ({leftTable}) <span className="text-primary font-bold">{join.type}</span> JOIN t{i + 2} ({rightTable})
                    </span>
                    <select
                      value={join.type}
                      onChange={(e) => updateJoin(i, { type: e.target.value as JoinType })}
                      className="ml-auto bg-muted/50 border border-border rounded-none px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="INNER">INNER</option>
                      <option value="LEFT">LEFT</option>
                      <option value="RIGHT">RIGHT</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    {join.conditions.map((cond, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        {ci > 0 && <span className="text-[var(--ch-text-10)] text-muted-foreground text-xs font-bold w-8 shrink-0">AND</span>}
                        <span className="text-xs font-mono text-primary shrink-0 w-10">t{i + 1}.</span>
                        <select
                          value={cond.leftCol}
                          onChange={(e) => updateCondition(i, ci, { leftCol: e.target.value })}
                          className="flex-1 min-w-0 bg-muted/50 border border-border rounded-none px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        >
                          <option value="">— column —</option>
                          {columnOptions(leftTable)}
                        </select>
                        <span className="text-muted-foreground text-xs shrink-0">=</span>
                        <span className="text-xs font-mono text-primary shrink-0 w-10">t{i + 2}.</span>
                        <select
                          value={cond.rightCol}
                          onChange={(e) => updateCondition(i, ci, { rightCol: e.target.value })}
                          className="flex-1 min-w-0 bg-muted/50 border border-border rounded-none px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        >
                          <option value="">— column —</option>
                          {columnOptions(rightTable)}
                        </select>
                        {join.conditions.length > 1 && (
                          <button
                            onClick={() => removeCondition(i, ci)}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            title="Remove condition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addCondition(i)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add ON condition
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div>
          <div className="text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-wider text-xs font-bold mb-1.5">SQL Preview</div>
          <pre className={cn(
            'bg-muted/40 border border-border rounded-md p-3 text-xs font-mono overflow-auto max-h-44 whitespace-pre-wrap text-foreground',
            loading && 'opacity-50',
          )}>
            {sql || '—'}
          </pre>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSend} disabled={loading || !sql}>
          Send to Editor
        </Button>
      </DialogFooter>
    </Dialog>
  )
}