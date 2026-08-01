import { useState, useCallback } from 'react'
import { Play, Loader2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { tauriApi } from '@/lib/api'
import { toast } from 'react-hot-toast'

interface ColumnDef {
  name: string
  type: string
  isNullable: boolean
  isPrimaryKey: boolean
  defaultValue: string
}

const COMMON_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR(255)', 'CHAR(36)', 'TEXT', 'LONGTEXT',
  'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
  'BOOLEAN',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'JSON', 'BLOB',
]

interface AddColumnModalProps {
  open: boolean
  onClose: () => void
  tableName: string
  schema?: string
  connectionId: string
  onCreated: () => void
}

export function AddColumnModal({ open, onClose, tableName, schema, connectionId, onCreated }: AddColumnModalProps) {
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: '', type: 'INT', isNullable: false, isPrimaryKey: false, defaultValue: '' },
  ])
  const [executing, setExecuting] = useState(false)
  const [generatedSql, setGeneratedSql] = useState('')

  const buildSql = useCallback((cols: ColumnDef[]): string => {
    const parts = cols.map(col => {
      const name = `\`${col.name}\``
      const nullable = col.isNullable ? '' : 'NOT NULL'
      const pk = col.isPrimaryKey ? 'PRIMARY KEY' : ''
      const def = col.defaultValue ? `DEFAULT ${col.defaultValue}` : ''
      return `  ${name} ${col.type} ${nullable} ${pk} ${def}`.replace(/\s+/g, ' ').trim()
    })
    const stmts = cols.map(col => {
      const name = `\`${col.name}\``
      const nullable = col.isNullable ? '' : 'NOT NULL'
      const pk = col.isPrimaryKey ? 'PRIMARY KEY' : ''
      const def = col.defaultValue ? `DEFAULT ${col.defaultValue}` : ''
      return `ALTER TABLE \`${tableName}\` ADD COLUMN ${name} ${col.type} ${nullable} ${pk} ${def};`.replace(/\s+/g, ' ').trim()
    })
    setGeneratedSql(stmts.join('\n'))
    return stmts.join('\n')
  }, [tableName])

  const updateColumn = useCallback((index: number, field: keyof ColumnDef, value: string | boolean) => {
    setColumns(prev => {
      const next = prev.map((col, i) => i === index ? { ...col, [field]: value } : col)
      buildSql(next)
      return next
    })
  }, [buildSql])

  const addColumn = useCallback(() => {
    setColumns(prev => [...prev, { name: '', type: 'INT', isNullable: false, isPrimaryKey: false, defaultValue: '' }])
  }, [])

  const removeColumn = useCallback((index: number) => {
    setColumns(prev => {
      const next = prev.filter((_, i) => i !== index)
      buildSql(next)
      return next
    })
  }, [buildSql])

  const handleExecute = useCallback(async () => {
    const sql = buildSql(columns)
    if (!sql.trim()) return
    setExecuting(true)
    try {
      await tauriApi.invoke('execute_query', {
        id: connectionId,
        query: sql.trim(),
        schema: schema || null,
      })
      toast.success(`Column(s) added to "${tableName}"`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add column')
    } finally {
      setExecuting(false)
    }
  }, [buildSql, columns, connectionId, schema, tableName, onCreated, onClose])

  return (
    <Dialog open={open} onClose={onClose} title={`Add Column(s) to ${tableName}`} size="lg">
      <DialogBody className="space-y-4">
        <div className="text-xs text-muted-foreground">Define the columns to add. Each column generates an ALTER TABLE statement.</div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {columns.map((col, i) => (
            <div key={i} className="flex items-start gap-2 p-3 border border-border rounded-md bg-muted/20">
              <div className="flex-1 grid grid-cols-6 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
                  <input
                    value={col.name}
                    onChange={(e) => updateColumn(i, 'name', e.target.value)}
                    placeholder="column_name"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(i, 'type', e.target.value)}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1 flex flex-col items-center">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Nullable</label>
                  <input
                    type="checkbox"
                    checked={col.isNullable}
                    onChange={(e) => updateColumn(i, 'isNullable', e.target.checked)}
                    className="mt-1.5 rounded border-border text-primary focus:ring-primary"
                  />
                </div>
                <div className="space-y-1 flex flex-col items-center">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">PK</label>
                  <input
                    type="checkbox"
                    checked={col.isPrimaryKey}
                    onChange={(e) => updateColumn(i, 'isPrimaryKey', e.target.checked)}
                    className="mt-1.5 rounded border-border text-primary focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Default</label>
                  <input
                    value={col.defaultValue}
                    onChange={(e) => updateColumn(i, 'defaultValue', e.target.value)}
                    placeholder="NULL"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              {columns.length > 1 && (
                <button
                  onClick={() => removeColumn(i)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors mt-5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addColumn}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Another Column
        </button>

        {generatedSql && (
          <div className="space-y-1">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">SQL Preview</label>
            <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {generatedSql}
            </pre>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleExecute}
          disabled={executing || !columns.some(c => c.name.trim())}
        >
          {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {executing ? 'Executing...' : 'Execute'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
