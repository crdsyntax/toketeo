import { Outlet, Link, useLocation } from 'react-router-dom'
import { Database, LayoutGrid, Terminal, Settings, Activity, FileText, Globe, Shield, AlertTriangle, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { Environment } from '@/types/database'
import { SchemaSelector } from '@/components/layout/SchemaSelector'
import { useSystemStatus } from '@/hooks/useSystemStatus'
import { ConnectionsSidebar } from '@/components/connections/ConnectionsSidebar'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { useState } from 'react'
import { ConnectionModal } from '@/components/connections/ConnectionModal'

export default function MainLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeConnection, setActiveConnection, isSidebarOpen, toggleSidebar } = useAppStore()
  const { mysqlError, clearMysqlError } = useSystemStatus()

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<Connection[]>('/connections'),
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const saveMutation = useMutation({
    mutationFn: (payload: CreateConnectionDto) => {
      const isEditing = !!editingConnection?.id
      const url = isEditing ? `/connections/${editingConnection.id}` : '/connections'
      return apiFetch<Connection>(url, {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
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
    apiFetch('/connections/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(() => {
      setTestMessage({ type: 'success', text: 'Processing completed successfully' })
    }).catch((err: Error) => {
      setTestMessage({ type: 'error', text: err.message || 'Operation failed' })
    }).finally(() => {
      setIsTesting(false)
    })
  }

  const handleConnect = (conn: Connection) => {
    setActiveConnection(conn)
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
      {/* ... (Error handling) ... */}
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={toggleSidebar} className="p-2 hover:bg-muted rounded-none text-muted-foreground">
            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">Toketeo</span>
          </div>
          <nav className="flex items-center ml-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 transition-all text-sm font-medium",
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
        
        {/* ... (Header Right) ... */}
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
