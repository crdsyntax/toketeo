import {
  Database,
  Plus,
  Edit2,
  Globe,
  Shield,
  ChevronDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Connection } from '@/types/database';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schemaService } from '@/services/schema.service';
import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';

interface ConnectionsSidebarProps {
  connections: Connection[];
  activeConnection: Connection | null;
  onConnect: (conn: Connection) => Promise<void> | void;
  onEdit: (conn: Connection) => void;
  onNew: () => void;
}

export function ConnectionsSidebar({
  connections,
  activeConnection,
  onConnect,
  onEdit,
  onNew,
}: ConnectionsSidebarProps) {
  const [expandedConnId, setExpandedConnId] = useState<string | null>(
    activeConnection?.id || null,
  );
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { setActiveConnectionDatabase, isBackendConnected } = useAppStore();
  const navigate = useNavigate();

  // Auto-expand schemas when a connection becomes active AND is connected in backend
  useEffect(() => {
    if (activeConnection?.id && isBackendConnected) {
      setExpandedConnId(activeConnection.id);
    } else if (!activeConnection) {
      setExpandedConnId(null);
    }
  }, [activeConnection?.id, isBackendConnected]);

  const handleConnect = async (conn: Connection) => {
    setConnectingId(conn.id);
    try {
      await onConnect(conn);
      setExpandedConnId(conn.id);
    } finally {
      setConnectingId(null);
    }
  };

  const {
    data: schemas = [],
    isLoading: isLoadingSchemas,
    isError: isErrorSchemas,
  } = useQuery({
    queryKey: ['schemas', expandedConnId],
    queryFn: () => schemaService.getSchemas(expandedConnId!),
    enabled:
      !!expandedConnId &&
      activeConnection?.id === expandedConnId &&
      isBackendConnected,
    staleTime: 5 * 60 * 1000,
  });

  const switchSchemaMutation = useMutation({
    mutationFn: ({
      connectionId,
      schema,
    }: {
      connectionId: string;
      schema: string;
    }) => schemaService.switchSchema(connectionId, schema),
    onSuccess: (_, { connectionId, schema }) => {
      setActiveConnectionDatabase(schema);
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      queryClient.invalidateQueries({ queryKey: ['tables', connectionId] });
      queryClient.invalidateQueries({ queryKey: ['views', connectionId] });
      queryClient.invalidateQueries({ queryKey: ['procedures', connectionId] });
      queryClient.invalidateQueries({ queryKey: ['triggers', connectionId] });
      queryClient.invalidateQueries({ queryKey: ['functions', connectionId] });
      navigate('/explorer');
    },
  });

  const handleSchemaDoubleClick = async (conn: Connection, schema: string) => {
    if (activeConnection?.id !== conn.id) {
      await onConnect(conn);
    }
    switchSchemaMutation.mutate({ connectionId: conn.id, schema });
  };

  return (
    <div className="w-72 border-r border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          Connections
        </h2>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1 text-left">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className={cn(
              'group rounded-none p-2 border transition-all cursor-pointer',
              activeConnection?.id === conn.id
                ? 'bg-primary/10 border-primary'
                : 'border-transparent hover:bg-muted',
            )}
          >
            <div
              className="flex justify-between items-center"
              onClick={() => handleConnect(conn)}
            >
              <div className="flex-1 truncate">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm truncate">
                    {conn.name}
                  </span>
                  {activeConnection?.id === conn.id && isBackendConnected && (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" title="Connected" />
                  )}
                  {connectingId === conn.id && (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {conn.ssh ? (
                    <Shield className="w-3 h-3" />
                  ) : (
                    <Globe className="w-3 h-3" />
                  )}
                  <span className="truncate">
                    {conn.host}:{conn.port}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(conn);
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {activeConnection?.id === conn.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedConnId(
                        expandedConnId === conn.id ? null : conn.id,
                      );
                    }}
                  >
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        expandedConnId === conn.id && 'rotate-180',
                      )}
                    />
                  </button>
                )}
              </div>
            </div>

            {expandedConnId === conn.id && (
              <div className="mt-1 pl-2 ml-2 border-l border-border space-y-0.5">
                {isLoadingSchemas ? (
                  <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading schemas...</span>
                  </div>
                ) : isErrorSchemas ? (
                  <div className="p-2 space-y-2">
                    <div className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="truncate">Error loading schemas</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConnect(conn);
                      }}
                      className="text-[10px] bg-primary/20 hover:bg-primary/30 text-primary px-2 py-1 rounded transition-colors w-full font-bold"
                    >
                      Reconnect
                    </button>
                  </div>
                ) : schemas.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground italic">
                    No schemas found
                  </div>
                ) : (
                  schemas.map((s, index) => (
                    <div
                      key={s}
                      onDoubleClick={() => handleSchemaDoubleClick(conn, s)}
                      title="Double click to switch schema"
                      className={cn(
                        'text-xs p-1.5 cursor-pointer relative flex items-center hover:bg-muted group/schema',
                        index === schemas.length - 1
                          ? 'before:absolute before:left-[-1px] before:top-[-5px] before:h-[15px] before:w-[1px] before:bg-border'
                          : 'before:absolute before:left-[-1px] before:top-[-5px] before:h-full before:w-[1px] before:bg-border',
                        'after:absolute after:left-[-1px] after:top-[12px] after:w-[10px] after:h-[1px] after:bg-border',
                        activeConnection?.database === s &&
                          'font-bold text-primary',
                      )}
                    >
                      <span className="pl-4 truncate flex-1">{s}</span>
                      {activeConnection?.database === s && (
                        <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-border">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-none text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none border-2 border-primary"
        >
          <Plus className="w-4 h-4" />
          New Connection
        </button>
      </div>
    </div>
  );
}
