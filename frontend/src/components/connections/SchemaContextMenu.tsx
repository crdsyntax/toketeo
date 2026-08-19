import { useState, useRef, forwardRef, type Ref } from 'react'
import { Database, Upload, Download, ChevronDown, Trash2, KeyRound } from 'lucide-react'
import { DatabaseType, type Connection } from '@/types/database'
import type { QueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import toast from 'react-hot-toast'

interface SchemaContextMenuProps {
  x: number
  y: number
  conn: Connection
  schema: string
  onClose: () => void
  queryClient: QueryClient
  setPromptModal: (modal: {
    title: string
    message?: string
    confirmLabel?: string
    destructive?: boolean
    inputPlaceholder?: string
    requireInput?: boolean
    onConfirm: (value: string) => void
  } | null) => void
  handleDumpClick: (conn: Connection, schema: string) => void
  handleRestoreClick: (conn: Connection, schema: string) => void
  handleCredentialsClick: (conn: Connection, database: string) => void
  onCreateSchemaClick: () => void
}

export const SchemaContextMenu = forwardRef<HTMLDivElement, SchemaContextMenuProps>((
  props: SchemaContextMenuProps,
  ref: Ref<HTMLDivElement>,
) => {
  const { x, y, conn, schema, onClose, queryClient, setPromptModal, handleDumpClick, handleRestoreClick, handleCredentialsClick, onCreateSchemaClick } = props
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const submenuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSubmenu = () => {
    if (submenuTimeout.current) clearTimeout(submenuTimeout.current)
    setSubmenuOpen(true)
  }

  const closeSubmenu = () => {
    submenuTimeout.current = setTimeout(() => {
      setSubmenuOpen(false)
    }, 150)
  }

  return (
      <div
        ref={ref}
        style={{ left: x, top: y }}
        className="fixed z-50 min-w-[160px] bg-muted border border-border rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="relative"
          onMouseEnter={openSubmenu}
          onMouseLeave={closeSubmenu}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
            <span className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              Tools
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground -rotate-90" />
          </div>
          {submenuOpen && (
          <div
            className="absolute left-full top-0 ml-1 min-w-[140px] bg-muted border border-border rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in duration-100"
            onMouseEnter={openSubmenu}
            onMouseLeave={closeSubmenu}
          >
            {conn.type !== DatabaseType.MONGODB && conn.type !== DatabaseType.REDIS && (
              <>
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleDumpClick(conn, schema)}
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  Dump
                </button>
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleRestoreClick(conn, schema)}
                >
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  Restore
                </button>
              </>
            )}
            {conn.type === DatabaseType.POSTGRES && (
              <>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => {
                    onClose()
                    onCreateSchemaClick()
                  }}
                >
                  <Database className="w-3.5 h-3.5 text-muted-foreground" />
                  Create Schema
                </button>
              </>
            )}
            <div className="border-t border-border my-1" />
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-destructive rounded-md hover:bg-destructive/10 transition-colors"
              onClick={() => {
                onClose()
                setPromptModal({
                  title: 'Drop Schema',
                  message: `Are you sure you want to drop schema "${schema}" on "${conn.name}"? This action cannot be undone and will delete all objects inside it.`,
                  confirmLabel: 'Drop',
                  destructive: true,
                  requireInput: false,
                  onConfirm: async () => {
                    try {
                      await schemaService.dropSchema(conn.id, schema)
                      toast.success(`Schema "${schema}" dropped`)
                      queryClient.invalidateQueries({ queryKey: ['databases', conn.id] })
                      queryClient.invalidateQueries({ queryKey: ['schemas', conn.id] })
                    } catch (err) {
                      toast.error(`Failed to drop schema: ${err instanceof Error ? err.message : 'Unknown error'}`)
                    }
                    setPromptModal(null)
                  },
                })
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Drop Schema
            </button>
            {conn.type === DatabaseType.MONGODB && (
            <>
              <div className="border-t border-border my-1" />
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={async () => {
                  onClose()
                  try {
                    const result = await schemaService.mongoBackupDatabase(conn.id, schema)
                    if (result) {
                      toast.success(`Backup saved to: ${result}`)
                    }
                  } catch (err) {
                    toast.error(`Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
                  }
                }}
              >
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                Backup MongoDB
              </button>
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={async () => {
                  onClose()
                  try {
                    const result = await schemaService.mongoRestoreDatabase(conn.id, schema)
                    if (result) {
                      toast.success(result)
                    }
                  } catch (err) {
                    toast.error(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
                  }
                }}
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Restore MongoDB
              </button>
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => handleCredentialsClick(conn, schema)}
              >
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                Credentials
              </button>
              <div className="border-t border-border my-1" />
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
                  onClose()
                  setPromptModal({
                    title: 'Create Collection',
                    message: 'Enter collection name:',
                    confirmLabel: 'Create',
                    inputPlaceholder: 'collection_name',
                    requireInput: true,
                    onConfirm: async (name) => {
                      try {
                        await schemaService.createCollection(conn.id, schema, name)
                        toast.success(`Collection "${name}" created`)
                        queryClient.invalidateQueries({ queryKey: ['tables', conn.id] })
                      } catch (err) {
                        toast.error(`Failed to create collection: ${err instanceof Error ? err.message : 'Unknown error'}`)
                      }
                      setPromptModal(null)
                    },
                  })
                }}
              >
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                Create Collection
              </button>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  )
})
