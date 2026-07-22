import { useState, useEffect } from 'react'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'
import {
  X, Loader2, Upload, Download, CheckSquare, Square,
  Table2, Eye, Bell, Workflow, FunctionSquare,
  FolderOpen, CheckCircle2, AlertCircle, Minimize2, Maximize2,
} from 'lucide-react'
import type { DumpObjects, DumpSelection, IntegrityResult } from '@/types/database'
import { cn } from '@/lib/utils'
import { schemaService } from '@/services/schema.service'
import toast from 'react-hot-toast'

interface DumpRestoreModalProps {
  mode: 'dump' | 'restore'
  schema: string
  connId: string
  objects: DumpObjects
  onStart: (selection: DumpSelection) => Promise<{ filePath?: string; integrity?: IntegrityResult } | void>
  onClose: () => void
}

type ObjectType = keyof DumpObjects

const TABS: { key: ObjectType; label: string; icon: React.ReactNode }[] = [
  { key: 'tables', label: 'Tables', icon: <Table2 className="w-3.5 h-3.5" /> },
  { key: 'views', label: 'Views', icon: <Eye className="w-3.5 h-3.5" /> },
  { key: 'triggers', label: 'Triggers', icon: <Bell className="w-3.5 h-3.5" /> },
  { key: 'procedures', label: 'Procedures', icon: <Workflow className="w-3.5 h-3.5" /> },
  { key: 'functions', label: 'Functions', icon: <FunctionSquare className="w-3.5 h-3.5" /> },
]

function allNames(objects: DumpObjects): string[] {
  return Object.values(objects).flat()
}

function initSelection(objects: DumpObjects): DumpSelection {
  return {
    tables: [...objects.tables],
    views: [...objects.views],
    triggers: [...objects.triggers],
    procedures: [...objects.procedures],
    functions: [...objects.functions],
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1) return '< 1 KB'
  return `${kb.toFixed(1)} KB`
}

export function DumpRestoreModal({ mode, schema, connId, objects, onStart, onClose }: DumpRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<ObjectType>('tables')
  const [selection, setSelection] = useState<DumpSelection>(initSelection(objects))
  const [isLoading, setIsLoading] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [result, setResult] = useState<{ filePath?: string; integrity?: IntegrityResult } | null>(null)
  const [tableSizes, setTableSizes] = useState<Record<string, number>>({})
  const { pos, handleMouseDown } = useDraggablePanel(320, 80)

  useEffect(() => {
    if (mode === 'dump' && objects.tables.length > 0) {
      schemaService.getTableSizes(connId, schema).then(setTableSizes).catch(() => {})
    }
  }, [mode, connId, schema, objects.tables.length])

  const currentItems = objects[activeTab]
  const selectedItems = selection[activeTab]
  const allSelected = selectedItems.length === currentItems.length && currentItems.length > 0

  const totalSelected = Object.values(selection).reduce((sum, arr) => sum + arr.length, 0)
  const totalAvailable = allNames(objects).length

  const toggleAll = () => {
    setSelection(prev => ({
      ...prev,
      [activeTab]: allSelected ? [] : [...currentItems],
    }))
  }

  const toggle = (name: string) => {
    setSelection(prev => {
      const current = prev[activeTab]
      return {
        ...prev,
        [activeTab]: current.includes(name)
          ? current.filter(n => n !== name)
          : [...current, name],
      }
    })
  }

  const handleStart = async () => {
    setIsLoading(true)
    try {
      const res = await onStart(selection)
      if (res) {
        setResult(res)
      } else {
        if (isMinimized) {
          setCompleted(true)
        } else {
          onClose()
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenLocation = async () => {
    if (result?.filePath) {
      try {
        await schemaService.openInFileManager(result.filePath)
      } catch {
        toast.error('Could not open file location')
      }
    }
  }

  const handleMinimize = () => setIsMinimized(true)
  const handleExpand = () => setIsMinimized(false)

  if (isMinimized && (isLoading || completed)) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-background border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[220px]" data-drag-handle>
          {completed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">
              {completed
                ? (mode === 'dump' ? 'Dump complete' : 'Restore complete')
                : (mode === 'dump' ? 'Generating dump...' : 'Restoring database...')}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{schema}</p>
          </div>
          <button
            onClick={handleExpand}
            className="p-1 hover:bg-muted rounded shrink-0"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded shrink-0"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  if (result) {
    const integrity = result.integrity
    return (
      <div className="fixed z-[210] w-[460px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-border flex justify-between items-center bg-muted cursor-grab active:cursor-grabbing" data-drag-handle>
            <h3 className="font-bold flex items-center gap-2 text-xs">
              {integrity?.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
              Dump Complete
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {integrity && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">File size</span>
                <span className="font-mono font-bold">{integrity.fileSizeKB} KB</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CREATE statements</span>
                <span className="font-mono font-bold">{integrity.createStatements}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">INSERT statements</span>
                <span className="font-mono font-bold">{integrity.insertStatements}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Integrity</span>
                <span className={cn('font-bold flex items-center gap-1', integrity.passed ? 'text-emerald-500' : 'text-amber-500')}>
                  {integrity.passed ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {integrity.passed ? 'Passed' : 'Warning'}
                </span>
              </div>
            </div>
          )}

          <div className="p-4 flex justify-end gap-2 border-t border-border">
            {result.filePath && (
              <button
                onClick={handleOpenLocation}
                className="px-4 py-2 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Open File Location
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
     <div className="fixed z-[200] w-[480px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
       <div className="bg-background border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
         <div className="p-3 border-b border-border flex justify-between items-center bg-muted cursor-grab active:cursor-grabbing" data-drag-handle>
          <h3 className="font-bold flex items-center gap-2 text-xs">
            {mode === 'dump' ? <Upload className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {mode === 'dump' ? 'Dump' : 'Restore'} Schema: {schema}
          </h3>
          <div className="flex items-center gap-0.5">
            {isLoading && (
              <button onClick={handleMinimize} className="p-1 hover:bg-background rounded" title="Minimize">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-background rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map(tab => {
            const count = objects[tab.key].length
            if (count === 0) return null
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors shrink-0',
                  activeTab === tab.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.icon}
                {tab.label}
                <span className="text-[10px] text-muted-foreground ml-0.5">({count})</span>
              </button>
            )
          })}
        </div>

        <div className="p-3 border-b border-border flex items-center justify-between bg-muted">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-[10px] text-muted-foreground">
            {totalSelected} / {totalAvailable} selected
          </span>
        </div>

        <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
          {currentItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No {activeTab} found in this schema.
            </p>
          ) : (
            currentItems.map((item) => {
              const isSelected = selectedItems.includes(item)
              const size = activeTab === 'tables' ? tableSizes[item] : undefined
              return (
                <button
                  key={item}
                  onClick={() => toggle(item)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/5 rounded-sm transition-colors text-left"
                >
                  {isSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 shrink-0 text-primary" />
                  ) : (
                    <Square className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono truncate flex-1">{item}</span>
                  {size !== undefined && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(size)}</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="p-4 flex justify-end gap-2 border-t border-border">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={totalSelected === 0 || isLoading}
            className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'dump' ? 'Dumping...' : 'Restoring...'}
              </>
            ) : (
              mode === 'dump' ? 'Start Dump' : 'Start Restore'
            )}
          </button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm font-bold text-foreground">
                {mode === 'dump' ? 'Generating dump...' : 'Restoring database...'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
