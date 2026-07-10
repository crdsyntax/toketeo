import { Database } from 'lucide-react'
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
}

export function Step1Connections({
  name, onNameChange,
  sourceId, onSourceIdChange,
  targetId, onTargetIdChange,
  connections,
  mode, onModeChange,
}: Step1ConnectionsProps) {
  const sourceConn = connections.find((c) => c.id === sourceId)
  const targetConn = connections.find((c) => c.id === targetId)

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
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Conexión Origen
          </label>
          <select
            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={sourceId}
            onChange={(e) => onSourceIdChange(e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {sourceConn && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-bold">
              <Database className="w-3 h-3" />
              Conectado — {sourceConn.host}:{sourceConn.port}
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
            onChange={(e) => onTargetIdChange(e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {targetConn && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-bold">
              <Database className="w-3 h-3" />
              Conectado — {targetConn.host}:{targetConn.port}
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
