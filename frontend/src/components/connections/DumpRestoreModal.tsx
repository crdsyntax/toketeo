import { useState, useEffect, useMemo } from 'react'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'
import {
  X, Loader2, Upload, Download, CheckSquare, Square,
  Table2, Eye, Bell, Workflow, FunctionSquare,
  FolderOpen, CheckCircle2, AlertCircle, AlertTriangle, Minimize2, Maximize2,
  Copy, Search, Check,
} from 'lucide-react'
import type { DumpObjects, DumpSelection, IntegrityResult, RestoreReport } from '@/types/database'
import { cn } from '@/lib/utils'
import { schemaService } from '@/services/schema.service'
import toast from 'react-hot-toast'

interface DumpRestoreModalProps {
  mode: 'dump' | 'restore'
  schema: string
  connId: string
  objects: DumpObjects
  onStart: (selection: DumpSelection) => Promise<{ filePath?: string; integrity?: IntegrityResult; restoreReport?: RestoreReport } | void>
  onClose: () => void
}

type ObjectType = keyof DumpObjects
type FilterStatus = 'all' | 'error' | 'skipped' | 'success'

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
  const [result, setResult] = useState<{ filePath?: string; integrity?: IntegrityResult; restoreReport?: RestoreReport } | null>(null)
  const [tableSizes, setTableSizes] = useState<Record<string, number>>({})
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedLog, setCopiedLog] = useState(false)
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

  const handleCopyLog = () => {
    if (!result?.restoreReport) return
    const text = JSON.stringify(result.restoreReport, null, 2)
    navigator.clipboard.writeText(text)
    setCopiedLog(true)
    setTimeout(() => setCopiedLog(false), 2000)
    toast.success('Restore report copied to clipboard')
  }

  const handleMinimize = () => setIsMinimized(true)
  const handleExpand = () => setIsMinimized(false)

  const restoreReport = result?.restoreReport
  const filteredStatements = useMemo(() => {
    const stmts = restoreReport?.statements ?? []
    return stmts.filter(stmt => {
      if (filterStatus !== 'all' && stmt.status !== filterStatus) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return stmt.sql.toLowerCase().includes(q) || stmt.error?.toLowerCase().includes(q) || stmt.message?.toLowerCase().includes(q)
      }
      return true
    })
  }, [restoreReport, filterStatus, searchQuery])

  const [page, setPage] = useState(1)
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(filteredStatements.length / pageSize))
  const paginatedStatements = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredStatements.slice(start, start + pageSize)
  }, [filteredStatements, page, pageSize])

  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status)
    setPage(1)
  }

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    setPage(1)
  }

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
            <p className="text-[var(--ch-text-10)] text-muted-foreground truncate">{schema}</p>
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

  if (result?.restoreReport) {
    const report = result.restoreReport
    const isSuccess = report.failed === 0
    return (
      <div className="fixed z-[210] w-[640px] max-h-[85vh] flex flex-col" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-background border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="p-3 border-b border-border flex justify-between items-center bg-muted cursor-grab active:cursor-grabbing" data-drag-handle>
            <h3 className="font-bold flex items-center gap-2 text-xs">
              {isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              )}
              Restore Results: {schema}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/60 p-2.5 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Total</span>
                <span className="text-base font-mono font-bold text-foreground">{report.total}</span>
              </div>
              <div className="bg-emerald-500/10 p-2.5 rounded border border-emerald-500/20">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider block">Succeeded</span>
                <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">{report.succeeded}</span>
              </div>
              <div className="bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold tracking-wider block">Skipped</span>
                <span className="text-base font-mono font-bold text-amber-600 dark:text-amber-400">{report.skipped}</span>
              </div>
              <div className={cn('p-2.5 rounded border', report.failed > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-muted/40 border-border')}>
                <span className={cn('text-[10px] uppercase font-bold tracking-wider block', report.failed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>Failed</span>
                <span className={cn('text-base font-mono font-bold', report.failed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{report.failed}</span>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 bg-muted/70 p-1 rounded-md text-xs">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', filterStatus === 'all' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}
                >
                  All ({report.statements.length})
                </button>
                {report.failed > 0 && (
                  <button
                    onClick={() => handleFilterChange('error')}
                    className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', filterStatus === 'error' ? 'bg-rose-500 text-white font-semibold' : 'text-rose-600 dark:text-rose-400 hover:text-rose-500')}
                  >
                    Failed ({report.failed})
                  </button>
                )}
                {report.skipped > 0 && (
                  <button
                    onClick={() => handleFilterChange('skipped')}
                    className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', filterStatus === 'skipped' ? 'bg-amber-500 text-white font-semibold' : 'text-amber-600 dark:text-amber-400 hover:text-amber-500')}
                  >
                    Skipped ({report.skipped})
                  </button>
                )}
                <button
                  onClick={() => handleFilterChange('success')}
                  className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', filterStatus === 'success' ? 'bg-emerald-600 text-white font-semibold' : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500')}
                >
                  Succeeded ({report.succeeded})
                </button>
              </div>

              <div className="relative flex-1 max-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter queries..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Statements List */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {paginatedStatements.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No statements match the current filter.
                </div>
              ) : (
                paginatedStatements.map((stmt) => (
                  <div
                    key={stmt.index}
                    className={cn(
                      'p-2.5 rounded border text-xs font-mono space-y-1 transition-colors',
                      stmt.status === 'success' && 'border-border bg-background/50',
                      stmt.status === 'skipped' && 'border-amber-500/30 bg-amber-500/5',
                      stmt.status === 'error' && 'border-rose-500/40 bg-rose-500/5'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] text-muted-foreground font-sans">#{stmt.index}</span>
                        <span
                          className={cn(
                            'px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider',
                            stmt.status === 'success' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                            stmt.status === 'skipped' && 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
                            stmt.status === 'error' && 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                          )}
                        >
                          {stmt.status}
                        </span>
                        {stmt.rowsAffected !== undefined && stmt.rowsAffected !== null && (
                          <span className="text-[10px] text-muted-foreground">
                            ({stmt.rowsAffected} row{stmt.rowsAffected === 1 ? '' : 's'})
                          </span>
                        )}
                      </div>
                      {stmt.status === 'skipped' && stmt.message && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans truncate max-w-[280px]" title={stmt.message}>
                          {stmt.message}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-foreground/90 break-all bg-muted/40 p-1.5 rounded line-clamp-3 select-all">
                      {stmt.sql}
                    </div>

                    {stmt.error && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-400 font-sans bg-rose-500/10 p-1.5 rounded border border-rose-500/20 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="break-all">{stmt.error}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Pagination footer if more than 1 page */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground border-t border-border">
                <span>
                  Showing {Math.min((page - 1) * pageSize + 1, filteredStatements.length)}–
                  {Math.min(page * pageSize, filteredStatements.length)} of {filteredStatements.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-0.5 rounded border border-border bg-background disabled:opacity-40 hover:bg-muted"
                  >
                    Previous
                  </button>
                  <span className="px-2 font-mono">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-0.5 rounded border border-border bg-background disabled:opacity-40 hover:bg-muted"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border flex justify-between items-center bg-muted/40">
            <button
              onClick={handleCopyLog}
              className="px-3 py-1.5 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors flex items-center gap-1.5"
            >
              {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLog ? 'Copied Log' : 'Copy Log JSON'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
            >
              Close
            </button>
          </div>
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
                  'flex items-center gap-1.5 px-3 py-2 text-[var(--ch-text-11)] font-semibold border-b-2 transition-colors shrink-0',
                  activeTab === tab.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.icon}
                {tab.label}
                <span className="text-[var(--ch-text-10)] text-muted-foreground ml-0.5">({count})</span>
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
          <span className="text-[var(--ch-text-10)] text-muted-foreground">
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
                    <span className="text-[var(--ch-text-10)] text-muted-foreground shrink-0">{formatSize(size)}</span>
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
