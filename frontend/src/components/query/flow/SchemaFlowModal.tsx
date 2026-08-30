import { useState } from 'react';
import {
  GitFork,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  Share2,
} from 'lucide-react';
import { SchemaFlowChart } from './SchemaFlowChart';
import type { SqlFlowGraph } from '@/types/sqlFlow';
import { cn } from '@/lib/utils';

interface SchemaFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: SqlFlowGraph | null;
  isLoading: boolean;
  onReload: () => void;
}

export function SchemaFlowModal({
  isOpen,
  onClose,
  graph,
  isLoading,
  onReload,
}: SchemaFlowModalProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (!isOpen) return null;

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={cn(
          'bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200',
          isFullScreen
            ? 'w-full h-full rounded-none border-0'
            : 'w-full max-w-5xl h-[80vh]'
        )}
      >
        {/* Modal Header */}
        <div className="h-14 px-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">SQL Schema Flow</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/20 text-primary border border-primary/30">
                  AST Diagram
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Flujo de datos y relaciones de entidades analizadas desde la consulta SQL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {graph && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2 font-mono">
                <span className="flex items-center gap-1 px-2 py-1 rounded bg-muted">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  {nodeCount} {nodeCount === 1 ? 'tabla' : 'tablas'}
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded bg-muted">
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                  {edgeCount} {edgeCount === 1 ? 'relación' : 'relaciones'}
                </span>
              </div>
            )}

            <button
              onClick={onReload}
              disabled={isLoading}
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors disabled:opacity-50"
              title="Recargar diagrama"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>

            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors"
              title={isFullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullScreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-md transition-colors ml-1"
              title="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 relative bg-background flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Analizando AST de la consulta SQL...</p>
            </div>
          ) : graph && graph.nodes.length > 0 ? (
            <SchemaFlowChart graph={graph} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center p-8 text-muted-foreground">
              <GitFork className="w-12 h-12 stroke-[1.5] text-muted-foreground/40 mb-2" />
              <p className="text-sm font-semibold text-foreground">No se detectaron tablas</p>
              <p className="text-xs max-w-sm">
                Asegúrate de escribir una consulta SELECT válida con cláusulas FROM y JOIN para visualizar las relaciones.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
