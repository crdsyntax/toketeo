import { Plus, Edit2, Shield, ChevronDown, Database, Upload, Download, Server, Unplug, Wifi, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection, DumpObjects, DumpSelection } from '@/types/database'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

const DB_TYPE_COLORS: Record<string, string> = {
  postgres: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  mysql: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  mariadb: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  mongodb: 'text-green-400 border-green-500/30 bg-green-500/10',
  mssql: 'text-red-400 border-red-500/30 bg-red-500/10',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      'px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border',
      DB_TYPE_COLORS[type] || 'text-muted-foreground border-border bg-muted'
    )}>
      {type === 'postgres' ? 'PG' :
       type === 'mysql' ? 'MY' :
       type === 'mariadb' ? 'MA' :
       type === 'mongodb' ? 'MO' :
       type === 'mssql' ? 'MS' :
       type?.slice(0, 2).toUpperCase()}
    </span>
  )
}

function PostgresContent({ conn, activeConnection, onSelect, onSchemaContextMenu, onLoaded }: { conn: Connection, activeConnection: Connection | null, onSelect: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void, onLoaded?: () => void }) {
  const { data: databases = [], isFetched } = useQuery({
    queryKey: ['databases', conn.id],
    queryFn: () => schemaService.getDatabases(conn.id),
    enabled: activeConnection?.id === conn.id,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => { if (isFetched) onLoaded?.() }, [isFetched, onLoaded])
  return (
    <>
      {databases.map((db) => (
        <DatabaseItem key={db} conn={conn} dbName={db} activeConnection={activeConnection} onSelect={onSelect} onSchemaContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

function SchemaContent({ conn, activeConnection, onSelect, onSchemaContextMenu, onLoaded }: { conn: Connection, activeConnection: Connection | null, onSelect: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void, onLoaded?: () => void }) {
  const { data: schemas = [], isFetched } = useQuery({
    queryKey: ['schemas', conn.id],
    queryFn: () => schemaService.getSchemas(conn.id),
    enabled: activeConnection?.id === conn.id,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => { if (isFetched) onLoaded?.() }, [isFetched, onLoaded])
  return (
    <>
      {schemas.map((s) => (
        <SchemaItem key={s} conn={conn} schema={s} isSelected={activeConnection?.id === conn.id && activeConnection?.database === s} onSelect={onSelect} onContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

export function ConnectionsSidebar({ connections, activeConnection, onConnect, onEdit, onNew, onDisconnect }: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const [loadingConnId, setLoadingConnId] = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
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
  const connectionErrors = useAppStore((state) => state.connectionErrors)
  const navigate = useNavigate()

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
    try {
      if (activeConnection?.id !== conn.id) {
        await onConnect(conn)
      }
      // Optimistic update: update frontend state immediately so the UI
      // reflects the selected schema without waiting for the backend.
      setActiveConnectionDatabase(schema)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['schemas'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['views'] })
      queryClient.invalidateQueries({ queryKey: ['procedures'] })
      queryClient.invalidateQueries({ queryKey: ['triggers'] })
      queryClient.invalidateQueries({ queryKey: ['functions'] })
      navigate('/explorer')
      // Fire the backend call in the background so the pool is updated,
      // but don't block the UI if it fails (explorer queries use explicit
      // schema parameters and work regardless of the pool's default db).
      schemaService.switchSchema(conn.id, schema).catch((e) => {
        console.error('Backend schema switch failed (non-critical):', e)
      })
    } catch (e) {
      toast.error(`Failed to switch schema: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleConnectionSingleClick = async (conn: Connection) => {
    if (connectingId === conn.id) return
    setSelectedConnId(conn.id)
    setConnectingId(conn.id)
    try {
      await onConnect(conn)
    } catch (e) {
      toast.error(`Failed to connect: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setConnectingId(null)
    }
  }

  const handleConnectionDoubleClick = async (conn: Connection) => {
    const willExpand = expandedConnId !== conn.id
    if (willExpand && activeConnection?.id !== conn.id) {
      if (connectingId === conn.id) return
      setConnectingId(conn.id)
      try {
        await onConnect(conn)
      } catch {
        setConnectingId(null)
        return
      }
      setConnectingId(null)
    }
    setExpandedConnId(willExpand ? conn.id : null)
    if (willExpand) setLoadingConnId(conn.id)
  }

  const handleContentLoaded = useCallback((connId: string) => {
    setLoadingConnId((prev) => prev === connId ? null : prev)
  }, [])

  return (
    <div className="w-72 border-r border-border bg-background flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border flex items-center justify-between">
        <h2
          onDoubleClick={() => navigate('/')}
          className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase select-none"
        >
          Connections
        </h2>
        <button
          onClick={onNew}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Server className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground/50 mb-3">No connections yet</p>
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-bold rounded-md hover:bg-primary/20 transition-all"
            >
              <Plus className="w-3 h-3" />
              Add Connection
            </button>
          </div>
        )}
        <div className="space-y-0.5 px-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={cn(
                'group relative rounded-lg transition-all duration-200',
                activeConnection?.id === conn.id
                  ? 'bg-accent/5 ring-1 ring-primary/10'
                  : 'hover:bg-muted/50',
                selectedConnId === conn.id && 'bg-accent/10 ring-1 ring-primary/20'
              )}
            >
              {activeConnection?.id === conn.id && connectionErrors[conn.id] && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-destructive/70" />
              )}
              {activeConnection?.id === conn.id && !connectionErrors[conn.id] && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-emerald-500/70" />
              )}
              <div
                className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                title="Double click to list schemas"
                onClick={() => handleConnectionSingleClick(conn)}
                onDoubleClick={() => handleConnectionDoubleClick(conn)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, connId: conn.id }) }}
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted/80 shrink-0">
                  <Database className={cn(
                    'w-3 h-3',
                    selectedConnId === conn.id ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      'text-xs font-semibold truncate',
                      selectedConnId === conn.id ? 'text-foreground' : 'text-foreground/90'
                    )}>
                      {conn.name}
                    </span>
                    {(connectingId === conn.id || loadingConnId === conn.id) && (
                      <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                    )}
                    {activeConnection?.id === conn.id && connectionErrors[conn.id] && (
                      <AlertTriangle className="w-3 h-3 text-destructive shrink-0" title={connectionErrors[conn.id]!} />
                    )}
                    <TypeBadge type={conn.type} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conn.ssh ? (
                      <Shield className="w-2.5 h-2.5 text-blue-400" />
                    ) : (
                      <Wifi className="w-2.5 h-2.5 text-muted-foreground/40" />
                    )}
                    <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
                      {conn.host}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(conn); }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (connectingId === conn.id) return;
                      const willExpand = expandedConnId !== conn.id;
                      if (willExpand && activeConnection?.id !== conn.id) {
                        setConnectingId(conn.id);
                        try {
                          await onConnect(conn);
                        } catch {
                          setConnectingId(null);
                          return;
                        }
                        setConnectingId(null);
                      }
                      setExpandedConnId(expandedConnId === conn.id ? null : conn.id);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <ChevronDown className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      expandedConnId === conn.id && 'rotate-180'
                    )} />
                  </button>
                </div>
              </div>

              {expandedConnId === conn.id && (
                <div className="pb-2 px-2 overflow-hidden animate-in slide-in-from-top-0.5 duration-150">
                  <div className="pl-3 ml-1.5 border-l border-border/40 space-y-0.5">
                    {conn.type === 'postgres' ? (
                      <PostgresContent conn={conn} activeConnection={activeConnection} onSelect={handleSchemaDoubleClick} onSchemaContextMenu={handleSchemaContextMenu} onLoaded={() => handleContentLoaded(conn.id)} />
                    ) : (
                      <SchemaContent conn={conn} activeConnection={activeConnection} onSelect={handleSchemaDoubleClick} onSchemaContextMenu={handleSchemaContextMenu} onLoaded={() => handleContentLoaded(conn.id)} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {contextMenu.visible && contextMenu.connId === activeConnection?.id && (
          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-50 min-w-[160px] bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={() => setContextMenu({ visible: false, x: 0, y: 0 })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 rounded-md hover:bg-slate-700/70 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setContextMenu({ visible: false, x: 0, y: 0 }); if (contextMenu.connId && typeof onDisconnect === 'function') onDisconnect(contextMenu.connId) }}
            >
              <Unplug className="w-3.5 h-3.5 text-slate-400" />
              Disconnect
            </button>
          </div>
        )}

        {schemaMenu && (
          <div
            ref={schemaMenuRef}
            style={{ left: schemaMenu.x, top: schemaMenu.y }}
            className="fixed z-50 min-w-[160px] bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative group">
              <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-200 rounded-md hover:bg-slate-700/70 hover:text-white cursor-pointer transition-colors">
                <span className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  Tools
                </span>
                <ChevronDown className="w-3 h-3 text-slate-500 -rotate-90" />
              </div>
              <div className="absolute left-full top-0 ml-1 hidden group-hover:block min-w-[140px] bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in duration-100">
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 rounded-md hover:bg-slate-700/70 hover:text-white transition-colors"
                  onClick={() => handleDumpClick(schemaMenu.conn, schemaMenu.schema)}
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  Dump
                </button>
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 rounded-md hover:bg-slate-700/70 hover:text-white transition-colors"
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
