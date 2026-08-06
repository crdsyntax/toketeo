import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/layout/AppHeader'
import { useAppStore } from '@/store/useAppStore'
import { ConnectionsSidebar } from '@/components/connections/ConnectionsSidebar'
import { ConnectionErrorModal } from '@/components/connections/ConnectionErrorModal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { useState, useEffect, useCallback } from 'react'
import { ConnectionModal } from '@/components/connections/ConnectionModal'
import { GamificationModal } from '@/components/gamification/GamificationModal'
import { useGamificationStore } from '@/store/gamificationStore'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'react-hot-toast'

export default function MainLayout() {
  const queryClient = useQueryClient()
  const { activeConnection, setActiveConnection, isSidebarOpen } = useAppStore()
  const setConnectedConnection = useAppStore((state) => state.setConnectedConnection)
  const removeConnectedConnection = useAppStore((state) => state.removeConnectedConnection)
  const setMiniToast = useAppStore((state) => state.setMiniToast)
  const setConnectionError = useAppStore((state) => state.setConnectionError)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const checkStreak = useGamificationStore(state => state.checkStreak)
  
  useEffect(() => {
    checkStreak()
  }, [checkStreak])

  const [connectionErrorModal, setConnectionErrorModal] = useState<{
    connectionId: string
    connectionName: string
    error: string
  } | null>(null)

  useEffect(() => {
    const unlisten = listen<{ connection_id: string; error: string }>('connection:error', (event) => {
      const { connection_id, error } = event.payload
      setConnectionError(connection_id, error)
      const conn = connections.find((c) => c.id === connection_id)
      setConnectionErrorModal({
        connectionId: connection_id,
        connectionName: conn?.name || connection_id,
        error,
      })
    })
    return () => { unlisten.then((f) => f()) }
  }, [connections, setConnectionError])

  const handleReconnected = useCallback(() => {
    if (connectionErrorModal) {
      setConnectionError(connectionErrorModal.connectionId, null)
    }
    queryClient.invalidateQueries({ queryKey: ['connections'] })
  }, [connectionErrorModal, setConnectionError, queryClient])

  const handleDisconnect = async (id: string) => {
    try {
      await connectionService.disconnect(id)
      removeConnectedConnection(id)
      const { setActiveConnection, removeExplorerTabsForConnection } = useAppStore.getState()
      removeExplorerTabsForConnection(id)
      if (activeConnection?.id === id) {
        setActiveConnection(null)
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setMiniToast(id, { type: 'success', text: 'Disconnected' })
    } catch (error) {
      console.error('Failed to disconnect:', error)
      setMiniToast(id, { type: 'error', text: 'Failed to disconnect' })
    }
  }

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [isTransacting, setIsTransacting] = useState(false)

  const handleCommit = async () => {
    if (!activeConnection?.id) return
    setIsTransacting(true)
    try {
      const rowsAffected = await connectionService.commit(activeConnection.id)
      const msg = rowsAffected > 0
        ? `Transaction committed — ${rowsAffected} row(s) affected`
        : 'Transaction committed successfully'
      setMiniToast('tx', { type: 'success', text: msg })
      toast.success(msg)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Commit failed'
      setMiniToast('tx', { type: 'error', text: message })
      toast.error(`Commit failed: ${message}`)
    } finally {
      setIsTransacting(false)
    }
  }

  const handleRollback = async () => {
    if (!activeConnection?.id) return
    setIsTransacting(true)
    try {
      await connectionService.rollback(activeConnection.id)
      setMiniToast('tx', { type: 'success', text: 'Transaction Rolled Back' })
      toast.success('Transaction rolled back successfully')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Rollback failed'
      setMiniToast('tx', { type: 'error', text: message })
      toast.error(`Rollback failed: ${message}`)
    } finally {
      setIsTransacting(false)
    }
  }

  const { trackAction, addXP } = useGamificationStore();

  const saveMutation = useMutation({
    mutationFn: (payload: CreateConnectionDto) => {
      if (editingConnection?.id) {
        return connectionService.update(editingConnection.id, payload)
      }
      return connectionService.create(payload)
    },
    onSuccess: () => {
      if (!editingConnection?.id) {
        addXP(50); // XP for connection
        trackAction('CREATE_CONNECTION')
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setIsModalOpen(false)
      setTestMessage(null)
    },
  })

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

  const handleConnect = async (conn: Connection) => {
    try {
      await connectionService.connect(conn)
      setActiveConnection({
        ...conn,
        database: conn.defaultDatabase || conn.database
      })
      setConnectedConnection(conn.id)
    } catch (error: unknown) {
      console.error('Failed to connect to database:', error)
    }
  }

  const handleEdit = (conn: Connection) => {
    setEditingConnection(conn)
    setIsModalOpen(true)
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <AppHeader
        onCommit={handleCommit}
        onRollback={handleRollback}
        isTransacting={isTransacting}
        onOpenGamification={() => setIsGamificationModalOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <ConnectionsSidebar 
            connections={connections} 
            activeConnection={activeConnection} 
            onConnect={handleConnect} 
            onEdit={handleEdit}
            onNew={() => { setEditingConnection(null); setIsModalOpen(true); }}
            onDisconnect={handleDisconnect}
          />
        )}
        <main className="flex-1 overflow-auto p-3">
          <div className="h-full min-w-0 overflow-hidden rounded-lg bg-surface border border-border shadow-sm">
            <Outlet />
          </div>
        </main>
      </div>

      <ConnectionModal 
        key={editingConnection?.id || 'new'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveMutation.mutate}
        onTest={handleTest}
        editingConnection={editingConnection}
        isSaving={saveMutation.isPending}
        isTesting={isTesting}
        testMessage={testMessage}
      />

      <GamificationModal 
        isOpen={isGamificationModalOpen} 
        onClose={() => setIsGamificationModalOpen(false)} 
      />

      {connectionErrorModal && (
        <ConnectionErrorModal
          connectionId={connectionErrorModal.connectionId}
          connectionName={connectionErrorModal.connectionName}
          error={connectionErrorModal.error}
          onClose={() => setConnectionErrorModal(null)}
          onReconnected={handleReconnected}
        />
      )}
    </div>
  )
}
