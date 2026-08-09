import { Unplug, RefreshCw, Database, Trash2 } from 'lucide-react'
import type { Connection } from '@/types/database'
import type { QueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import toast from 'react-hot-toast'
import type { RefObject } from 'react'

interface ConnectionContextMenuProps {
  x: number
  y: number
  connId: string
  connections: Connection[]
  onDisconnect?: (id: string) => void
  onConnect: (conn: Connection) => Promise<void> | void
  onClose: () => void
  queryClient: QueryClient
  containerRef?: RefObject<HTMLDivElement | null>
  setPromptModal: (modal: {
    title: string
    message?: string
    confirmLabel?: string
    destructive?: boolean
    inputPlaceholder?: string
    requireInput?: boolean
    onConfirm: (value: string) => void
  } | null) => void
}

export function ConnectionContextMenu({
  x, y, connId, connections,
  onDisconnect, onConnect, onClose, queryClient, setPromptModal, containerRef,
}: ConnectionContextMenuProps) {
  return (
    <div
      ref={containerRef}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] bg-muted border border-border rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); if (connId && typeof onDisconnect === 'function') onDisconnect(connId) }}
      >
        <Unplug className="w-3.5 h-3.5 text-muted-foreground" />
        Disconnect
      </button>
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={async (e) => {
          e.stopPropagation()
          onClose()
          const conn = connections.find((c) => c.id === connId)
          if (!conn) return
          try {
            await onConnect(conn)
            toast.success(`Connection "${conn.name}" refreshed`)
          } catch (err) {
            toast.error(`Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }}
      >
        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        Refresh Connection
      </button>
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
          queryClient.invalidateQueries({ queryKey: ['databases', connId] })
          queryClient.invalidateQueries({ queryKey: ['schemas', connId] })
          queryClient.invalidateQueries({ queryKey: ['tables', connId] })
          toast.success('Schemas refreshed')
        }}
      >
        <Database className="w-3.5 h-3.5 text-muted-foreground" />
        Refresh Schemas
      </button>
      <div className="border-t border-border my-1" />
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
          setPromptModal({
            title: 'Create Database',
            message: 'Enter database name:',
            confirmLabel: 'Create',
            inputPlaceholder: 'database_name',
            requireInput: true,
            onConfirm: async (name) => {
              try {
                await schemaService.createDatabase(connId, name)
                toast.success(`Database "${name}" created`)
                queryClient.invalidateQueries({ queryKey: ['databases', connId] })
                queryClient.invalidateQueries({ queryKey: ['schemas', connId] })
              } catch (err) {
                toast.error(`Failed to create database: ${err instanceof Error ? err.message : 'Unknown error'}`)
              }
              setPromptModal(null)
            },
          })
        }}
      >
        <Database className="w-3.5 h-3.5 text-muted-foreground" />
        Create Database
      </button>
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-destructive rounded-md hover:bg-destructive/10 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
          setPromptModal({
            title: 'Delete Database',
            message: 'Enter the database name to delete:',
            confirmLabel: 'Delete',
            destructive: true,
            inputPlaceholder: 'database_name',
            requireInput: true,
            onConfirm: (name) => {
              setPromptModal({
                title: 'Confirm Delete',
                message: `Are you sure you want to permanently delete database "${name}"? This action cannot be undone.`,
                confirmLabel: 'Delete',
                destructive: true,
                requireInput: false,
                onConfirm: async () => {
                  try {
                    await schemaService.dropDatabase(connId, name)
                    toast.success(`Database "${name}" deleted`)
                    queryClient.invalidateQueries({ queryKey: ['databases', connId] })
                    queryClient.invalidateQueries({ queryKey: ['schemas', connId] })
                  } catch (err) {
                    toast.error(`Failed to delete database: ${err instanceof Error ? err.message : 'Unknown error'}`)
                  }
                  setPromptModal(null)
                },
              })
            },
          })
        }}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete Database
      </button>
    </div>
  )
}
