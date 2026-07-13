import { useState } from 'react'
import { X, GitBranch } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import { useSyncStore } from '@/store/syncStore'
import { Step1Connections } from './Step1Connections'
import { Step2Tables } from './Step2Tables'
import { Step3Preview } from './Step3Preview'
import { Step4Schedule } from './Step4Schedule'
import type { Connection } from '@/types/database'
import type { SyncPipeline, SyncTableConfig, ColumnMapping } from '@/types/sync'
import { SyncMode } from '@/types/sync'

interface SyncWizardProps {
  pipeline?: SyncPipeline | null
  onClose: () => void
}

type WizardStep = 'connections' | 'tables' | 'preview' | 'schedule'

const STEPS: { key: WizardStep; label: string; number: number }[] = [
  { key: 'connections', label: 'Conexiones', number: 1 },
  { key: 'tables', label: 'Tablas', number: 2 },
  { key: 'preview', label: 'Vista previa', number: 3 },
  { key: 'schedule', label: 'Programación', number: 4 },
]

export function SyncWizard({ pipeline, onClose }: SyncWizardProps) {
  const savePipeline = useSyncStore((s) => s.savePipeline)

  const [step, setStep] = useState<WizardStep>('connections')
  const [name, setName] = useState(pipeline?.name ?? '')
  const [sourceId, setSourceId] = useState(pipeline?.source_connection_id ?? '')
  const [targetId, setTargetId] = useState(pipeline?.target_connection_id ?? '')
  const [mode, setMode] = useState<SyncMode>(pipeline?.mode ?? SyncMode.Full)
  const [tables, setTables] = useState<SyncTableConfig[]>(pipeline?.tables ?? [])
  const [schedule, setSchedule] = useState<'once' | 'recurring' | 'cron'>('once')
  const [cronExpression, setCronExpression] = useState('')
  const [sourceColumns, setSourceColumns] = useState<Record<number, string[]>>({})
  const [sourceSchema, setSourceSchema] = useState(pipeline?.source_schema ?? '')
  const [targetSchema, setTargetSchema] = useState(pipeline?.target_schema ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1
  const currentStep = STEPS[stepIndex]

  const canGoNext = (): boolean => {
    switch (step) {
      case 'connections':
        return !!name && !!sourceId && !!targetId && !!sourceSchema && !!targetSchema
      case 'tables':
        return tables.length > 0 && tables.every((t) => !!t.source_table && !!t.target_table)
      case 'preview':
        return true
      case 'schedule':
        return schedule !== 'cron' || !!cronExpression
    }
  }

  const goNext = () => {
    const nextIndex = stepIndex + 1
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex].key)
    }
  }

  const goBack = () => {
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex].key)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const dto = {
        name,
        source_connection_id: sourceId,
        target_connection_id: targetId,
        source_schema: sourceSchema || undefined,
        target_schema: targetSchema || undefined,
        mode,
        tables,
        batch_size: 0,
        ...(pipeline?.id ? { id: pipeline.id } : {}),
      } as any
      await savePipeline(dto)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex animate-in fade-in duration-200">
      {/* Backdrop — starts after the sidebar (w-72) so sidebar remains clickable */}
      <div className="fixed inset-y-0 left-72 right-0 bg-background/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-4xl bg-secondary/95 border-l border-border shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-border flex items-center justify-between bg-background/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground uppercase">
                Nueva Sincronización
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                Paso {currentStep.number} de 4 — {currentStep.label}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex border-b border-border">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`
                flex-1 py-2 text-center text-[9px] font-bold uppercase tracking-wider
                ${i <= stepIndex ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50'}
                ${i < stepIndex ? 'border-b-2 border-primary' : 'border-b-2 border-transparent'}
              `}
            >
              {s.number}. {s.label}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
          {error && (
            <div className="p-3 border border-destructive/20 bg-destructive/5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">{error}</p>
            </div>
          )}

          {step === 'connections' && (
            <Step1Connections
              name={name}
              onNameChange={setName}
              sourceId={sourceId}
              onSourceIdChange={setSourceId}
              targetId={targetId}
              onTargetIdChange={setTargetId}
              connections={connections ?? []}
              mode={mode}
              onModeChange={setMode}
              sourceSchema={sourceSchema}
              onSourceSchemaChange={setSourceSchema}
              targetSchema={targetSchema}
              onTargetSchemaChange={setTargetSchema}
            />
          )}
          {step === 'tables' && (
            <Step2Tables
              sourceId={sourceId}
              targetId={targetId}
              sourceSchema={sourceSchema}
              targetSchema={targetSchema}
              tables={tables}
              onTablesChange={setTables}
              sourceColumns={sourceColumns}
              onSourceColumnsChange={setSourceColumns}
            />
          )}
          {step === 'preview' && (
            <Step3Preview
              name={name}
              sourceId={sourceId}
              targetId={targetId}
              tables={tables}
              mode={mode}
              connections={connections ?? []}
            />
          )}
          {step === 'schedule' && (
            <Step4Schedule
              schedule={schedule}
              onScheduleChange={setSchedule}
              cronExpression={cronExpression}
              onCronExpressionChange={setCronExpression}
            />
          )}
        </div>

        <div className="p-6 bg-muted/30 border-t border-border flex items-center justify-between gap-4">
          <div>
            {!isFirst && (
              <button
                onClick={goBack}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Anterior
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            {isLast ? (
              <button
                onClick={handleSave}
                disabled={saving || !canGoNext()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear Sincronización'}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
