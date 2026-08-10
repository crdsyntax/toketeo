import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, UploadCloud, Sparkles } from 'lucide-react'
import { connectionService } from '@/services/connection.service'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { DatabaseType } from '@/types/database'
import { useState, useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { ConnectionCard } from '@/components/connections/ConnectionCard'
import { ConnectionModal } from '@/components/connections/ConnectionModal'
import { ConnectionWizard } from '@/components/connections/ConnectionWizard'
import { cn } from '@/lib/utils'
import { getEngineConfig, ENGINE_ORDER } from '@/lib/engine-icons'

export default function Connections() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setActiveConnection = useAppStore((state) => state.setActiveConnection)
  const activeConnection = useAppStore((state) => state.activeConnection)
  const connectedConnectionIds = useAppStore((state) => state.connectedConnectionIds)
  const setMiniToast = useAppStore((state) => state.setMiniToast)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [activeEngineFilter, setActiveEngineFilter] = useState<DatabaseType | 'all'>('all')

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const filteredConnections = useMemo(() => {
    if (!connections) return []
    if (activeEngineFilter === 'all') return connections
    return connections.filter((conn) => conn.type === activeEngineFilter)
  }, [connections, activeEngineFilter])

  const engineCounts = useMemo(() => {
    if (!connections) return {} as Record<DatabaseType, number>
    const counts: Record<DatabaseType, number> = {
      [DatabaseType.POSTGRES]: 0,
      [DatabaseType.MARIADB]: 0,
      [DatabaseType.MYSQL]: 0,
      [DatabaseType.MONGODB]: 0,
      [DatabaseType.SQLSERVER]: 0,
      [DatabaseType.SQLITE]: 0,
      [DatabaseType.REDIS]: 0,
      [DatabaseType.NEO4J]: 0,
    }
    connections.forEach((conn) => {
      if (counts[conn.type] !== undefined) {
        counts[conn.type]++
      }
    })
    return counts
  }, [connections])

  const saveMutation = useMutation({
    mutationFn: (payload: CreateConnectionDto) => {
      if (editingConnection?.id) {
        return connectionService.update(editingConnection.id, payload)
      }
      return connectionService.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectionService.delete(id),
    onSuccess: (_data, id) => {
      const { setActiveConnection, removeExplorerTabsForConnection, removeConnectedConnection } = useAppStore.getState()
      removeExplorerTabsForConnection(id)
      removeConnectedConnection(id)
      if (useAppStore.getState().activeConnection?.id === id) {
        setActiveConnection(null)
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingConnection(null)
    setTestMessage(null)
  }

  const handleSave = (payload: CreateConnectionDto) => {
    saveMutation.mutate(payload)
  }

  const handleTest = (payload: CreateConnectionDto) => {
    setIsTesting(true)
    setTestMessage(null)
    connectionService.test(payload).then(() => {
      setTestMessage({ type: 'success', text: 'Connection established successfully' })
    }).catch((err: Error) => {
      setTestMessage({ type: 'error', text: err.message || 'Operation failed' })
    }).finally(() => {
      setIsTesting(false)
    })
  }

  const handleTestCard = (conn: Connection) => {
    setTestingId(conn.id)
    connectionService.test(conn).then(() => {
      setMiniToast(conn.id, { type: 'success', text: 'Connection established successfully' })
    }).catch((err: Error) => {
      setMiniToast(conn.id, { type: 'error', text: err.message || 'Operation failed' })
    }).finally(() => {
      setTestingId(null)
    })
  }

  const handleConnect = async (conn: Connection) => {
    const setConnectedConnection = useAppStore.getState().setConnectedConnection
    setConnectingId(conn.id)
    try {
      await connectionService.connect(conn)
      setActiveConnection({
        ...conn,
        database: conn.defaultDatabase || conn.database
      })
      setConnectedConnection(conn.id)
      navigate('/explorer')
    } catch (error: unknown) {
      console.error('Failed to connect to database:', error)
      setToastMessage({ type: 'error', text: (error as Error)?.message || 'Failed to connect' })
    } finally {
      setConnectingId(null)
    }
  }

  const handleEdit = (conn: Connection) => {
    setEditingConnection(conn)
    setIsModalOpen(true)
  }

  const handleDisconnect = async (id: string) => {
    try {
      const { removeConnectedConnection, removeExplorerTabsForConnection } = useAppStore.getState()
      await connectionService.disconnect(id)
      removeConnectedConnection(id)
      removeExplorerTabsForConnection(id)
      if (activeConnection?.id === id) setActiveConnection(null)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setMiniToast(id, { type: 'success', text: 'Disconnected' })
    } catch (error: unknown) {
      console.error('Failed to disconnect:', error)
      setMiniToast(id, { type: 'error', text: 'Failed to disconnect' })
    }
  }

  const handleExport = async (conn: Connection) => {
    setToastMessage(null)
    setIsExporting(true)

    try {
      const exportedPath = await connectionService.exportConnection(conn.id, conn.name)
      if (!exportedPath) {
        return
      }
      setToastMessage({ type: 'success', text: `Connection exported to ${exportedPath}` })
    } catch (error: unknown) {
      console.error('Failed to export connection:', error)
      setToastMessage({ type: 'error', text: 'Failed to export connection' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportAll = async () => {
    setToastMessage(null)
    setIsExporting(true)

    try {
      const exportedPath = await connectionService.exportAll()
      if (!exportedPath) {
        return
      }
      setToastMessage({ type: 'success', text: `All connections exported to ${exportedPath}` })
    } catch (error: unknown) {
      console.error('Failed to export connections:', error)
      setToastMessage({ type: 'error', text: 'Failed to export all connections' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    setToastMessage(null)
    setIsImporting(true)

    try {
      const savedIds = await connectionService.importConnections()
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setToastMessage({ type: 'success', text: `Imported ${savedIds.length} connection(s)` })
    } catch (error: unknown) {
      console.error('Failed to import connections:', error)
      setToastMessage({ type: 'error', text: 'Failed to import connections' })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto py-5 sm:py-6 px-4 sm:px-6 overflow-x-clip min-w-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-border pb-5 sm:pb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase">Connections</h1>
          <p className="text-[var(--ch-text-10)] text-muted-foreground mt-1 uppercase tracking-[0.2em] font-bold">Manage database access configurations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="clay-btn flex items-center gap-2 bg-secondary text-secondary-foreground px-3 sm:px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span className="hidden sm:inline">Import JSON</span>
            <span className="sm:hidden">Import</span>
          </button>
          <button
            onClick={handleExportAll}
            disabled={isExporting}
            className="clay-btn flex items-center gap-2 bg-secondary text-secondary-foreground px-3 sm:px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export All</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="clay-btn flex items-center gap-2 bg-primary text-primary-foreground px-3 sm:px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Connection</span>
            <span className="sm:hidden">New</span>
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="clay-btn flex items-center gap-2 bg-muted text-foreground px-3 sm:px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest border border-border"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Wizard
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className={`rounded-full border px-4 py-2.5 text-sm break-words ${toastMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700' : 'bg-red-500/10 border-red-500 text-red-700'}`}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveEngineFilter('all')}
          className={cn(
            'clay-btn flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap',
            activeEngineFilter === 'all'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          )}
        >
          All
          {connections && (
            <span className="text-[var(--ch-text-9)] px-1.5 py-0.5 rounded-full bg-primary/10">
              {connections.length}
            </span>
          )}
        </button>
        {ENGINE_ORDER.map((engineType) => {
          const count = engineCounts[engineType]
          if (count === 0) return null
          const config = getEngineConfig(engineType)
          const EngineIcon = config.icon
          return (
            <button
              key={engineType}
              onClick={() => setActiveEngineFilter(engineType)}
              className={cn(
                'clay-btn flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 text-[var(--ch-text-10)] font-bold uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap',
                activeEngineFilter === engineType
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              )}
            >
              <EngineIcon className={cn('w-3 h-3', activeEngineFilter === engineType ? config.textClass : '')} />
              {config.label}
              <span className="text-[var(--ch-text-9)] px-1.5 py-0.5 rounded-full bg-primary/10">
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {connectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 flex items-center gap-3 clay-card bg-background/95 px-6 py-4 shadow-2xl">
            <svg className="w-6 h-6 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <div className="text-sm font-bold">Connecting to database...</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="clay-card h-44 bg-secondary/30 animate-pulse w-full min-w-0" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 min-w-0">
          {filteredConnections.map((conn) => (
            <ConnectionCard 
              key={conn.id} 
              connection={conn} 
              onEdit={handleEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              onConnect={handleConnect}
              onTest={handleTestCard}
              onDisconnect={handleDisconnect}
              onExport={handleExport}
              isConnecting={connectingId === conn.id}
              isTesting={testingId === conn.id}
              isActive={connectedConnectionIds.includes(conn.id)}
            />
          ))}
        </div>
      )}

      <ConnectionModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        onTest={handleTest}
        editingConnection={editingConnection}
        isSaving={saveMutation.isPending}
        isTesting={isTesting}
        testMessage={testMessage}
      />
      {showWizard && <ConnectionWizard onClose={() => setShowWizard(false)} onSave={handleSave} />}
    </div>
  )
}
