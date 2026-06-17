import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutGrid, Terminal, FileText, PanelLeftClose, PanelLeftOpen, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { ConnectionsSidebar } from '@/components/connections/ConnectionsSidebar'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { useState } from 'react'
import { ConnectionModal } from '@/components/connections/ConnectionModal'

export default function MainLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeConnection, setActiveConnection, isSidebarOpen, toggleSidebar } = useAppStore()
  const setMiniToast = useAppStore((state) => state.setMiniToast)

  const isProduction = activeConnection?.environment?.toLowerCase() === 'production'

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const handleDisconnect = async (id: string) => {
    try {
      await connectionService.disconnect(id)
      if (activeConnection?.id === id) setActiveConnection(null)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setMiniToast(id, { type: 'success', text: 'Disconnected' })
    } catch (error) {
      console.error('Failed to disconnect:', error)
      setMiniToast(id, { type: 'error', text: 'Failed to disconnect' })
    }
  }

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [isTransacting, setIsTransacting] = useState(false)

  const handleCommit = async () => {
    if (!activeConnection?.id) return
    setIsTransacting(true)
    try {
      await connectionService.commit(activeConnection.id)
      setMiniToast('tx', { type: 'success', text: 'Transaction Committed' })
    } catch (error: any) {
      setMiniToast('tx', { type: 'error', text: error.message || 'Commit failed' })
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
    } catch (error: any) {
      setMiniToast('tx', { type: 'error', text: error.message || 'Rollback failed' })
    } finally {
      setIsTransacting(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: (payload: CreateConnectionDto) => {
      if (editingConnection?.id) {
        return connectionService.update(editingConnection.id, payload)
      }
      return connectionService.create(payload)
    },
    onSuccess: () => {
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
      setActiveConnection(conn)
    } catch (error: unknown) {
      console.error('Failed to connect to database:', error)
    }
  }

  const handleEdit = (conn: Connection) => {
    setEditingConnection(conn)
    setIsModalOpen(true)
  }

  const navItems = [
    { name: 'Explorer', icon: LayoutGrid, path: '/explorer' },
    { name: 'Query Editor', icon: Terminal, path: '/query' },
    { name: 'Audit', icon: FileText, path: '/audit' },
  ]

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={toggleSidebar} className="p-2 hover:bg-muted rounded-md text-muted-foreground">
            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-4">
            <img 
              src="./logo.svg" 
              alt="Toketeo Logo" 
              className="w-50 h-50 object-contain brightness-0 invert drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]" 
            />
          </div>
          <nav className="flex items-center ml-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 transition-all text-sm font-medium rounded-md",
                  location.pathname === item.path 
                    ? "bg-primary/10 text-primary border-b-2 border-primary" 
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isProduction && (
            <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Production Mode</span>
            </div>
          )}
          
          {isProduction && activeConnection && (
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border">
              <button
                onClick={handleRollback}
                disabled={isTransacting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all disabled:opacity-50"
                title="Rollback Transaction"
              >
                <RotateCcw className={cn("w-3.5 h-3.5", isTransacting && "animate-spin")} />
                Rollback
              </button>
              <div className="w-[1px] h-4 bg-border mx-1" />
              <button
                onClick={handleCommit}
                disabled={isTransacting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 rounded-md transition-all disabled:opacity-50"
                title="Commit Transaction"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Commit
              </button>
            </div>
          )}
        </div>
      </header>

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
        <main className="flex-1 overflow-auto p-2">
          <Outlet />
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
    </div>
  )
}
