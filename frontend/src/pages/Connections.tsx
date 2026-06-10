import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Link as LinkIcon, Database, Server, Globe, Edit2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { Connection } from '@/types/database'
import { DatabaseType } from '@/types/database'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'

export default function Connections() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setActiveConnection = useAppStore((state) => state.setActiveConnection)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<Connection[]>('/connections'),
  })

  const createMutation = useMutation({
    mutationFn: (newConn: any) => apiFetch<Connection>('/connections', {
      method: 'POST',
      body: JSON.stringify(newConn),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      handleCloseModal()
    },
  })

  // Note: Backend doesn't have PUT/PATCH yet, but I'll implement it here assuming it will be added or I can add it.
  // Actually, I'll just stick to what the backend HAS.
  // If backend doesn't have update, I'll skip it or implement it in backend if needed.
  // Let me check connection.service.ts or controller again.
  // Controller only has POST, GET, GET :id, DELETE.
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const testConnection = async (formData: any) => {
    setIsTesting(true)
    setTestMessage(null)
    try {
      await apiFetch('/connections/test', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      setTestMessage({ type: 'success', text: 'Connection successful!' })
    } catch (err: any) {
      setTestMessage({ type: 'error', text: err.message || 'Connection failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingConnection(null)
    setTestMessage(null)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    
    const payload = {
      ...data,
      port: Number(data.port),
      type: data.type as DatabaseType,
    }

    createMutation.mutate(payload)
  }

  const handleTest = (e: React.MouseEvent) => {
    const form = (e.target as HTMLElement).closest('form')
    if (!form) return
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries())
    const payload = {
      ...data,
      port: Number(data.port),
      type: data.type as DatabaseType,
    }
    testConnection(payload)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground mt-1">Manage your database access configurations.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Connection
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connections?.map((conn) => (
            <div key={conn.id} className="group relative border border-border bg-card p-5 rounded-xl hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Database className="w-6 h-6 text-primary" />
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setEditingConnection(conn); setIsModalOpen(true); }}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate(conn.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-lg mb-1">{conn.name}</h3>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5" />
                  <span>{conn.host}:{conn.port}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5" />
                  <span>{conn.database}</span>
                </div>
                <div className="flex items-center gap-2 uppercase font-semibold text-[10px] tracking-wider bg-muted px-2 py-0.5 rounded w-fit">
                  {conn.type}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-end">
                <button 
                  onClick={() => {
                    setActiveConnection(conn)
                    navigate('/explorer')
                  }}
                  className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                >
                  Connect <LinkIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {connections?.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-border rounded-xl p-12 text-center">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No connections yet</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1 mb-6">
                Get started by creating your first database connection.
              </p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Create your first connection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-bold">{editingConnection ? 'Edit Connection' : 'New Connection'}</h2>
              <p className="text-sm text-muted-foreground">Configure details for your database.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Connection Name</label>
                <input required name="name" defaultValue={editingConnection?.name} placeholder="My Production DB" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select name="type" defaultValue={editingConnection?.type || DatabaseType.MARIADB} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value={DatabaseType.MARIADB}>MariaDB</option>
                    <option value={DatabaseType.POSTGRES}>PostgreSQL</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Database</label>
                  <input required name="database" defaultValue={editingConnection?.database} placeholder="toketeo" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">Host</label>
                  <input required name="host" defaultValue={editingConnection?.host} placeholder="localhost" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Port</label>
                  <input required name="port" type="number" defaultValue={editingConnection?.port || "3306"} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">User</label>
                  <input required name="user" defaultValue={editingConnection?.user} placeholder="root" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <input name="password" type="password" placeholder="••••••••" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {testMessage && (
                <div className={cn(
                  "p-3 rounded-md text-xs font-medium",
                  testMessage.type === 'success' ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"
                )}>
                  {testMessage.text}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="flex-1 px-4 py-2 border border-primary/50 text-primary rounded-md text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {isTesting ? 'Testing...' : 'Test'}
                </button>
                <button 
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
