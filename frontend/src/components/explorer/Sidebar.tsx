import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseObject, QueryResult } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseObjectType, DatabaseType } from '@/types/database'
import { Table2, Eye, Terminal, Zap, Search, RefreshCw as RefreshIcon, ChevronRight, Binary, Database, Copy, Trash2, Plus, Send, ClipboardCopy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { CreateObjectModal } from './CreateObjectModal'
import { schemaService } from '@/services/schema.service'
import { generateTableTemplates, type SqlTemplateAction } from '@/lib/sqlGenerator'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'react-hot-toast'

interface SidebarProps {
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void
  currentSchema: string | undefined
  connectionId?: string
  handleRefetch: () => void
  isLoadingSidebar: boolean
  search: string
  setSearch: (s: string) => void
  filteredItems: { name: string }[]
  selectedItem: DatabaseObject | null
  setSelectedItem: (item: DatabaseObject) => void
  setPage: (page: number) => void
  setSocketResults: (res: QueryResult | null) => void
  setExecutionStatus: (status: ExecutionStatus) => void
  setExecutionError: (err: string | null) => void
  setParamsValues: (v: Record<string, string>) => void
  setActiveTab: (tab: ExplorerTab) => void
  isCollapsed?: boolean
  onToggle?: () => void
  dbType?: DatabaseType
}

export function Sidebar({
  sidebarTab, setSidebarTab, currentSchema, connectionId, handleRefetch, isLoadingSidebar,
  search, setSearch, filteredItems, selectedItem, setSelectedItem,
  setPage, setSocketResults, setExecutionStatus, setExecutionError,
  setParamsValues, setActiveTab, isCollapsed, onToggle, dbType
}: SidebarProps) {
  const isMongoDB = dbType === DatabaseType.MONGODB
  const isRedis = dbType === DatabaseType.REDIS
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: { name: string; type: DatabaseObjectType } } | null>(null);
  const [createModalType, setCreateModalType] = useState<DatabaseObjectType | null>(null)
  const navigate = useNavigate()
  const openTab = useAppStore((s) => s.openTab)

  const SQL_TEMPLATE_ACTIONS: { action: SqlTemplateAction; label: string }[] = [
    { action: 'select', label: 'Select' },
    { action: 'insert', label: 'Create' },
    { action: 'update', label: 'Update' },
    { action: 'delete', label: 'Delete' },
  ]

  const handleTableSqlAction = async (
    action: SqlTemplateAction,
    target: 'editor' | 'clipboard',
  ) => {
    if (!contextMenu || !connectionId) return
    const { name } = contextMenu.item
    try {
      const cols = await schemaService.getColumns(connectionId, name, currentSchema)
      const columns = cols.map((c) => c.name)
      const pks = cols.filter((c) => c.isPrimaryKey).map((c) => c.name)
      const sql = generateTableTemplates(name, dbType, columns, pks)[action]
      if (target === 'clipboard') {
        await navigator.clipboard.writeText(sql)
        toast.success(`${action.toUpperCase()} SQL copied to clipboard`)
      } else {
        openTab(`${name} ${action}`, sql, connectionId)
        navigate('/query')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate SQL'
      toast.error(message)
    }
  }

  const sidebarTabToObjectType = (tab: SidebarTab): DatabaseObjectType => {
    switch (tab) {
      case SidebarTab.TABLES: return DatabaseObjectType.TABLE
      case SidebarTab.VIEWS: return DatabaseObjectType.VIEW
      case SidebarTab.PROCEDURES: return DatabaseObjectType.PROCEDURE
      case SidebarTab.TRIGGERS: return DatabaseObjectType.TRIGGER
      case SidebarTab.FUNCTIONS: return DatabaseObjectType.FUNCTION
    }
  }

  // For MongoDB only show Collections (= Tables) and Views (if any)
  // For Redis only show Keys (= Tables)
  const visibleTabs = isMongoDB || isRedis
    ? [SidebarTab.TABLES]
    : [SidebarTab.TABLES, SidebarTab.VIEWS, SidebarTab.PROCEDURES, SidebarTab.TRIGGERS, SidebarTab.FUNCTIONS]

  const getTabLabel = (tab: SidebarTab): string => {
    if (isRedis && tab === SidebarTab.TABLES) return 'Keys'
    if (isMongoDB && tab === SidebarTab.TABLES) return 'Collections'
    switch (tab) {
      case SidebarTab.TABLES: return 'Tables'
      case SidebarTab.VIEWS: return 'Views'
      case SidebarTab.PROCEDURES: return 'Procedures'
      case SidebarTab.TRIGGERS: return 'Triggers'
      case SidebarTab.FUNCTIONS: return 'Functions'
      default: return 'Tables'
    }
  }

  const getTabIcon = (tab: SidebarTab) => {
    if (isRedis && tab === SidebarTab.TABLES) return Zap
    if (isMongoDB && tab === SidebarTab.TABLES) return Database
    switch (tab) {
      case SidebarTab.TABLES: return Table2
      case SidebarTab.VIEWS: return Eye
      case SidebarTab.PROCEDURES: return Terminal
      case SidebarTab.TRIGGERS: return Zap
      case SidebarTab.FUNCTIONS: return Binary
      default: return Table2
    }
  }

  const currentTabLabel = getTabLabel(sidebarTab)

  return (
    <div className={cn(
      "flex border border-border rounded-none bg-card overflow-hidden shrink-0 transition-all duration-300",
      isCollapsed ? "w-12" : "w-80"
    )}>
      <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-border bg-muted/20">
        <button 
          onClick={onToggle}
          className="p-2 hover:bg-muted text-muted-foreground mb-2 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <ChevronRight className={cn("w-5 h-5 transition-transform", !isCollapsed && "rotate-180")} />
        </button>
        <div className="w-full h-px bg-border/50 mb-2" />

        {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => { setSidebarTab(tab); if(isCollapsed && onToggle) onToggle(); }}
              title={getTabLabel(tab)}
              className={cn("p-2 rounded-none transition-colors", sidebarTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
            >
              {React.createElement(getTabIcon(tab), { className: 'w-5 h-5' })}
            </button>
          ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex flex-col gap-0.5 text-xs text-left overflow-hidden">
              <span className="text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-widest truncate">
                {currentSchema || 'No Database'}
              </span>
              <div className="flex items-center gap-2">
                {React.createElement(getTabIcon(sidebarTab), { className: 'w-3 h-3 text-primary' })}
                <span className="capitalize">{currentTabLabel}</span>
                {isMongoDB && (
                  <span className="px-1.5 py-0.5 rounded text-[var(--ch-text-9)] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    MongoDB
                  </span>
                )}
                {isRedis && (
                  <span className="px-1.5 py-0.5 rounded text-[var(--ch-text-9)] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Redis
                  </span>
                )}
              </div>
            </h3>
            <div className="flex items-center gap-0.5">
              {!isMongoDB && (
                <button
                  onClick={() => setCreateModalType(sidebarTabToObjectType(sidebarTab))}
                  className="p-1.5 hover:bg-muted rounded-none transition-colors shrink-0"
                  title={`Create ${currentTabLabel.slice(0, -1)}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleRefetch} className="p-1.5 hover:bg-muted rounded-none transition-colors shrink-0">
                <RefreshIcon className={cn("w-3.5 h-3.5", isLoadingSidebar && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${currentTabLabel.toLowerCase()}...`}
              className="w-full bg-muted/50 border border-border rounded-none pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 text-left">
          {isLoadingSidebar ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded-none" />)}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[var(--ch-text-10)] font-bold text-muted-foreground uppercase tracking-wider">
                Results ({filteredItems?.length || 0})
              </div>
              {filteredItems?.map((item) => {
                let type: DatabaseObjectType
                switch (sidebarTab) {
                  case SidebarTab.TABLES: type = DatabaseObjectType.TABLE; break
                  case SidebarTab.VIEWS: type = DatabaseObjectType.VIEW; break
                  case SidebarTab.PROCEDURES: type = DatabaseObjectType.PROCEDURE; break
                  case SidebarTab.TRIGGERS: type = DatabaseObjectType.TRIGGER; break
                  case SidebarTab.FUNCTIONS: type = DatabaseObjectType.FUNCTION; break
                }
                return (
                  <button 
                    key={item.name} 
                    onClick={() => {
                      setSelectedItem({ name: item.name, type })
                      setPage(0)
                      setSocketResults(null)
                      setExecutionStatus(ExecutionStatus.IDLE)
                      setExecutionError(null)
                      setParamsValues({})
                      setActiveTab((type === DatabaseObjectType.TABLE || type === DatabaseObjectType.VIEW) ? ExplorerTab.DATA : ExplorerTab.DDL)
                    }} 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.pageX, y: e.pageY, item: { name: item.name, type } });
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-none transition-colors group text-left", 
                      (selectedItem?.name === item.name) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    )}
                  >
                    {isRedis && sidebarTab === SidebarTab.TABLES
                      ? <Zap className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-amber-400" : "text-muted-foreground")} />
                      : isMongoDB && sidebarTab === SidebarTab.TABLES
                      ? <Database className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-orange-400" : "text-muted-foreground")} />
                      : (() => {
                          const Icon = getTabIcon(sidebarTab)
                          return <Icon className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />
                        })()
                    }
                    <span className="truncate flex-1">{item.name}</span>
                    <ChevronRight className={cn("w-3 h-3 transition-opacity", (selectedItem?.name === item.name) ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDismiss={() => setContextMenu(null)}
          groups={[
            {
              title: isRedis ? 'Key Actions' : contextMenu.item.type,
              items: [
                {
                  label: 'Copy Name',
                  icon: <Copy className="w-3.5 h-3.5" />,
                  onClick: () => navigator.clipboard.writeText(contextMenu.item.name)
                },
                {
                  label: 'Select Object',
                  icon: <ChevronRight className="w-3.5 h-3.5" />,
                  onClick: () => {
                    setSelectedItem(contextMenu.item);
                    setPage(0);
                    setSocketResults(null);
                    setExecutionStatus(ExecutionStatus.IDLE);
                    setExecutionError(null);
                    setParamsValues({});
                    setActiveTab((contextMenu.item.type === DatabaseObjectType.TABLE || contextMenu.item.type === DatabaseObjectType.VIEW) ? ExplorerTab.DATA : ExplorerTab.DDL);
                  }
                },
                ...(isRedis ? [
                  {
                    label: 'Delete Key',
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                    onClick: () => {
                      setSelectedItem(contextMenu.item);
                      setPage(0);
                      setSocketResults(null);
                      setExecutionStatus(ExecutionStatus.IDLE);
                      setExecutionError(null);
                      setParamsValues({});
                      setActiveTab(ExplorerTab.DATA);
                    }
                  }
                ] : [])
              ]
            },
            ...(!isMongoDB && !isRedis && contextMenu.item.type === DatabaseObjectType.TABLE && connectionId ? [
              {
                title: 'Send to SQL Editor',
                items: SQL_TEMPLATE_ACTIONS.map(({ action, label }) => ({
                  label,
                  icon: <Send className="w-3.5 h-3.5" />,
                  onClick: () => handleTableSqlAction(action, 'editor')
                }))
              },
              {
                title: 'Copy to Clipboard',
                items: SQL_TEMPLATE_ACTIONS.map(({ action, label }) => ({
                  label,
                  icon: <ClipboardCopy className="w-3.5 h-3.5" />,
                  onClick: () => handleTableSqlAction(action, 'clipboard')
                }))
              }
            ] : [])
          ]}
        />
      )}

      {createModalType !== null && (
        <CreateObjectModal
          open={createModalType !== null}
          onClose={() => setCreateModalType(null)}
          objectType={createModalType}
          schema={currentSchema}
          dbType={dbType}
          connectionId={connectionId}
          onCreated={handleRefetch}
        />
      )}
    </div>
  )
}
