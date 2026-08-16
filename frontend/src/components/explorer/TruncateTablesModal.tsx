import { useState } from 'react'
import { Loader2, Trash2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { TruncateTablesResult } from '@/types/database'
import { schemaService } from '@/services/schema.service'
import { cn } from '@/lib/utils'

interface TruncateTablesModalProps {
  open: boolean
  onClose: () => void
  connectionId?: string
  schema?: string
  tables: string[]
  onCompleted: () => void
}

type Phase = 'confirm' | 'running' | 'done'

export function TruncateTablesModal({
  open,
  onClose,
  connectionId,
  schema,
  tables,
  onCompleted,
}: TruncateTablesModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [result, setResult] = useState<TruncateTablesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPhase('confirm')
    setResult(null)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleConfirm = async () => {
    if (!connectionId) return
    setPhase('running')
    setError(null)
    try {
      const res = await schemaService.truncateTables(connectionId, schema, tables)
      setResult(res)
      setPhase('done')
      onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to truncate tables')
      setPhase('done')
    }
  }

  const okCount = result?.outcomes.filter((o) => o.ok).length ?? 0

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Truncate Tables"
      size="md"
      disableWindowControls
    >
      <DialogBody>
        {phase === 'confirm' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-relaxed">
                This will permanently delete <b>all rows</b> from the {tables.length} selected
                table{tables.length > 1 ? 's' : ''}. This action cannot be undone. Foreign keys
                are respected: child tables are truncated before their parents.
              </p>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground text-xs">
                Selected tables
              </div>
              <div className="max-h-48 overflow-auto divide-y divide-border/60">
                {tables.map((t) => (
                  <div key={t} className="px-3 py-1.5 font-mono text-xs flex items-center justify-between">
                    <span>{t}</span>
                    <Trash2 className="w-3 h-3 text-destructive/70" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'running' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest">
              Truncating {tables.length} table{tables.length > 1 ? 's' : ''}...
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 rounded-lg p-3">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-destructive whitespace-pre-wrap leading-relaxed">{error}</p>
              </div>
            )}
            {result && (
              <>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CheckCircle2 className={cn('w-4 h-4', okCount === result.outcomes.length ? 'text-emerald-500' : 'text-amber-500')} />
                  {okCount} of {result.outcomes.length} table{result.outcomes.length > 1 ? 's' : ''} truncated
                </div>
                {result.warnings.length > 0 && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{result.warnings.join('\n')}</p>
                  </div>
                )}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground text-xs">
                    Execution order
                  </div>
                  <div className="max-h-56 overflow-auto divide-y divide-border/60">
                    {result.order.map((t, i) => {
                      const outcome = result.outcomes.find((o) => o.table === t)
                      return (
                        <div key={t} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                          <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono shrink-0">{i + 1}.</span>
                          <span className="font-mono truncate flex-1">{t}</span>
                          {outcome?.ok ? (
                            <span className="text-emerald-500 flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Truncated
                            </span>
                          ) : (
                            <span className="text-destructive flex items-center gap-1 shrink-0" title={outcome?.error ?? undefined}>
                              <XCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {result.outcomes.some((o) => !o.ok) && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Some tables failed. Check the error detail or run the generated SQL manually for more information.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={handleClose}>
          {phase === 'done' ? 'Close' : 'Cancel'}
        </Button>
        {phase === 'confirm' && (
          <Button variant="destructive" onClick={handleConfirm} disabled={tables.length === 0}>
            <Trash2 className="w-3.5 h-3.5" />
            Truncate {tables.length} table{tables.length > 1 ? 's' : ''}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  )
}
