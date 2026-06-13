import { Database, Plus, Edit2, Globe, Shield, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection } from '@/types/database'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'

interface ConnectionsSidebarProps {
  connections: Connection[]
  activeConnection: Connection | null
  onConnect: (conn: Connection) => Promise<void> | void
  onEdit: (conn: Connection) => void
  onNew: () => void
}

export function ConnectionsSidebar({ connections, activeConnection, onConnect, onEdit, onNew }: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { setActiveConnectionDatabase } = useAppStore()
  const navigate = useNavigate()

  const { data: schemas = [] } = useQuery({
    queryKey: ['schemas', expandedConnId],
    queryFn: () => schemaService.getSchemas(expandedConnId!),
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
    <div className="w-72 border-r border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          Connections
        </h2>
        <button onClick={onNew} className="p-1 hover:bg-muted rounded-none">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {connections.map((conn) => (
          <div 
            key={conn.id}
            className={cn(
              "group rounded-none p-2 border transition-all cursor-pointer",
              activeConnection?.id === conn.id 
                ? "bg-primary/10 border-primary" 
                : "border-transparent hover:bg-muted"
            )}
          >
            <div className="flex justify-between items-center" onClick={() => onConnect(conn)}>
              <div className="flex-1 truncate">
                <span className="font-bold text-sm truncate">{conn.name}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {conn.ssh ? <Shield className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                  <span className="truncate">{conn.host}:{conn.port}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); onEdit(conn); }} className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {activeConnection?.id === conn.id && (
                  <button onClick={(e) => { e.stopPropagation(); setExpandedConnId(expandedConnId === conn.id ? null : conn.id); }}>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expandedConnId === conn.id && "rotate-180")} />
                  </button>
                )}
              </div>
            </div>
            
            {expandedConnId === conn.id && (
              <div className="mt-1 pl-2 ml-2 border-l border-border space-y-0.5">
                {schemas.map((s, index) => (
                  <div 
                    key={s} 
                    onDoubleClick={() => handleSchemaDoubleClick(conn, s)}
                    className={cn(
                      "text-xs p-1.5 cursor-pointer relative flex items-center hover:bg-muted",
                      index === schemas.length - 1 ? "before:absolute before:left-[-1px] before:top-[-5px] before:h-[15px] before:w-[1px] before:bg-border" : "before:absolute before:left-[-1px] before:top-[-5px] before:h-full before:w-[1px] before:bg-border",
                      "after:absolute after:left-[-1px] after:top-[12px] after:w-[10px] after:h-[1px] after:bg-border"
                    )}
                  >
                    <span className="pl-4 truncate">{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
