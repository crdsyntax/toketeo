import { useState, useCallback } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { tauriApi } from '@/lib/api'
import { toast } from 'react-hot-toast'

const FK_ACTIONS = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']

interface AddForeignKeyModalProps {
  open: boolean
  onClose: () => void
  tableName: string
  schema?: string
  connectionId: string
  availableColumns: string[]
  onCreated: () => void
}

export function AddForeignKeyModal({ open, onClose, tableName, schema, connectionId, availableColumns, onCreated }: AddForeignKeyModalProps) {
  const [constraintName, setConstraintName] = useState('')
  const [column, setColumn] = useState('')
  const [refTable, setRefTable] = useState('')
  const [refColumn, setRefColumn] = useState('')
  const [onDelete, setOnDelete] = useState('')
  const [onUpdate, setOnUpdate] = useState('')
  const [executing, setExecuting] = useState(false)

  const buildSql = useCallback((): string => {
    if (!column.trim() || !refTable.trim() || !refColumn.trim()) return ''
    const nameClause = constraintName.trim() ? `CONSTRAINT \`${constraintName.trim()}\` ` : ''
    const deleteClause = onDelete ? ` ON DELETE ${onDelete}` : ''
    const updateClause = onUpdate ? ` ON UPDATE ${onUpdate}` : ''
    return `ALTER TABLE \`${tableName}\` ADD ${nameClause}FOREIGN KEY (\`${column.trim()}\`) REFERENCES \`${refTable.trim()}\` (\`${refColumn.trim()}\`)${deleteClause}${updateClause};`
  }, [constraintName, column, refTable, refColumn, onDelete, onUpdate, tableName])

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
      toast.success(`Foreign key "${constraintName || column}" created on "${tableName}"`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create foreign key')
    } finally {
      setExecuting(false)
    }
  }, [buildSql, connectionId, schema, constraintName, column, tableName, onCreated, onClose])

  const sql = buildSql()

  return (
    <Dialog open={open} onClose={onClose} title={`Add Foreign Key to ${tableName}`} size="md">
      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Constraint Name (optional)</label>
          <input
            value={constraintName}
            onChange={(e) => setConstraintName(e.target.value)}
            placeholder="fk_table_ref_table"
            className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Column</label>
            <select
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">Select column...</option>
              {availableColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Referenced Table</label>
            <input
              value={refTable}
              onChange={(e) => setRefTable(e.target.value)}
              placeholder="target_table"
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Referenced Column</label>
            <input
              value={refColumn}
              onChange={(e) => setRefColumn(e.target.value)}
              placeholder="id"
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">On Delete</label>
            <select
              value={onDelete}
              onChange={(e) => setOnDelete(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">Default</option>
              {FK_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">On Update</label>
            <select
              value={onUpdate}
              onChange={(e) => setOnUpdate(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">Default</option>
              {FK_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
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
        <Button variant="primary" onClick={handleExecute} disabled={executing || !column.trim() || !refTable.trim() || !refColumn.trim()}>
          {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {executing ? 'Executing...' : 'Execute'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
