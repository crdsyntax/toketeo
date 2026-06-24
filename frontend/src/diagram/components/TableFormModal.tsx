import { useState } from 'react'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnResponse, ForeignKeyResponse } from '@/types/database'

interface ColumnField {
  id: string
  name: string
  type: string
  isPrimaryKey: boolean
  isNullable: boolean
}

interface ForeignKeyField {
  id: string
  columnName: string
  referencedTable: string
  referencedColumn: string
}

interface TableFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (tableName: string, columns: ColumnResponse[], foreignKeys: ForeignKeyResponse[]) => void
  initialName?: string
  initialColumns?: ColumnResponse[]
  initialForeignKeys?: ForeignKeyResponse[]
}

let fieldIdCounter = 0
const newFieldId = () => `field_${++fieldIdCounter}_${Date.now()}`

const COMMON_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR(255)', 'CHAR(1)', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
  'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
  'BLOB', 'JSON', 'UUID',
]

const COMMON_FK_TYPES = ['INT', 'BIGINT', 'UUID', 'VARCHAR(36)', 'VARCHAR(255)']

export function TableFormModal({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialColumns,
  initialForeignKeys,
}: TableFormModalProps) {
  const [tableName, setTableName] = useState(initialName)
  const [columns, setColumns] = useState<ColumnField[]>(
    initialColumns?.map((c) => ({
      id: newFieldId(),
      name: c.name,
      type: c.type,
      isPrimaryKey: c.isPrimaryKey,
      isNullable: c.isNullable,
    })) ?? [
      { id: newFieldId(), name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
      { id: newFieldId(), name: 'name', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
    ],
  )
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyField[]>(
    initialForeignKeys?.map((fk) => ({
      id: newFieldId(),
      columnName: fk.columnName,
      referencedTable: fk.referencedTable,
      referencedColumn: fk.referencedColumn,
    })) ?? [],
  )

  if (!isOpen) return null

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { id: newFieldId(), name: '', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true },
    ])
  }

  const removeColumn = (id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id))
  }

  const updateColumn = (id: string, field: Partial<ColumnField>) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...field } : c)))
  }

  const addForeignKey = () => {
    setForeignKeys((prev) => [
      ...prev,
      { id: newFieldId(), columnName: '', referencedTable: '', referencedColumn: '' },
    ])
  }

  const removeForeignKey = (id: string) => {
    setForeignKeys((prev) => prev.filter((fk) => fk.id !== id))
  }

  const updateForeignKey = (id: string, field: Partial<ForeignKeyField>) => {
    setForeignKeys((prev) => prev.map((fk) => (fk.id === id ? { ...fk, ...field } : fk)))
  }

  const handleSave = () => {
    if (!tableName.trim()) return
    if (columns.length === 0) return

    const cols: ColumnResponse[] = columns.map((c) => ({
      name: c.name,
      type: c.type,
      isPrimaryKey: c.isPrimaryKey,
      isNullable: c.isNullable,
    }))

    const fks: ForeignKeyResponse[] = foreignKeys
      .filter((fk) => fk.columnName && fk.referencedTable && fk.referencedColumn)
      .map((fk) => ({
        constraintName: `fk_${fk.columnName}`,
        columnName: fk.columnName,
        referencedTable: fk.referencedTable,
        referencedColumn: fk.referencedColumn,
      }))

    onSave(tableName.trim(), cols, fks)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-[520px] max-w-[90vw] max-h-[85vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-sm">{initialName ? 'Edit Table' : 'Add Table'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Table Name
            </label>
            <input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. users"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Columns
              </label>
              <button
                onClick={addColumn}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Column
              </button>
            </div>
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {columns.map((col) => (
                <div key={col.id} className="flex items-center gap-1.5 bg-muted/30 rounded-lg p-1.5">
                  <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                  <input
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                    placeholder="name"
                    className="w-28 bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(col.id, { type: e.target.value })}
                    className="w-28 bg-background border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {COMMON_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <label className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors",
                    col.isPrimaryKey ? "bg-amber-500/10 text-amber-500" : "text-muted-foreground hover:text-foreground",
                  )}>
                    <input
                      type="checkbox"
                      checked={col.isPrimaryKey}
                      onChange={(e) => updateColumn(col.id, { isPrimaryKey: e.target.checked })}
                      className="sr-only"
                    />
                    PK
                  </label>
                  <label className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors",
                    col.isNullable ? "bg-muted text-muted-foreground" : "text-muted-foreground/50",
                  )}>
                    <input
                      type="checkbox"
                      checked={col.isNullable}
                      onChange={(e) => updateColumn(col.id, { isNullable: e.target.checked })}
                      className="sr-only"
                    />
                    NULL
                  </label>
                  <button
                    onClick={() => removeColumn(col.id)}
                    className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors ml-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Foreign Keys
              </label>
              <button
                onClick={addForeignKey}
                className="flex items-center gap-1 text-[10px] font-bold text-sky-500 hover:text-sky-500/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add FK
              </button>
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {foreignKeys.map((fk) => (
                <div key={fk.id} className="flex items-center gap-1.5 bg-muted/30 rounded-lg p-1.5">
                  <input
                    value={fk.columnName}
                    onChange={(e) => updateForeignKey(fk.id, { columnName: e.target.value })}
                    placeholder="column"
                    className="w-24 bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <input
                    value={fk.referencedTable}
                    onChange={(e) => updateForeignKey(fk.id, { referencedTable: e.target.value })}
                    placeholder="ref_table"
                    className="w-24 bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <span className="text-[10px] text-muted-foreground">.</span>
                  <input
                    value={fk.referencedColumn}
                    onChange={(e) => updateForeignKey(fk.id, { referencedColumn: e.target.value })}
                    placeholder="ref_col"
                    className="w-24 bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => removeForeignKey(fk.id)}
                    className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {foreignKeys.length === 0 && (
                <div className="text-[10px] text-muted-foreground/50 italic py-1">No foreign keys defined.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
          >
            {initialName ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
