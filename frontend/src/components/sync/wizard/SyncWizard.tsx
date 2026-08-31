import { useState, useRef, useEffect } from 'react'
import { X, GitBranch, Minus, Maximize2, Copy } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'
import { useSyncStore } from '@/store/syncStore'
import { Step1Connections } from './Step1Connections'
import { Step2Tables } from './Step2Tables'
import { Step3Preview } from './Step3Preview'
import { Step4Schedule } from './Step4Schedule'
import type { SyncPipeline, SyncTableConfig, CreateSyncPipelineDto } from '@/types/sync'
import { SyncMode } from '@/types/sync'

interface SyncWizardProps {
  pipeline?: SyncPipeline | null
  onClose: () => void
  minimized: boolean
  onMinimize: () => void
  onRestore: () => void
}

type WizardStep = 'connections' | 'tables' | 'preview' | 'schedule'

const STEPS: { key: WizardStep; label: string; number: number }[] = [
  { key: 'connections', label: 'Connections', number: 1 },
  { key: 'tables', label: 'Tables', number: 2 },
  { key: 'preview', label: 'Preview', number: 3 },
  { key: 'schedule', label: 'Schedule', number: 4 },
]

export function SyncWizard({ pipeline, onClose, minimized, onMinimize }: SyncWizardProps) {
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

  const [modalRect, setModalRect] = useState({ x: 15, y: 8, w: 70, h: 80 })
  const [isMaximized, setIsMaximized] = useState(false)
  const prevRectRef = useRef({ x: 15, y: 8, w: 70, h: 80 })
  const [isInteracting, setIsInteracting] = useState(false)
  const draggingRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)
  const resizingRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragging = draggingRef.current
      if (dragging) {
        setIsInteracting(true)
        const deltaX = ((e.clientX - dragging.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - dragging.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          x: dragging.startPos.x + deltaX,
          y: dragging.startPos.y + deltaY,
        }))
      }
      const resizing = resizingRef.current
      if (resizing) {
        setIsInteracting(true)
        const deltaX = ((e.clientX - resizing.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - resizing.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          w: Math.max(30, resizing.startSize.w + deltaX),
          h: Math.max(20, resizing.startSize.h + deltaY),
        }))
      }
    }
    const handleMouseUp = () => {
      draggingRef.current = null
      resizingRef.current = null
      setIsInteracting(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const toggleMaximize = () => {
    if (isMaximized) {
      setModalRect(prevRectRef.current)
      setIsMaximized(false)
    } else {
      prevRectRef.current = { ...modalRect }
      setModalRect({ x: 0, y: 0, w: 100, h: 100 })
      setIsMaximized(true)
    }
  }

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
      } as CreateSyncPipelineDto
      await savePipeline(dto)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (minimized) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className={cn(
          'bg-background border border-border shadow-2xl flex flex-col overflow-hidden absolute pointer-events-auto',
          isMaximized ? '' : 'rounded-lg',
        )}
        style={{
          top: `${modalRect.y}%`,
          left: `${modalRect.x}%`,
          width: `${modalRect.w}%`,
          height: `${modalRect.h}%`,
          transition: isInteracting ? 'none' : undefined,
        }}
      >

        <div
          className="h-11 border-b border-border flex items-center justify-between bg-muted cursor-move select-none shrink-0 px-4"
          onMouseDown={(e) => {
            if (isMaximized) return
            draggingRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              startPos: { x: modalRect.x, y: modalRect.y },
            }
          }}
          onDoubleClick={toggleMaximize}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-primary/10 border border-primary/20 flex items-center justify-center">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <span className="text-xs font-bold tracking-tight text-foreground uppercase">
                {pipeline ? 'Edit' : 'New'} Sync
              </span>
              <span className="text-[var(--ch-text-9)] text-muted-foreground font-bold uppercase tracking-widest ml-3">
                Step {currentStep.number}/4 — {currentStep.label}
              </span>
            </div>
          </div>
          <div className="flex items-center">
            <button
              onClick={onMinimize}
              className="h-full px-2.5 hover:bg-muted text-muted-foreground transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleMaximize}
              className="h-full px-2.5 hover:bg-muted text-muted-foreground transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="h-full px-2.5 hover:bg-destructive hover:text-destructive-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>


        <div className="flex border-b border-border shrink-0">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                'flex-1 py-1.5 text-center text-[var(--ch-text-9)] font-bold uppercase tracking-wider',
                i <= stepIndex ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50',
                i < stepIndex ? 'border-b-2 border-primary' : 'border-b-2 border-transparent',
              )}
            >
              {s.number}. {s.label}
            </div>
          ))}
        </div>


        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin bg-background">
          {error && (
            <div className="p-3 border border-destructive/20 bg-destructive/5">
              <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider text-destructive">{error}</p>
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


        <div className="p-4 bg-muted border-t border-border flex items-center justify-between gap-4 shrink-0">
          <div>
            {!isFirst && (
              <button
                onClick={goBack}
                className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Previous
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            {isLast ? (
              <button
                onClick={handleSave}
                disabled={saving || !canGoNext()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-1.5 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Create Sync'}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-1.5 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                Next →
              </button>
            )}
          </div>
        </div>


        {!isMaximized && (
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 hover:text-primary transition-colors z-50"
            onMouseDown={(e) => {
              e.stopPropagation()
              resizingRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startSize: { w: modalRect.w, h: modalRect.h },
              }
            }}
          >
            <div className="w-2 h-2 border-r-2 border-b-2 border-current opacity-30" />
          </div>
        )}
      </div>
    </div>
  )
}
