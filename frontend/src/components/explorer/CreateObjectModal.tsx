import { useState, useCallback, useMemo } from 'react'
import { Play, Loader2, Plus, Trash2, Code } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DatabaseObjectType, DatabaseType } from '@/types/database'
import { tauriApi } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { SqlCodeEditor } from '@/components/editor/SqlCodeEditor'

interface CreateObjectModalProps {
  open: boolean
  onClose: () => void
  objectType: DatabaseObjectType
  schema?: string
  dbType?: DatabaseType
  connectionId?: string
  onCreated: () => void
}

interface ColumnDef {
  name: string
  type: string
  isNullable: boolean
  isPrimaryKey: boolean
  defaultValue: string
  comment: string
}

const COMMON_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR(255)', 'CHAR(36)', 'TEXT', 'LONGTEXT',
  'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
  'BOOLEAN',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'JSON', 'BLOB',
]

const defaultColumn = (): ColumnDef => ({
  name: '', type: 'INT', isNullable: false, isPrimaryKey: false, defaultValue: '', comment: '',
})

function getTitle(type: DatabaseObjectType): string {
  switch (type) {
    case DatabaseObjectType.TABLE: return 'Create Table'
    case DatabaseObjectType.VIEW: return 'Create View'
    case DatabaseObjectType.PROCEDURE: return 'Create Procedure'
    case DatabaseObjectType.TRIGGER: return 'Create Trigger'
    case DatabaseObjectType.FUNCTION: return 'Create Function'
  }
}

function typeLabel(type: DatabaseObjectType): string {
  switch (type) {
    case DatabaseObjectType.TABLE: return 'table'
    case DatabaseObjectType.VIEW: return 'view'
    case DatabaseObjectType.PROCEDURE: return 'procedure'
    case DatabaseObjectType.TRIGGER: return 'trigger'
    case DatabaseObjectType.FUNCTION: return 'function'
  }
}

export function CreateObjectModal({ open, onClose, objectType, schema, dbType, connectionId, onCreated }: CreateObjectModalProps) {
  const [tab, setTab] = useState<'form' | 'sql'>('form')
  const [name, setName] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>([defaultColumn()])
  const [viewQuery, setViewQuery] = useState('')
  const [body, setBody] = useState('')
  const [triggerTiming, setTriggerTiming] = useState<'BEFORE' | 'AFTER'>('BEFORE')
  const [triggerEvent, setTriggerEvent] = useState<'INSERT' | 'UPDATE' | 'DELETE'>('INSERT')
  const [triggerTable, setTriggerTable] = useState('')
  const [returnType, setReturnType] = useState('INT')
  const [params, setParams] = useState('')
  const [executing, setExecuting] = useState(false)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const targetConnectionId = connectionId ?? activeConnection?.id
  const storeEditorFontFamily = useAppStore((s) => s.editorFontFamily)
  const storeEditorFontSize = useAppStore((s) => s.uiFontSize)
  const storeEditorLineHeight = useAppStore((s) => s.editorLineHeight)
  const storeEditorTabSize = useAppStore((s) => s.editorTabSize)

  const prefix = schema ? `${schema}.` : ''

  const buildTableSql = useCallback((tblName: string, cols: ColumnDef[]): string => {
    if (!tblName.trim() || cols.every(c => !c.name.trim())) return ''
    const colDefs = cols.filter(c => c.name.trim()).map(col => {
      const nullable = col.isNullable ? '' : 'NOT NULL'
      const pk = col.isPrimaryKey ? 'PRIMARY KEY' : ''
      const def = col.defaultValue ? `DEFAULT ${col.defaultValue}` : ''
      const comment = col.comment ? `COMMENT '${col.comment.replace(/'/g, "\\'")}'` : ''
      return `  \`${col.name}\` ${col.type} ${nullable} ${pk} ${def} ${comment}`.replace(/\s+/g, ' ').trim()
    })
    return `CREATE TABLE ${prefix}${tblName} (\n${colDefs.join(',\n')}\n);`
  }, [prefix])

  const buildViewSql = useCallback((viewName: string, query: string): string => {
    if (!viewName.trim() || !query.trim()) return ''
    return `CREATE VIEW ${prefix}${viewName} AS\n${query}`
  }, [prefix])

  const buildProcedureSql = useCallback((procName: string, procParams: string, procBody: string): string => {
    if (!procName.trim()) return ''
    const paramsClause = procParams ? `(${procParams})` : '()'
    return `CREATE PROCEDURE ${prefix}${procName}${paramsClause}\nBEGIN\n${procBody || '  SELECT 1;'}\nEND;`
  }, [prefix])

  const buildTriggerSql = useCallback((trgName: string, timing: string, event: string, tbl: string, trgBody: string): string => {
    if (!trgName.trim() || !tbl.trim()) return ''
    return `CREATE TRIGGER ${prefix}${trgName}\n${timing} ${event} ON ${prefix}${tbl}\nFOR EACH ROW\nBEGIN\n${trgBody || '  -- trigger body'}\nEND;`
  }, [prefix])

  const buildFunctionSql = useCallback((funcName: string, funcParams: string, retType: string, funcBody: string): string => {
    if (!funcName.trim()) return ''
    const paramsClause = funcParams ? `(${funcParams})` : '()'
    return `CREATE FUNCTION ${prefix}${funcName}${paramsClause}\nRETURNS ${retType}\nDETERMINISTIC\nBEGIN\n${funcBody || '  RETURN NULL;'}\nEND;`
  }, [prefix])

  const generatedSql = useMemo(() => {
    switch (objectType) {
      case DatabaseObjectType.TABLE: return buildTableSql(name, columns)
      case DatabaseObjectType.VIEW: return buildViewSql(name, viewQuery)
      case DatabaseObjectType.PROCEDURE: return buildProcedureSql(name, params, body)
      case DatabaseObjectType.TRIGGER: return buildTriggerSql(name, triggerTiming, triggerEvent, triggerTable, body)
      case DatabaseObjectType.FUNCTION: return buildFunctionSql(name, params, returnType, body)
    }
  }, [objectType, name, columns, viewQuery, body, triggerTiming, triggerEvent, triggerTable, returnType, params,
      buildTableSql, buildViewSql, buildProcedureSql, buildTriggerSql, buildFunctionSql])

  const [sqlOverride, setSqlOverride] = useState('')

  const currentSql = sqlOverride || generatedSql

  const handleNameChange = useCallback((val: string) => {
    setName(val)
    setSqlOverride('')
  }, [])

  const updateColumn = useCallback((index: number, field: keyof ColumnDef, value: string | boolean) => {
    setColumns(prev => prev.map((col, i) => i === index ? { ...col, [field]: value } : col))
    setSqlOverride('')
  }, [])

  const addColumn = useCallback(() => {
    setColumns(prev => [...prev, defaultColumn()])
  }, [])

  const removeColumn = useCallback((index: number) => {
    setColumns(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }, [])

  const handleExecute = useCallback(async () => {
    if (!targetConnectionId || !currentSql.trim()) return
    setExecuting(true)
    try {
      await tauriApi.invoke('execute_query', {
        id: targetConnectionId,
        query: currentSql.trim(),
        schema: schema || null,
      })
      toast.success(`${typeLabel(objectType)} "${name}" created successfully`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create object')
    } finally {
      setExecuting(false)
    }
  }, [targetConnectionId, currentSql, schema, name, objectType, onCreated, onClose])

  const title = getTitle(objectType)

  const language = useMemo(() => {
    if (dbType === DatabaseType.POSTGRES) return 'pgsql'
    if (dbType === DatabaseType.SQLSERVER) return 'tsql'
    return 'sql'
  }, [dbType])

  const isTable = objectType === DatabaseObjectType.TABLE
  const isView = objectType === DatabaseObjectType.VIEW
  const isProcedure = objectType === DatabaseObjectType.PROCEDURE
  const isTrigger = objectType === DatabaseObjectType.TRIGGER
  const isFunction = objectType === DatabaseObjectType.FUNCTION

  const tabs = useMemo(() => {
    if (isView) return [{ id: 'form' as const, label: 'Query' }, { id: 'sql' as const, label: 'SQL' }]
    return [{ id: 'form' as const, label: 'Form' }, { id: 'sql' as const, label: 'SQL' }]
  }, [isView])

  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <DialogBody className="space-y-4">
        <div className="flex gap-4 border-b border-border pb-3">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors',
                tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'form' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={`Enter ${typeLabel(objectType)} name...`}
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            {isTable && (
              <div className="space-y-2">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Columns</label>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {columns.map((col, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 border border-border rounded-md bg-muted/20">
                      <div className="flex-1 grid grid-cols-12 gap-2">
                        <div className="col-span-3 space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
                          <input
                            value={col.name}
                            onChange={(e) => updateColumn(i, 'name', e.target.value)}
                            placeholder="column_name"
                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
                          <select
                            value={col.type}
                            onChange={(e) => updateColumn(i, 'type', e.target.value)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                          >
                            {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 space-y-1 flex flex-col items-center">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PK</label>
                          <input
                            type="checkbox"
                            checked={col.isPrimaryKey}
                            onChange={(e) => updateColumn(i, 'isPrimaryKey', e.target.checked)}
                            className="mt-1.5 rounded border-border text-primary focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-1 space-y-1 flex flex-col items-center">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Null</label>
                          <input
                            type="checkbox"
                            checked={col.isNullable}
                            onChange={(e) => updateColumn(i, 'isNullable', e.target.checked)}
                            className="mt-1.5 rounded border-border text-primary focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default</label>
                          <input
                            value={col.defaultValue}
                            onChange={(e) => updateColumn(i, 'defaultValue', e.target.value)}
                            placeholder="NULL"
                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Comment</label>
                          <input
                            value={col.comment}
                            onChange={(e) => updateColumn(i, 'comment', e.target.value)}
                            placeholder="-"
                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeColumn(i)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors mt-5"
                        disabled={columns.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addColumn}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Column
                </button>
              </div>
            )}

            {isView && (
              <div className="space-y-1.5">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">SELECT Query</label>
                <textarea
                  value={viewQuery}
                  onChange={(e) => { setViewQuery(e.target.value); setSqlOverride('') }}
                  placeholder={`SELECT * FROM ${prefix}your_table`}
                  rows={8}
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>
            )}

            {isTrigger && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Timing</label>
                  <select
                    value={triggerTiming}
                    onChange={(e) => { setTriggerTiming(e.target.value as 'BEFORE' | 'AFTER'); setSqlOverride('') }}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="BEFORE">BEFORE</option>
                    <option value="AFTER">AFTER</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Event</label>
                  <select
                    value={triggerEvent}
                    onChange={(e) => { setTriggerEvent(e.target.value as 'INSERT' | 'UPDATE' | 'DELETE'); setSqlOverride('') }}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">On Table</label>
                  <input
                    value={triggerTable}
                    onChange={(e) => { setTriggerTable(e.target.value); setSqlOverride('') }}
                    placeholder="table_name"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
            )}

            {isFunction && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Returns</label>
                  <input
                    value={returnType}
                    onChange={(e) => { setReturnType(e.target.value); setSqlOverride('') }}
                    placeholder="INT"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
            )}

            {(isProcedure || isFunction) && (
              <div className="space-y-1.5">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Parameters</label>
                <input
                  value={params}
                  onChange={(e) => { setParams(e.target.value); setSqlOverride('') }}
                  placeholder="e.g. p_id INT, p_name VARCHAR(255)"
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            )}

            {(isProcedure || isTrigger || isFunction) && (
              <div className="space-y-1.5">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Body</label>
                <div className="h-[200px] border border-border rounded-md overflow-hidden">
                  <SqlCodeEditor
                    value={body}
                    language={language}
                    onChange={(val) => { setBody(val || ''); setSqlOverride('') }}
                    options={{
                      fontSize: storeEditorFontSize,
                      fontFamily: storeEditorFontFamily,
                      lineHeight: storeEditorLineHeight,
                      tabSize: storeEditorTabSize,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code className="w-3 h-3" />
              SQL Definition
            </label>
            <div className="h-[400px] border border-border rounded-md overflow-hidden">
              <SqlCodeEditor
                value={currentSql}
                language={language}
                onChange={(val) => setSqlOverride(val || '')}
                options={{
                  fontSize: storeEditorFontSize,
                  fontFamily: storeEditorFontFamily,
                  lineHeight: storeEditorLineHeight,
                  tabSize: storeEditorTabSize,
                  paddingTop: 16,
                }}
              />
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleExecute}
          disabled={executing || !currentSql.trim() || !name.trim()}
        >
          {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {executing ? 'Executing...' : 'Execute'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
