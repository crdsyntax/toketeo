import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutGrid, Terminal, Activity, FileText, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

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
      setTestMessage({ type: 'success', text: 'Processing completed successfully' })
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
    { name: 'Logs', icon: Activity, path: '/logs' },
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
      </header>

      <div className="flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <ConnectionsSidebar 
            connections={connections} 
            activeConnection={activeConnection} 
            onConnect={handleConnect} 
            onEdit={handleEdit}
            onNew={() => { setEditingConnection(null); setIsModalOpen(true); }}
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
