import { CheckCircle2, Clock, Loader2, RotateCcw, SkipForward, XCircle } from 'lucide-react';
import type { ScriptLiveStatement } from '@/services/query.service';
import { cn } from '@/lib/utils';

interface ScriptLivePanelProps {
  statements: ScriptLiveStatement[] | null;
  running: boolean;
  onShowSummary: () => void;
}

const PHASE_META: Record<ScriptLiveStatement['phase'], { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: 'Pending', icon: Clock, className: 'text-muted-foreground' },
  running: { label: 'Running…', icon: Loader2, className: 'text-primary animate-spin' },
  ok: { label: 'OK', icon: CheckCircle2, className: 'text-green-500' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-red-500' },
  skipped: { label: 'Skipped', icon: SkipForward, className: 'text-yellow-500' },
};

/**
 * Vista estilo Workbench del script multi-statement: muestra cada statement
 * con su estado en vivo (pendiente, ejecutando, ok, fallado, omitido).
 */
export function ScriptLivePanel({ statements, running, onShowSummary }: ScriptLivePanelProps) {
  if (!statements) return null;

  const counts = {
    pending: 0, running: 0, ok: 0, failed: 0, skipped: 0,
  };
  for (const s of statements) counts[s.phase]++;

  return (
    <div className="h-full flex flex-col">
      {/* Barra de estado del script */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 text-xs">
        <span className="font-bold text-muted-foreground">
          {running ? (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Script running…
            </span>
          ) : (
            'Script'
          )}
        </span>
        <span className="text-muted-foreground">{statements.length} statement(s)</span>
        {counts.ok > 0 && <span className="text-green-500 font-semibold">{counts.ok} ok</span>}
        {counts.failed > 0 && <span className="text-red-500 font-semibold">{counts.failed} failed</span>}
        {counts.skipped > 0 && <span className="text-yellow-500 font-semibold">{counts.skipped} skipped</span>}
        {!running && (
          <button
            onClick={onShowSummary}
            className="ml-auto font-bold text-primary hover:text-primary/80 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Ver resumen
          </button>
        )}
      </div>

      {/* Lista en vivo */}
      <div className="flex-1 overflow-auto">
        {statements.map((s) => {
          const meta = PHASE_META[s.phase];
          const Icon = meta.icon;
          return (
            <div
              key={s.index}
              className={cn(
                'flex items-start gap-2 px-4 py-2 border-b border-border/50 text-xs',
                s.phase === 'running' && 'bg-primary/5',
                s.phase === 'failed' && 'bg-destructive/5',
                s.phase === 'ok' && 'bg-green-500/5',
              )}
            >
              <span className="mt-0.5 shrink-0">
                <Icon className={cn('w-3.5 h-3.5', meta.className)} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-foreground/90 break-all whitespace-pre-wrap line-clamp-3">
                  {s.sql || '(empty statement)'}
                </p>
                {s.phase === 'failed' && s.error && (
                  <p className="text-red-500 mt-1 break-all whitespace-pre-wrap">{s.error}</p>
                )}
                {s.phase === 'ok' && (s.rowCount != null || s.rowsAffected != null) && (
                  <p className="text-muted-foreground mt-1">
                    {s.rowCount != null ? `${s.rowCount} row(s) returned` : `${s.rowsAffected} row(s) affected`}
                  </p>
                )}
              </div>
              <span className={cn('shrink-0 font-semibold uppercase tracking-wide text-[10px]', meta.className)}>
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  );
}