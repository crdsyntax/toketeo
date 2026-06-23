import { Plus, Edit2, Globe, Shield, ChevronDown, ChevronRight, Database, Upload, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection, DumpObjects, DumpSelection } from '@/types/database'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { DatabaseItem } from './DatabaseItem'
import { SchemaItem } from './SchemaItem'
import { DumpRestoreModal } from './DumpRestoreModal'
import toast from 'react-hot-toast'

interface ConnectionsSidebarProps {
  connections: Connection[]
  activeConnection: Connection | null
  onConnect: (conn: Connection) => Promise<void> | void
  onEdit: (conn: Connection) => void
  onNew: () => void
  onDisconnect?: (id: string) => void
}

function PostgresContent({ conn, onSelect, onSchemaContextMenu }: { conn: Connection, onSelect: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void }) {
  const { data: databases = [] } = useQuery({
    queryKey: ['databases', conn.id],
    queryFn: () => schemaService.getDatabases(conn.id),
    enabled: !!conn.id,
    staleTime: 5 * 60 * 1000,
  })
  return (
    <>
      {databases.map((db) => (
        <DatabaseItem key={db} conn={conn} dbName={db} onSelect={onSelect} onSchemaContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

function SchemaContent({ conn, onSelect, onSchemaContextMenu }: { conn: Connection, onSelect: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void }) {
  const { data: schemas = [] } = useQuery({
    queryKey: ['schemas', conn.id],
    queryFn: () => schemaService.getSchemas(conn.id),
    enabled: !!conn.id,
    staleTime: 5 * 60 * 1000,
  })
  return (
    <>
      {schemas.map((s) => (
        <SchemaItem key={s} conn={conn} schema={s} onSelect={onSelect} onContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

export function ConnectionsSidebar({ connections, activeConnection, onConnect, onEdit, onNew, onDisconnect }: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, connId?: string }>({ visible: false, x: 0, y: 0 })
  const [schemaMenu, setSchemaMenu] = useState<{
    x: number
    y: number
    conn: Connection
    schema: string
  } | null>(null)
  const schemaMenuRef = useRef<HTMLDivElement>(null)
  const [tableSelection, setTableSelection] = useState<{
    mode: 'dump' | 'restore'
    conn: Connection
    schema: string
    objects: DumpObjects
    filePath?: string
  } | null>(null)
  const queryClient = useQueryClient()
  const { setActiveConnectionDatabase } = useAppStore()
  const navigate = useNavigate()

  const switchSchemaMutation = useMutation({
    mutationFn: ({ connectionId, schema }: { connectionId: string, schema: string }) =>
      schemaService.switchSchema(connectionId, schema),
    onSuccess: (_, { schema }) => {
      setActiveConnectionDatabase(schema)
      queryClient.invalidateQueries({ queryKey: ['schemas'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['views'] })
      queryClient.invalidateQueries({ queryKey: ['procedures'] })
      queryClient.invalidateQueries({ queryKey: ['triggers'] })
      queryClient.invalidateQueries({ queryKey: ['functions'] })
      navigate('/explorer')
    }
  })

  const handleDumpClick = async (conn: Connection, schema: string) => {
    setSchemaMenu(null)
    try {
      const objects = await schemaService.getDumpObjects(conn.id, schema)
      setTableSelection({ mode: 'dump', conn, schema, objects })
    } catch (e) {
      toast.error(`Failed to fetch objects: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleRestoreClick = async (conn: Connection, schema: string) => {
    setSchemaMenu(null)
    try {
      const result = await schemaService.pickAndParseDumpFile()
      if (result) {
        setTableSelection({
          mode: 'restore',
          conn,
          schema,
          filePath: result.filePath,
          objects: { tables: result.tables, views: [], triggers: [], procedures: [], functions: [] },
        })
      }
    } catch (e) {
      toast.error(`Failed to pick dump file: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleDumpStart = async (selection: DumpSelection) => {
    if (!tableSelection) return
    try {
      const result = await schemaService.dumpSchema(tableSelection.conn.id, tableSelection.schema, selection)
      if (result) {
        return { filePath: result.filePath, integrity: result.integrity }
      }
    } catch (e) {
      toast.error(`Dump failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setTableSelection(null)
    }
  }

  const handleRestoreStart = async (selection: DumpSelection) => {
    if (!tableSelection || !tableSelection.filePath) return
    const selectedTables = selection.tables
    if (selectedTables.length === 0) return
    try {
      await schemaService.restoreSchemaSelected(tableSelection.conn.id, tableSelection.schema, tableSelection.filePath, selectedTables)
      toast.success(`Schema "${tableSelection.schema}" restored successfully`)
      setTableSelection(null)
    } catch (e) {
      toast.error(`Restore failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleSchemaContextMenu = (e: React.MouseEvent, conn: Connection, schema: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSchemaMenu({ x: e.clientX, y: e.clientY, conn, schema })
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (schemaMenuRef.current && !schemaMenuRef.current.contains(e.target as Node)) {
        setSchemaMenu(null)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSchemaMenu(null)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [])

  const handleSchemaDoubleClick = async (conn: Connection, schema: string) => {
    if (activeConnection?.id !== conn.id) {
      await onConnect(conn)
    }
    switchSchemaMutation.mutate({ connectionId: conn.id, schema })
  }

  return (
    <div className="w-72 border-r border-border bg-secondary/50 flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between bg-background/50">
        <h2 onDoubleClick={() => navigate('/')} className="cursor-pointer text-[10px] font-bold flex items-center gap-2 uppercase tracking-[0.2em] text-muted-foreground">
          Connections
        </h2>
        <button 
          onClick={onNew} 
          className="p-1.5 hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1 scrollbar-thin">
          {connections.map((conn) => (
          <div 
            key={conn.id}
            className={cn(
              "group transition-all border-l-2",
              activeConnection?.id === conn.id 
                ? "border-l-emerald-500 bg-accent/5" 
                : "border-l-transparent",
              selectedConnId === conn.id
                ? "bg-accent/10 border-l-primary"
                : "hover:bg-accent/5"
            )}
          >
            <div 
              className="p-2 cursor-pointer flex justify-between items-center" 
              onClick={() => { setSelectedConnId(conn.id); onConnect(conn); }}
              onDoubleClick={() => setExpandedConnId(expandedConnId === conn.id ? null : conn.id)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, connId: conn.id }) }}
            >
              <div className="flex-1 truncate">
                <div className="flex items-center gap-2">
                    {activeConnection?.id === conn.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                    <span className={cn(
                      "text-xs font-bold truncate block",
                      selectedConnId === conn.id ? "text-primary" : "text-foreground"
                    )}>
                      {conn.name}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5 ml-3.5">
                  {conn.ssh ? <Shield className="w-2.5 h-2.5 text-blue-400" /> : <Globe className="w-2.5 h-2.5 opacity-50" />}
                  <span className="truncate opacity-70">{conn.host}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button 
                  onClick={(e) => { e.stopPropagation(); onEdit(conn); }} 
                  className="p-1 opacity-0 group-hover:opacity-100 hover:text-accent transition-all"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (activeConnection?.id !== conn.id) onConnect(conn);
                    setExpandedConnId(expandedConnId === conn.id ? null : conn.id); 
                  }}
                  className="p-1 hover:text-accent transition-colors"
                >
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", expandedConnId === conn.id && "rotate-180")} />
                </button>
              </div>
            </div>
            
            {expandedConnId === conn.id && (
              <div className="pb-2 px-2 animate-in slide-in-from-top-1 duration-200">
                <div className="pl-3 ml-1 border-l border-border/50 space-y-0.5">
                  {conn.type === 'postgres' ? (
                    <PostgresContent conn={conn} onSelect={handleSchemaDoubleClick} onSchemaContextMenu={handleSchemaContextMenu} />
                  ) : (
                    <SchemaContent conn={conn} onSelect={handleSchemaDoubleClick} onSchemaContextMenu={handleSchemaContextMenu} />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {contextMenu.visible && contextMenu.connId === activeConnection?.id && (
          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 bg-background border border-border rounded-md shadow-md"
            onClick={() => setContextMenu({ visible: false, x: 0, y: 0 })}
          >
            <div className="p-2 text-sm">
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={(e) => { e.stopPropagation(); setContextMenu({ visible: false, x: 0, y: 0 }); if (contextMenu.connId && typeof onDisconnect === 'function') onDisconnect(contextMenu.connId) }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {schemaMenu && (
          <div
            ref={schemaMenuRef}
            style={{ left: schemaMenu.x, top: schemaMenu.y }}
            className="fixed z-50 min-w-[160px] bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl shadow-black/50 py-1 select-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative group">
              <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70 cursor-pointer rounded-sm mx-1">
                <span className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  Tools
                </span>
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </div>
              <div className="absolute left-full top-0 ml-0.5 hidden group-hover:block min-w-[140px] bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl shadow-black/50 py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70 cursor-pointer rounded-sm"
                  onClick={() => handleDumpClick(schemaMenu.conn, schemaMenu.schema)}
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  Dump
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70 cursor-pointer rounded-sm"
                  onClick={() => handleRestoreClick(schemaMenu.conn, schemaMenu.schema)}
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  Restore
                </button>
              </div>
            </div>
          </div>
        )}

        {tableSelection && tableSelection.mode === 'dump' && (
          <DumpRestoreModal
            mode="dump"
            schema={tableSelection.schema}
            connId={tableSelection.conn.id}
            objects={tableSelection.objects}
            onStart={handleDumpStart}
            onClose={() => setTableSelection(null)}
          />
        )}

        {tableSelection && tableSelection.mode === 'restore' && (
          <DumpRestoreModal
            mode="restore"
            schema={tableSelection.schema}
            connId={tableSelection.conn.id}
            objects={tableSelection.objects}
            onStart={handleRestoreStart}
            onClose={() => setTableSelection(null)}
          />
        )}
      </div>
    </div>
  )
}
