import { Plus, Edit2, Globe, Shield, ChevronDown} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection } from '@/types/database'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { DatabaseItem } from './DatabaseItem'

interface ConnectionsSidebarProps {
  connections: Connection[]
  activeConnection: Connection | null
  onConnect: (conn: Connection) => Promise<void> | void
  onEdit: (conn: Connection) => void
  onNew: () => void
  onDisconnect?: (id: string) => void
}

export function ConnectionsSidebar({ connections, activeConnection, onConnect, onEdit, onNew, onDisconnect }: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, connId?: string }>({ visible: false, x: 0, y: 0 })
  const queryClient = useQueryClient()
  const { setActiveConnectionDatabase } = useAppStore()
  const navigate = useNavigate()

  const { data: databases = [] } = useQuery({
    queryKey: ['databases', expandedConnId],
    queryFn: () => schemaService.getDatabases(expandedConnId!),
    enabled: !!expandedConnId,
    staleTime: 5 * 60 * 1000,
  })

  const switchSchemaMutation = useMutation({
    mutationFn: ({ connectionId, schema }: { connectionId: string, schema: string }) =>
      schemaService.switchSchema(connectionId, schema),
    onSuccess: (_, { schema }) => {
      setActiveConnectionDatabase(schema)
      queryClient.invalidateQueries({ queryKey: ['schemas'] })
      navigate('/explorer')
    }
  })

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
              "group transition-all border",
              activeConnection?.id === conn.id 
                ? "bg-accent/5 border-accent/30" 
                : "border-transparent hover:bg-accent/10 hover:text-accent hover:border-border"
            )}
          >
            <div 
              className="p-2 cursor-pointer flex justify-between items-center" 
              onClick={() => onConnect(conn)}
              onDoubleClick={() => setExpandedConnId(expandedConnId === conn.id ? null : conn.id)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, connId: conn.id }) }}
            >
              <div className="flex-1 truncate">
                <span className={cn(
                  "text-xs font-bold truncate block",
                  activeConnection?.id === conn.id ? "text-accent" : "text-foreground"
                )}>
                  {conn.name}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
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
                  {databases.length > 0 ? (
                    databases.map((db) => (
                      <DatabaseItem 
                        key={db} 
                        conn={conn}
                        dbName={db}
                        onSelect={handleSchemaDoubleClick}
                      />
                    ))
                  ) : (
                    <div className="text-[9px] p-1.5 text-muted-foreground italic font-mono uppercase tracking-widest opacity-50">
                      Empty
                    </div>
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
      </div>
    </div>
  )
}
