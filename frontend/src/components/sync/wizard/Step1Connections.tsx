import { useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Connection } from '@/types/database'
import { SyncMode } from '@/types/sync'

interface Step1ConnectionsProps {
  name: string
  onNameChange: (v: string) => void
  sourceId: string
  onSourceIdChange: (v: string) => void
  targetId: string
  onTargetIdChange: (v: string) => void
  connections: Connection[]
  mode: SyncMode
  onModeChange: (v: SyncMode) => void
  sourceSchema: string
  onSourceSchemaChange: (v: string) => void
  targetSchema: string
  onTargetSchemaChange: (v: string) => void
}

export function Step1Connections({
  name, onNameChange,
  sourceId, onSourceIdChange,
  targetId, onTargetIdChange,
  connections,
  mode, onModeChange,
  sourceSchema, onSourceSchemaChange,
  targetSchema, onTargetSchemaChange,
}: Step1ConnectionsProps) {
  const queryClient = useQueryClient()

  const { data: sourceSchemas, isLoading: loadingSourceSchemas, error: sourceSchemasError } = useQuery({
    queryKey: ['schemas', sourceId],
    queryFn: () => schemaService.getSchemas(sourceId),
    enabled: !!sourceId,
  })

  const { data: targetSchemas, isLoading: loadingTargetSchemas, error: targetSchemasError } = useQuery({
    queryKey: ['schemas', targetId],
    queryFn: () => schemaService.getSchemas(targetId),
    enabled: !!targetId,
  })

  useEffect(() => {
    if (sourceSchemas && sourceSchemas.length > 0 && !sourceSchema) {
      onSourceSchemaChange(sourceSchemas[0])
    }
  }, [sourceSchemas, sourceSchema, onSourceSchemaChange])

  useEffect(() => {
    if (targetSchemas && targetSchemas.length > 0 && !targetSchema) {
      onTargetSchemaChange(targetSchemas[0])
    }
  }, [targetSchemas, targetSchema, onTargetSchemaChange])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Nombre de la sincronización
        </label>
        <input
          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ej: Producción → Analytics"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Conexión Origen
            </label>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['connections'] })}
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
              title="Recargar conexiones"
            >
              <RefreshCw className="w-3 h-3" />
              Recargar
            </button>
          </div>
          <select
            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={sourceId}
            onChange={(e) => {
              onSourceIdChange(e.target.value)
              onSourceSchemaChange('')
            }}
          >
            <option value="">— Seleccionar —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {sourceId && (
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Schema Origen</label>
              {loadingSourceSchemas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando schemas...
                </div>
              ) : sourceSchemasError ? (
                <div className="space-y-1">
                  <select disabled className="w-full bg-background border border-border px-3 py-2 text-xs font-mono opacity-50">
                    <option>No se pudieron cargar schemas</option>
                  </select>
                  <p className="text-[9px] text-amber-500">
                    Activa la conexión desde el sidebar y haz clic en "Recargar"
                  </p>
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={sourceSchema}
                  onChange={(e) => onSourceSchemaChange(e.target.value)}
                >
                  <option value="">— Seleccionar Schema —</option>
                  {(sourceSchemas ?? []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Conexión Destino
          </label>
          <select
            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={targetId}
            onChange={(e) => {
              onTargetIdChange(e.target.value)
              onTargetSchemaChange('')
            }}
          >
            <option value="">— Seleccionar —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {targetId && (
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Schema Destino</label>
              {loadingTargetSchemas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando schemas...
                </div>
              ) : targetSchemasError ? (
                <div className="space-y-1">
                  <select disabled className="w-full bg-background border border-border px-3 py-2 text-xs font-mono opacity-50">
                    <option>No se pudieron cargar schemas</option>
                  </select>
                  <p className="text-[9px] text-amber-500">
                    Activa la conexión desde el sidebar y haz clic en "Recargar"
                  </p>
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={targetSchema}
                  onChange={(e) => onTargetSchemaChange(e.target.value)}
                >
                  <option value="">— Seleccionar Schema —</option>
                  {(targetSchemas ?? []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Tooltip content="Full: copia todos los datos. Incremental: solo datos nuevos desde la última sincronización">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Modo de sincronización
          </label>
        </Tooltip>
        <select
          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as SyncMode)}
        >
          <option value={SyncMode.Full}>Completa — copia todos los datos</option>
          <option value={SyncMode.Incremental}>Incremental — solo cambios desde la última ejecución</option>
        </select>
        <p className="text-[10px] text-muted-foreground">
          {mode === SyncMode.Incremental
            ? 'Requiere una columna primary key para detectar cambios.'
            : 'Sobrescribe todos los datos en el destino en cada ejecución.'}
        </p>
      </div>
    </div>
  )
}
