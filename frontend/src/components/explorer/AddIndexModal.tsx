import { useState, useCallback } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { tauriApi } from '@/lib/api'
import { toast } from 'react-hot-toast'

const INDEX_TYPES = ['BTREE', 'HASH', 'FULLTEXT', 'SPATIAL']

interface AddIndexModalProps {
  open: boolean
  onClose: () => void
  tableName: string
  schema?: string
  connectionId: string
  availableColumns: string[]
  onCreated: () => void
}

export function AddIndexModal({ open, onClose, tableName, schema, connectionId, availableColumns, onCreated }: AddIndexModalProps) {
  const [name, setName] = useState('')
  const [columns, setColumns] = useState<string[]>([''])
  const [unique, setUnique] = useState(false)
  const [indexType, setIndexType] = useState('')
  const [executing, setExecuting] = useState(false)

  const buildSql = useCallback((): string => {
    const cols = columns.filter(c => c.trim())
    if (!name.trim() || cols.length === 0) return ''
    const uniqueClause = unique ? 'UNIQUE ' : ''
    const typeClause = indexType ? ` USING ${indexType}` : ''
    const colsClause = cols.map(c => `\`${c.trim()}\``).join(', ')
    return `CREATE ${uniqueClause}INDEX \`${name}\` ON \`${tableName}\`${typeClause} (${colsClause});`
  }, [name, columns, unique, indexType, tableName])

  const handleExecute = useCallback(async () => {
    const sql = buildSql()
    if (!sql) return
    setExecuting(true)
    try {
      await tauriApi.invoke('execute_query', {
        id: connectionId,
        query: sql,
        schema: schema || null,
      })
      toast.success(`Index "${name}" created on "${tableName}"`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create index')
    } finally {
      setExecuting(false)
    }
  }, [buildSql, connectionId, schema, name, tableName, onCreated, onClose])

  const sql = buildSql()

  return (
    <Dialog open={open} onClose={onClose} title={`Create Index on ${tableName}`} size="md">
      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Index Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="idx_table_column"
            className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Columns</label>
          <div className="space-y-2">
            {columns.map((col, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={col}
                  onChange={(e) => setColumns(prev => prev.map((c, j) => j === i ? e.target.value : c))}
                  className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">Select column...</option>
                  {availableColumns.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {columns.length > 1 && (
                  <button
                    onClick={() => setColumns(prev => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-xs px-1"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setColumns(prev => [...prev, ''])}
            className="text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
          >
            + Add Column
          </button>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="index-unique"
              checked={unique}
              onChange={(e) => setUnique(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="index-unique" className="text-sm text-foreground">Unique</label>
          </div>
          <div className="space-y-1 flex-1">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Type (optional)</label>
            <select
              value={indexType}
              onChange={(e) => setIndexType(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">Default</option>
              {INDEX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {sql && (
          <div className="space-y-1">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">SQL Preview</label>
            <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">{sql}</pre>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleExecute} disabled={executing || !name.trim() || columns.every(c => !c.trim())}>
          {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {executing ? 'Executing...' : 'Execute'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
