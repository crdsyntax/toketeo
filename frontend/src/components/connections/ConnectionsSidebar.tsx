import { Plus, Edit2, Shield, ChevronDown, Server, Wifi, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection, DumpObjects, DumpSelection } from '@/types/database'
import { DatabaseType, DatabaseObjectType, ExplorerTab, ExecutionStatus } from '@/types/database'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { connectionService } from '@/services/connection.service'
import { useAppStore } from '@/store/useAppStore'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDiagramStore } from '@/diagram/store'
import { DatabaseItem } from './DatabaseItem'
import { SchemaItem } from './SchemaItem'
import { DumpRestoreModal } from './DumpRestoreModal'
import { PromptModal } from './PromptModal'
import { ConnectionContextMenu } from './ConnectionContextMenu'
import { SchemaContextMenu } from './SchemaContextMenu'
import { CreateSchemaModal } from './CreateSchemaModal'
import { DatabaseCredentialsModal } from './DatabaseCredentialsModal'
import { Button } from '@/components/ui/Button'
import { getEngineConfig, ENGINE_ORDER } from '@/lib/engine-icons'
import { openScriptTabForConnection } from '@/lib/connectionScript'
import toast from 'react-hot-toast'

interface ConnectionsSidebarProps {
  connections: Connection[]
  activeConnection: Connection | null
  onConnect: (conn: Connection) => Promise<void> | void
  onEdit: (conn: Connection) => void
  onNew: () => void
  onDisconnect?: (id: string) => void
}

function TypeBadge({ type }: { type: string }) {
  const config = getEngineConfig(type as DatabaseType)
  return (
    <span className={cn(
      'px-1 py-0.5 rounded font-bold uppercase tracking-wider border',
      config.bgClass, config.textClass, config.borderClass
    )}>
{type === DatabaseType.POSTGRES ? 'PG' :
       type === DatabaseType.MYSQL ? 'MY' :
       type === DatabaseType.MARIADB ? 'MA' :
       type === DatabaseType.MONGODB ? 'MO' :
       type === DatabaseType.SQLSERVER ? 'MS' :
       type === DatabaseType.REDIS ? 'RE' :
       type === DatabaseType.SQLITE ? 'SL' :
        type?.slice(0, 2).toUpperCase()}
    </span>
  )
}

function pseudoPing(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 4 + (h % 12)
}

function PostgresContent({ conn, activeConnection, activeDatabaseName, onSelect, onSelectSchema, onSelectDatabase, onSelectRedisNamespace, onToggleDefault, onSchemaContextMenu, onLoaded }: { conn: Connection, activeConnection: Connection | null, activeDatabaseName?: string | null, onSelect: (c: Connection, s: string) => void, onSelectSchema?: (c: Connection, dbName: string, s: string) => void, onSelectDatabase?: (c: Connection, dbName: string) => void, onSelectRedisNamespace?: (c: Connection, dbName: string, namespace: string) => void, onToggleDefault?: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void, onLoaded?: () => void }) {
  const { data: databases = [], isFetched } = useQuery({
    queryKey: ['databases', conn.id],
    queryFn: () => schemaService.getDatabases(conn.id),
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => { if (isFetched) onLoaded?.() }, [isFetched, onLoaded])
  return (
    <>
      {databases.map((db) => (
        <DatabaseItem key={db} conn={conn} dbName={db} activeConnection={activeConnection} activeDatabaseName={activeDatabaseName} onSelect={onSelect} onSelectSchema={onSelectSchema} onSelectDatabase={onSelectDatabase} onSelectRedisNamespace={onSelectRedisNamespace} onToggleDefault={onToggleDefault} onSchemaContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

function SchemaContent({ conn, activeConnection, onSelect, onToggleDefault, onSchemaContextMenu, onLoaded }: { conn: Connection, activeConnection: Connection | null, onSelect: (c: Connection, s: string) => void, onToggleDefault?: (c: Connection, s: string) => void, onSchemaContextMenu: (e: React.MouseEvent, conn: Connection, schema: string) => void, onLoaded?: () => void }) {
  const { data: schemas = [], isFetched } = useQuery({
    queryKey: ['schemas', conn.id],
    queryFn: () => schemaService.getSchemas(conn.id),
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => { if (isFetched) onLoaded?.() }, [isFetched, onLoaded])
  return (
    <>
      {schemas.map((s) => (
        <SchemaItem key={s} conn={conn} schema={s} isSelected={activeConnection?.id === conn.id && activeConnection?.database === s} isDefault={conn.defaultDatabase === s} onSelect={onSelect} onToggleDefault={onToggleDefault} onContextMenu={onSchemaContextMenu} />
      ))}
    </>
  )
}

export function ConnectionsSidebar({ connections, activeConnection, onConnect, onEdit, onNew, onDisconnect }: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const [loadingConnId, setLoadingConnId] = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const connectingRef = useRef<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, connId?: string }>({ visible: false, x: 0, y: 0 })
  const contextMenuRef = useRef<HTMLDivElement>(null)
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
  const [promptModal, setPromptModal] = useState<{
    title: string
    message?: string
    confirmLabel?: string
    destructive?: boolean
    inputPlaceholder?: string
    requireInput?: boolean
    onConfirm: (value: string) => void
  } | null>(null)
  const [showCreateSchema, setShowCreateSchema] = useState<{ conn: Connection; schema: string } | null>(null)
  const [credentialsTarget, setCredentialsTarget] = useState<{ conn: Connection; database: string } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<DatabaseType, boolean>>({
    [DatabaseType.POSTGRES]: false,
    [DatabaseType.MARIADB]: false,
    [DatabaseType.MYSQL]: false,
    [DatabaseType.MONGODB]: false,
    [DatabaseType.SQLSERVER]: false,
    [DatabaseType.SQLITE]: false,
    [DatabaseType.REDIS]: false,
  })
  const queryClient = useQueryClient()
  const { setActiveConnectionDatabase, addTab, addExplorerTab, updateExplorerTab, setExplorerState } = useAppStore()
  const connectedConnectionIds = useAppStore((state) => state.connectedConnectionIds)
  const setActiveConnection = useAppStore((state) => state.setActiveConnection)
  const connectionErrors = useAppStore((state) => state.connectionErrors)
  const navigate = useNavigate()
  const location = useLocation()
  const [activeDatabaseName, setActiveDatabaseName] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved ? parseInt(saved, 10) : 240
  })
  const isResizing = useRef(false)

  const groupedConnections = useMemo(() => {
    const groups: Record<DatabaseType, Connection[]> = {
      [DatabaseType.POSTGRES]: [],
      [DatabaseType.MARIADB]: [],
      [DatabaseType.MYSQL]: [],
      [DatabaseType.MONGODB]: [],
      [DatabaseType.SQLSERVER]: [],
      [DatabaseType.SQLITE]: [],
      [DatabaseType.REDIS]: [],
    }
    connections.forEach((conn) => {
      if (groups[conn.type]) {
        groups[conn.type].push(conn)
      }
    })
    return groups
  }, [connections])

  const toggleGroup = (type: DatabaseType) => {
    setExpandedGroups((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const handleDumpClick = async (conn: Connection, schema: string) => {
    setSchemaMenu(null)
    try {
      const objects = await schemaService.getDumpObjects(conn.id, schema)
      setTableSelection({ mode: 'dump', conn, schema, objects })
    } catch (e) {
      toast.error(`Failed to fetch objects: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleCredentialsClick = (conn: Connection, database: string) => {
    setSchemaMenu(null)
    setCredentialsTarget({ conn, database })
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
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0 })
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSchemaMenu(null)
        setContextMenu({ visible: false, x: 0, y: 0 })
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [])

  const handleToggleDefault = useCallback(async (conn: Connection, schema: string) => {
    const newDefault = conn.defaultDatabase === schema ? undefined : schema;
    try {
      const full = await connectionService.getOne(conn.id);
      await connectionService.update(conn.id, { ...full, defaultDatabase: newDefault });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      toast.success(newDefault ? `"${schema}" set as default` : 'Default removed');
    } catch (e) {
      toast.error(`Failed to update default: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [queryClient]);

  const handleSchemaDoubleClick = async (conn: Connection, schema: string) => {
    try {
      if (!connectedConnectionIds.includes(conn.id)) {
        await onConnect(conn)
      }
      setActiveConnection(conn)
      if (location.pathname === '/query') {
        const state = useAppStore.getState()
        const existingTab = state.tabs.find(t => t.connectionId === conn.id)
        if (existingTab) {
          state.setActiveTabId(existingTab.id)
          setActiveConnectionDatabase(schema)
        } else {
          addTab(conn.id, schema)
        }
      } else if (location.pathname === '/diagram') {
        setActiveConnectionDatabase(schema)
        // Update active diagram to use the newly selected connection/schema
        const { activeDiagramId, setDiagramConnection } = useDiagramStore.getState()
        if (activeDiagramId) {
          setDiagramConnection(activeDiagramId, conn.id, schema)
        }
        queryClient.invalidateQueries({ queryKey: ['schemas', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['tables', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['diagram', conn.id] })
      } else {
        // Optimistic update: update frontend state immediately so the UI
        // reflects the selected schema without waiting for the backend.
        setActiveConnectionDatabase(schema)
        const store = useAppStore.getState()
        const activeTabId = store.explorer.activeExplorerTabId
        const activeTab = activeTabId ? store.explorerTabs[activeTabId] : null
        // Keep the open explorer tab but point it at the newly selected
        // database: update its database and reset the object context so the
        // sidebar loads the new DB's objects without closing the tab or
        // losing its connection.
        const resetObjectContext = {
          selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
          activeTab: ExplorerTab.COLUMNS,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
          editableDdl: '',
          filter: '',
        }
        if (activeTab && activeTab.connectionId === conn.id) {
          updateExplorerTab(activeTabId!, { database: schema, ...resetObjectContext })
        } else {
          // The active tab belongs to another connection (or none). Reuse an
          // empty slot tab for this connection if one exists, otherwise open
          // a fresh database slot so the explorer shows the selected DB
          // without closing existing tabs or the connection.
          const emptySlot = Object.values(store.explorerTabs).find(
            (t) => t.connectionId === conn.id && !t.selectedItem?.name,
          )
          if (emptySlot) {
            updateExplorerTab(emptySlot.id, { database: schema, ...resetObjectContext })
            setExplorerState({ activeExplorerTabId: emptySlot.id })
          } else {
            addExplorerTab({
              id: `${conn.id}:${schema}:__db__`,
              connectionId: conn.id,
              database: schema,
              pageSize: 50,
              ...resetObjectContext,
            })
          }
        }
        queryClient.invalidateQueries({ queryKey: ['connections'] })
        queryClient.invalidateQueries({ queryKey: ['schemas', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['tables', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['views', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['procedures', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['triggers', conn.id] })
        queryClient.invalidateQueries({ queryKey: ['functions', conn.id] })
        navigate('/explorer')
      }
      // Redis uses SELECT (switch_database), not switch_schema
      if (conn.type === 'redis') {
        schemaService.switchDatabase(conn.id, schema).catch((e) => {
          console.error('Backend database switch failed (non-critical):', e)
        })
      } else {
        // Fire the backend call in the background so the pool is updated,
        // but don't block the UI if it fails (explorer queries use explicit
        // schema parameters and work regardless of the pool's default db).
        schemaService.switchSchema(conn.id, schema).catch((e) => {
          console.error('Backend schema switch failed (non-critical):', e)
        })
      }
    } catch (e) {
      toast.error(`Failed to switch schema: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleSchemaDatabaseDoubleClick = async (conn: Connection, dbName: string, schema: string) => {
    setActiveDatabaseName(dbName)
    await handleSchemaDoubleClick(conn, schema)
  }

  const handleDatabaseDoubleClick = async (conn: Connection, dbName: string) => {
    try {
      setActiveDatabaseName(dbName)
      if (!connectedConnectionIds.includes(conn.id)) {
        await onConnect(conn)
      }
      await schemaService.switchDatabase(conn.id, dbName)
      if (conn.type === DatabaseType.REDIS) {
        // Redis has no schemas: navigate straight to the db's tables (namespaces)
        await handleSchemaDoubleClick(conn, dbName)
        return
      }
      const schemas = await schemaService.getSchemas(conn.id)
      const schema = schemas.find((s) => s === 'public') ?? schemas[0] ?? 'public'
      await handleSchemaDoubleClick(conn, schema)
    } catch (e) {
      toast.error(`Failed to switch database: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleRedisNamespaceDoubleClick = async (conn: Connection, dbName: string, namespace: string) => {
    try {
      await handleDatabaseDoubleClick(conn, dbName)
      const store = useAppStore.getState()
      const activeTabId = store.explorer.activeExplorerTabId
      if (activeTabId) {
        updateExplorerTab(activeTabId, {
          selectedItem: { name: namespace, type: DatabaseObjectType.TABLE },
          activeTab: ExplorerTab.DATA,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['tables', conn.id, dbName] })
      queryClient.invalidateQueries({ queryKey: ['redis-keys', conn.id, dbName] })
    } catch (e) {
      toast.error(`Failed to explore namespace: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const handleConnectionSingleClick = async (conn: Connection) => {
    if (connectingRef.current.has(conn.id)) return
    setSelectedConnId(conn.id)
    if (connectedConnectionIds.includes(conn.id)) {
      setActiveConnection(conn)
      openScriptTabForConnection(conn.id)
      return
    }
    connectingRef.current.add(conn.id)
    setConnectingId(conn.id)
    try {
      // Conectar NO abre el explorer: solo expande la conexión para mostrar
      // sus esquemas/bases. El explorer se abre únicamente con doble-click
      // sobre un esquema (Postgres) o una base de datos (SQL/Mongo/Redis).
      await onConnect(conn)
      setExpandedConnId(conn.id)
      setLoadingConnId(conn.id)
    } catch (e) {
      toast.error(`Failed to connect: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      connectingRef.current.delete(conn.id)
      setConnectingId(null)
    }
  }

  const handleConnectionDoubleClick = async (conn: Connection) => {
    const willExpand = expandedConnId !== conn.id
    if (willExpand && !connectedConnectionIds.includes(conn.id)) {
      if (connectingRef.current.has(conn.id)) return
      connectingRef.current.add(conn.id)
      setConnectingId(conn.id)
      try {
        await onConnect(conn)
      } catch {
        connectingRef.current.delete(conn.id)
        setConnectingId(null)
        return
      }
      connectingRef.current.delete(conn.id)
      setConnectingId(null)
    }
    setExpandedConnId(willExpand ? conn.id : null)
    if (willExpand) setLoadingConnId(conn.id)
  }

  const handleContentLoaded = useCallback((connId: string) => {
    setLoadingConnId((prev) => prev === connId ? null : prev)
  }, [])

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: PointerEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(180, Math.min(600, startWidth + ev.clientX - startX))
      setSidebarWidth(newWidth)
    }
    const onUp = () => {
      isResizing.current = false
      localStorage.setItem('sidebarWidth', String(sidebarWidth))
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  return (
    <div className="border-r border-border bg-background flex flex-col h-full relative shrink-0" style={{ width: sidebarWidth }}>
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <h2
          onDoubleClick={() => navigate('/')}
          className="font-bold tracking-[0.2em] text-muted-foreground uppercase select-none"
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
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Active Connections
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {connectedConnectionIds.length} live
          </span>
        </div>
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Server className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground/50 mb-3">No connections yet</p>
            <Button variant="primary" size="sm" onClick={onNew}>
              <Plus className="w-3 h-3" />
              Add Connection
            </Button>
          </div>
        )}
        <div className="space-y-1 px-2">
          {ENGINE_ORDER.map((engineType) => {
            const engineConns = groupedConnections[engineType]
            if (engineConns.length === 0) return null
            const config = getEngineConfig(engineType)
            const EngineIcon = config.icon
            const isGroupExpanded = expandedGroups[engineType]

            return (
              <div key={engineType} className="mb-1">
                <button
                  onClick={() => toggleGroup(engineType)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-all group"
                >
                  <ChevronDown className={cn(
                    'w-3 h-3 text-muted-foreground transition-transform duration-200',
                    !isGroupExpanded && '-rotate-90'
                  )} />
                  <div className={cn(
                    'flex items-center justify-center w-5 h-5 rounded',
                    config.bgClass
                  )}>
                    <EngineIcon className={cn('w-3 h-3', config.textClass)} />
                  </div>
                  <span className="font-bold uppercase tracking-wider text-muted-foreground">
                    {config.label}
                  </span>
                  <span className="text-muted-foreground/50 ml-auto">
                    {engineConns.length}
                  </span>
                </button>

                {isGroupExpanded && (
                  <div className="space-y-0.5 ml-2">
                    {engineConns.map((conn) => (
                      <div
                        key={conn.id}
                        className={cn(
                          'group relative rounded-md transition-all duration-200',
                          connectedConnectionIds.includes(conn.id) && activeConnection?.id === conn.id
                            ? 'bg-accent-muted ring-1 ring-accent/20'
                            : 'hover:bg-accent-muted/50',
                          connectedConnectionIds.includes(conn.id) && selectedConnId === conn.id && 'bg-accent-muted ring-1 ring-accent/30'
                        )}
                      >
                        {connectedConnectionIds.includes(conn.id) && connectionErrors[conn.id] && (
                          <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-destructive/70" />
                        )}
                        {connectedConnectionIds.includes(conn.id) && !connectionErrors[conn.id] && (
                          <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-emerald-500/70" />
                        )}
                        <div
                          className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                          title="Double click to list schemas"
                          onClick={() => handleConnectionSingleClick(conn)}
                          onDoubleClick={() => handleConnectionDoubleClick(conn)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, connId: conn.id }) }}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              connectedConnectionIds.includes(conn.id)
                                ? 'bg-emerald-400'
                                : 'bg-muted-foreground/20'
                            )}
                          />
                          <div className={cn(
                            'flex items-center justify-center w-6 h-6 rounded-md shrink-0',
                            config.bgClass
                          )}>
                            <EngineIcon className={cn('w-3 h-3', config.textClass)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                'font-semibold truncate',
                                connectedConnectionIds.includes(conn.id) && selectedConnId === conn.id ? 'text-foreground' : 'text-foreground/90'
                              )}>
                                {conn.name}
                              </span>
                              {(connectingId === conn.id || loadingConnId === conn.id) && (
                                <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                              )}
                              {connectedConnectionIds.includes(conn.id) && connectionErrors[conn.id] && (
                                <span title={connectionErrors[conn.id]!}>
                                  <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                                </span>
                              )}
                              <TypeBadge type={conn.type} />
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {conn.ssh ? (
                                <Shield className="w-2.5 h-2.5 text-blue-400" />
                              ) : (
                                <Wifi className="w-2.5 h-2.5 text-muted-foreground/40" />
                              )}
                              <span className="text-muted-foreground/60 font-mono truncate">
                                {conn.host}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {connectedConnectionIds.includes(conn.id) && !connectionErrors[conn.id] && (
                              <span className="text-[10px] font-bold text-emerald-400/90 font-mono mr-1 shrink-0">
                                {pseudoPing(conn.id)}ms
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(conn); }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {connectedConnectionIds.includes(conn.id) && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (connectingId === conn.id) return;
                                  const willExpand = expandedConnId !== conn.id;
                                  if (willExpand && !connectedConnectionIds.includes(conn.id)) {
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
                            )}
                          </div>
                        </div>

                        {expandedConnId === conn.id && (
                          <div className="pb-2 px-2 overflow-hidden animate-in slide-in-from-top-0.5 duration-150">
                            <div className="pl-3 ml-1.5 border-l border-border/40 space-y-0.5">
                              {conn.type === DatabaseType.POSTGRES || conn.type === DatabaseType.REDIS ? (
                                  <PostgresContent conn={conn} activeConnection={activeConnection} activeDatabaseName={activeDatabaseName} onSelect={handleSchemaDoubleClick} onSelectSchema={handleSchemaDatabaseDoubleClick} onSelectDatabase={conn.type === DatabaseType.POSTGRES || conn.type === DatabaseType.REDIS ? handleDatabaseDoubleClick : undefined} onSelectRedisNamespace={conn.type === DatabaseType.REDIS ? handleRedisNamespaceDoubleClick : undefined} onSchemaContextMenu={handleSchemaContextMenu} onToggleDefault={handleToggleDefault} onLoaded={() => handleContentLoaded(conn.id)} />
                              ) : (
                                <SchemaContent conn={conn} activeConnection={activeConnection} onSelect={handleSchemaDoubleClick} onToggleDefault={handleToggleDefault} onSchemaContextMenu={handleSchemaContextMenu} onLoaded={() => handleContentLoaded(conn.id)} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {contextMenu.visible && contextMenu.connId && connectedConnectionIds.includes(contextMenu.connId) && (
          <ConnectionContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            connId={contextMenu.connId}
            connections={connections}
            onDisconnect={onDisconnect}
            onConnect={onConnect}
            onClose={() => setContextMenu({ visible: false, x: 0, y: 0 })}
            queryClient={queryClient}
            setPromptModal={setPromptModal}
            containerRef={contextMenuRef}
          />
        )}

        {schemaMenu && (
          <SchemaContextMenu
            ref={schemaMenuRef}
            x={schemaMenu.x}
            y={schemaMenu.y}
            conn={schemaMenu.conn}
            schema={schemaMenu.schema}
            onClose={() => setSchemaMenu(null)}
            queryClient={queryClient}
            setPromptModal={setPromptModal}
            handleDumpClick={handleDumpClick}
            handleRestoreClick={handleRestoreClick}
            handleCredentialsClick={handleCredentialsClick}
            onCreateSchemaClick={() => setShowCreateSchema({ conn: schemaMenu.conn, schema: schemaMenu.schema })}
          />
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

        {promptModal && (
          <PromptModal
            title={promptModal.title}
            message={promptModal.message}
            confirmLabel={promptModal.confirmLabel}
            destructive={promptModal.destructive}
            inputPlaceholder={promptModal.inputPlaceholder}
            requireInput={promptModal.requireInput}
            onConfirm={promptModal.onConfirm}
            onClose={() => setPromptModal(null)}
          />
        )}

        {showCreateSchema && (
          <CreateSchemaModal
            conn={showCreateSchema.conn}
            onClose={() => setShowCreateSchema(null)}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ['databases', showCreateSchema.conn.id] })
              queryClient.invalidateQueries({ queryKey: ['schemas', showCreateSchema.conn.id] })
              setShowCreateSchema(null)
            }}
          />
        )}

        {credentialsTarget && (
          <DatabaseCredentialsModal
            connId={credentialsTarget.conn.id}
            connName={credentialsTarget.conn.name}
            database={credentialsTarget.database}
            onClose={() => setCredentialsTarget(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['databases', credentialsTarget.conn.id] })
            }}
          />
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-10"
        onPointerDown={handleResizePointerDown}
      />
    </div>
  )
}
