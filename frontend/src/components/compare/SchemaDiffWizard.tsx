import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Minus, ChevronLeft, ChevronRight, Database, Table2, Eye, GitBranch, Activity, FileCode, Copy, CheckCircle2, AlertCircle, Loader2, Sparkles, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'
import { compareService } from '@/services/compare.service'
import { schemaService } from '@/services/schema.service'
import type { Connection } from '@/types/database'
import type { SchemaReport, ScriptStatement } from '@/types/compare'

interface SchemaDiffWizardProps {
  open: boolean
  onClose: () => void
  connections: Connection[]
}

type Step = 'configure' | 'compare' | 'script'
type WindowState = 'normal' | 'minimized'

const OBJECT_TYPES = [
  { key: 'tables', label: 'Tables', icon: Table2 },
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'procedures', label: 'Procedures', icon: GitBranch },
  { key: 'functions', label: 'Functions', icon: Activity },
  { key: 'triggers', label: 'Triggers', icon: Activity },
] as const

export function SchemaDiffWizard({ open, onClose, connections }: SchemaDiffWizardProps) {
  const [windowState, setWindowState] = useState<WindowState>('normal')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragOrigPos = useRef({ x: 0, y: 0 })
  const wizardRef = useRef<HTMLDivElement>(null)
  const zIndex = useRef(300)

  const bringToFront = useCallback(() => {
    zIndex.current = Math.max(zIndex.current, 300)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPos({ x: dragOrigPos.current.x + dx, y: dragOrigPos.current.y + dy })
    }
    const handleMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [])

  const handleTitlePointerDown = useCallback((e: React.PointerEvent) => {
    bringToFront()
    if (windowState !== 'normal') return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragOrigPos.current = pos || { x: 0, y: 0 }
  }, [windowState, pos, bringToFront])

  const [step, setStep] = useState<Step>('configure')
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [sourceSchema, setSourceSchema] = useState('')
  const [targetSchema, setTargetSchema] = useState('')
  const [objectTypes, setObjectTypes] = useState<string[]>(['tables', 'views', 'procedures', 'functions', 'triggers'])
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const [comparing, setComparing] = useState(false)
  const [report, setReport] = useState<SchemaReport | null>(null)
  const [generating, setGenerating] = useState(false)
  const [script, setScript] = useState<ScriptStatement[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) { setWindowState('normal'); setPos(null); setStep('configure'); setReport(null); setScript([]); setError(null) }
  }, [open])

  const toggleObjectType = (key: string) => {
    setObjectTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const countMissing = (report: SchemaReport): number => {
    let count = 0
    for (const obj of [...report.tables, ...report.views, ...report.procedures, ...report.functions, ...report.triggers]) {
      if (obj.status === 'missing') count++
    }
    count += report.indexes.filter(i => i.status === 'missing').length
    count += report.foreign_keys.filter(fk => fk.status === 'missing').length
    count += report.constraints.filter(c => c.status === 'missing').length
    return count
  }

  const handleCompare = async () => {
    if (!sourceId || !targetId) return
    setError(null)
    setComparing(true)
    setReport(null)
    setScript([])
    try {
      const params: Record<string, unknown> = {
        sourceConnId: sourceId,
        targetConnId: targetId,
        sourceSchema: sourceSchema || undefined,
        targetSchema: targetSchema || undefined,
      }
      if (!objectTypes.includes('tables')) params.tables = []
      else if (selectedTables.length > 0) params.tables = selectedTables
      if (!objectTypes.includes('views')) params.views = []
      if (!objectTypes.includes('procedures')) params.procedures = []
      if (!objectTypes.includes('functions')) params.functions = []
      if (!objectTypes.includes('triggers')) params.triggers = []

      const result = await compareService.compareSchemas(params as any)
      setReport(result)
      setStep('compare')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed')
    } finally {
      setComparing(false)
    }
  }

  const handleGenerateScript = async () => {
    if (!report) return
    setError(null)
    setGenerating(true)
    try {
      const targetConn = connections?.find(c => c.id === targetId)
      const targetDbType = targetConn?.type || 'mysql'
      const result = await compareService.generateScript({
        schemaReport: report,
        targetDbType,
        options: {
          include_creates: true,
          include_alters: false,
          include_drops: false,
          include_indexes: objectTypes.includes('tables'),
          include_constraints: objectTypes.includes('tables'),
          include_views: objectTypes.includes('views'),
          include_routines: objectTypes.includes('procedures') || objectTypes.includes('functions'),
          wrap_in_transaction: true,
          data_preservation: false,
          drop_target_extras: false,
        },
      })
      setScript(result.statements.filter(s => s.selected))
      setStep('script')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const fullScript = script.map(s => s.sql).join('\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(fullScript).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  if (!open) return null

  return (
    <>
      {/* Minimized bar */}
      {windowState === 'minimized' && (
        <div
          className="fixed bottom-0 right-4 z-[300] flex items-center gap-2 px-3 py-2 bg-surface border border-border border-b-0 rounded-t-lg shadow-lg cursor-pointer hover:bg-muted/50 transition-colors select-none"
          onClick={() => setWindowState('normal')}
        >
          <GitBranch className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Schema Diff Wizard</span>
          <span className="text-[var(--ch-text-9)] text-muted-foreground ml-1">
            {step === 'script' ? `${script.length} stmts` : step === 'compare' && report ? `${countMissing(report)} missing` : 'Configure'}
          </span>
          <button onClick={(e) => { e.stopPropagation(); onClose() }} className="p-0.5 rounded hover:bg-muted text-muted-foreground ml-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Main dialog */}
      {windowState !== 'minimized' && (
        <div
          ref={wizardRef}
          className="fixed inset-0 z-[300] pointer-events-none"
        >
          <div
            className={cn(
              'absolute flex flex-col bg-surface border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto transition-none',
              'w-[700px] max-w-[90vw] max-h-[85vh]',
            )}
            style={{
              left: pos ? `${pos.x}px` : '50%',
              top: pos ? `${pos.y}px` : '10%',
              transform: pos ? 'none' : 'translateX(-50%)',
              zIndex: zIndex.current,
            }}
            onClick={bringToFront}
          >
            {/* Header / drag handle */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={handleTitlePointerDown}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">Schema Diff Wizard</span>
                  <p className="text-[var(--ch-text-9)] text-muted-foreground">Find objects in A missing in B and generate migration SQL</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setWindowState('minimized')} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                  <Minus className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-0 px-5 py-2.5 border-b border-border/50 bg-muted/10 shrink-0">
              {(['configure', 'compare', 'script'] as Step[]).map((s, i) => {
                const labels = { configure: '1. Configure', compare: '2. Review', script: '3. Script' }
                const isActive = step === s
                const isDone = (step === 'compare' && s === 'configure') || (step === 'script' && (s === 'configure' || s === 'compare'))
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : isDone ? 'text-emerald-500' : 'text-muted-foreground/50',
                    )}>
                      {isDone ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 flex items-center justify-center text-[var(--ch-text-9)]">{i + 1}</span>}
                      {labels[s]}
                    </div>
                    {i < 2 && <div className="w-6 h-px bg-border/60" />}
                  </div>
                )
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {step === 'configure' && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Select source (A) and target (B) databases. The wizard will find schema objects that exist in A but are missing in B, and generate SQL to add them.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <ConnectionSchemaSelector
                      label="Source (A)"
                      connections={connections}
                      connId={sourceId}
                      schema={sourceSchema}
                      onConnChange={setSourceId}
                      onSchemaChange={setSourceSchema}
                    />
                    <ConnectionSchemaSelector
                      label="Target (B)"
                      connections={connections}
                      connId={targetId}
                      schema={targetSchema}
                      onConnChange={setTargetId}
                      onSchemaChange={setTargetSchema}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Object Types to Compare</label>
                    <div className="flex flex-wrap gap-1.5">
                      {OBJECT_TYPES.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => toggleObjectType(key)}
                          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                            objectTypes.includes(key) ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                          )}>
                          <Icon className="w-3 h-3" />{label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {objectTypes.includes('tables') && sourceId && (
                    <TableSelector
                      connId={sourceId}
                      schema={sourceSchema || undefined}
                      selected={selectedTables}
                      onChange={setSelectedTables}
                    />
                  )}
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />{error}
                    </div>
                  )}
                </div>
              )}

              {step === 'compare' && (
                <div className="space-y-4">
                  {comparing ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Comparing schemas...</p>
                    </div>
                  ) : report ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">
                          Missing Objects Found: <span className="text-primary">{countMissing(report)}</span>
                        </span>
                        <button onClick={handleGenerateScript} disabled={generating}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCode className="w-3 h-3" />}
                          Generate Script
                        </button>
                      </div>
                      <MissingObjectsList report={report} objectTypes={objectTypes} />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 opacity-30" />
                      <p className="text-sm">No comparison data. Go back and run the compare.</p>
                    </div>
                  )}
                </div>
              )}

              {step === 'script' && (
                <div className="space-y-4">
                  {generating ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Generating migration script...</p>
                    </div>
                  ) : script.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{script.length}</span> statements generated
                        </span>
                        <button onClick={handleCopy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Copied' : 'Copy All'}
                        </button>
                      </div>
                      <pre className="text-[var(--ch-text-11)] font-mono bg-[#0d1117] border border-[#30363d] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[400px] text-[#e6edf3]">
                        {fullScript}
                      </pre>
                      <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        Review the script carefully before executing against your target database. Some statements may require adjustments depending on your database version and configuration.
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <Sparkles className="w-8 h-8 opacity-30" />
                      <p className="text-sm">No statements generated. All objects may already exist in target.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10 shrink-0">
              <div className="text-[var(--ch-text-9)] text-muted-foreground">
                {step === 'configure' && 'Configure source and target databases'}
                {step === 'compare' && report && `${countMissing(report)} missing objects found`}
                {step === 'script' && `${script.length} SQL statements`}
              </div>
              <div className="flex items-center gap-2">
                {step !== 'configure' && (
                  <button onClick={() => setStep(step === 'compare' ? 'configure' : 'compare')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>
                )}
                {step === 'configure' && (
                  <button onClick={handleCompare} disabled={!sourceId || !targetId || comparing}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-all disabled:opacity-50">
                    {comparing ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitBranch className="w-3 h-3" />}
                    Compare Schemas
                  </button>
                )}
                {step === 'script' && (
                  <button onClick={onClose} className="px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-all">
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ConnectionSchemaSelector({ label, connections, connId, schema, onConnChange, onSchemaChange }: {
  label: string; connections: Connection[]; connId: string; schema: string;
  onConnChange: (id: string) => void; onSchemaChange: (s: string) => void
}) {
  const conn = connections.find(c => c.id === connId)
  const { data: databases = [] } = useQuery({
    queryKey: ['wizard-databases', connId],
    queryFn: () => schemaService.getDatabases(connId),
    enabled: !!connId,
  })
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <select value={connId} onChange={(e) => { onConnChange(e.target.value); onSchemaChange('') }}
        className="w-full h-8 text-xs px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ colorScheme: 'dark' }}>
        <option value="">Select connection</option>
        {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
      </select>
      {conn && (
        <select value={schema} onChange={(e) => onSchemaChange(e.target.value)}
          className="w-full h-8 text-xs px-2 rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ colorScheme: 'dark' }}>
          <option value="">Default schema</option>
          {databases.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  )
}

function TableSelector({ connId, schema, selected, onChange }: {
  connId: string; schema?: string; selected: string[]; onChange: (tables: string[]) => void
}) {
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['wizard-tables', connId, schema],
    queryFn: () => schemaService
      .getTables(connId, schema)
      .then(rows => rows.map(r => r.name)),
    enabled: !!connId,
  })

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter(t => t !== name) : [...selected, name])
  }

  const toggleAll = () => {
    onChange(selected.length === tables.length ? [] : [...tables])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tables</label>
        {tables.length > 0 && (
          <button onClick={toggleAll} className="text-[var(--ch-text-9)] text-primary hover:text-primary/80 text-xs font-medium transition-colors">
            {selected.length === tables.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading tables...
        </div>
      ) : tables.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 italic py-1">No tables found</p>
      ) : (
        <div className="max-h-[160px] overflow-y-auto border border-border rounded-md divide-y divide-border/50">
          {tables.map(t => (
            <label key={t} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/30 cursor-pointer transition-colors text-xs">
              <input
                type="checkbox"
                checked={selected.includes(t)}
                onChange={() => toggle(t)}
                className="rounded border-border accent-primary"
              />
              <span className="font-mono text-foreground truncate">{t}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function MissingObjectsList({ report, objectTypes }: { report: SchemaReport; objectTypes: string[] }) {
  const sections: { key: string; label: string; items: { name: string; status: string }[] }[] = []

  if (objectTypes.includes('tables')) {
    sections.push({ key: 'tables', label: 'Tables', items: report.tables.filter(t => t.status === 'missing').map(t => ({ name: t.name, status: t.status })) })
    sections.push({ key: 'indexes', label: 'Indexes', items: report.indexes.filter(i => i.status === 'missing').map(i => ({ name: `${i.table}.${i.name}`, status: i.status })) })
    sections.push({ key: 'foreign_keys', label: 'Foreign Keys', items: report.foreign_keys.filter(fk => fk.status === 'missing').map(fk => ({ name: `${fk.table}.${fk.name}`, status: fk.status })) })
  }
  if (objectTypes.includes('views')) sections.push({ key: 'views', label: 'Views', items: report.views.filter(v => v.status === 'missing').map(v => ({ name: v.name, status: v.status })) })
  if (objectTypes.includes('procedures')) sections.push({ key: 'procedures', label: 'Procedures', items: report.procedures.filter(p => p.status === 'missing').map(p => ({ name: p.name, status: p.status })) })
  if (objectTypes.includes('functions')) sections.push({ key: 'functions', label: 'Functions', items: report.functions.filter(f => f.status === 'missing').map(f => ({ name: f.name, status: f.status })) })
  if (objectTypes.includes('triggers')) sections.push({ key: 'triggers', label: 'Triggers', items: report.triggers.filter(t => t.status === 'missing').map(t => ({ name: t.name, status: t.status })) })

  const hasAny = sections.some(s => s.items.length > 0)
  if (!hasAny) return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      <p className="text-sm font-medium">All objects match — nothing missing in B</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {sections.map(section => section.items.length > 0 ? (
        <div key={section.key}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{section.label}</span>
            <span className="text-[var(--ch-text-9)] text-muted-foreground">({section.items.length})</span>
          </div>
          <div className="space-y-0.5">
            {section.items.map(item => (
              <div key={item.name} className="flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/8 border border-amber-500/15">
                <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="text-xs font-mono text-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null)}
    </div>
  )
}
