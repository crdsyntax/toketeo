import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { ConnectionCard } from '@/components/connections/ConnectionCard'
import { ConnectionModal } from '@/components/connections/ConnectionModal'

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
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
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
    navigate('/explorer')
  }

  const handleEdit = (conn: Connection) => {
    setEditingConnection(conn)
    setIsModalOpen(true)
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
            <ConnectionCard 
              key={conn.id} 
              connection={conn} 
              onEdit={handleEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              onConnect={handleConnect}
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
    </div>
  )
}
