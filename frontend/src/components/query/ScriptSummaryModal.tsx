import { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, SkipForward, Undo2, X } from 'lucide-react';
import type { ScriptReport, ScriptStatementResult } from '@/services/query.service';

type Filter = 'all' | 'ok' | 'failed' | 'skipped';

interface ScriptSummaryModalProps {
  report: ScriptReport | null;
  onClose: () => void;
}

function phaseOf(r: ScriptStatementResult): 'ok' | 'failed' | 'skipped' {
  if (r.skipped) return 'skipped';
  return r.ok ? 'ok' : 'failed';
}



export function ScriptSummaryModal({ report, onClose }: ScriptSummaryModalProps) {
  const [filter, setFilter] = useState<Filter>('all');
  if (!report) return null;

  const { ok, failed, skipped, total, rolledBack, pendingCommit, results } = report;

  const filtered = filter === 'all'
    ? results
    : results.filter((r) => phaseOf(r) === filter);

  const chip = (key: Filter, value: number, label: string, cls: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`border rounded-md p-3 text-center transition-colors ${cls} ${
        filter === key ? 'ring-2 ring-offset-2' : ''
      }`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <h3 className="font-bold">Script execution summary</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {rolledBack && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 flex items-center gap-2">
              <Undo2 className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-500">
                The script was cancelled: all applied statements were rolled back.
              </p>
            </div>
          )}
          {pendingCommit && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-500">
                This connection is in production: the script ran inside the transaction and was
                NOT committed. Press <b>Commit</b> on the bottom bar to apply the changes, or{' '}
                <b>Rollback</b> to discard them.
              </p>
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {chip('all', results.length, `All (${total} total)`, 'bg-muted/40 border-border hover:bg-muted/60 cursor-pointer')}
            {chip('ok', ok, 'OK', 'bg-green-500/10 border-green-500/30 text-green-500')}
            {chip('failed', failed, 'Failed', 'bg-red-500/10 border-red-500/30 text-red-500')}
            {chip('skipped', skipped, 'Skipped', 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500')}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {ok + failed + skipped} of {total} statements executed
            {filter !== 'all' && ` — showing ${filtered.length} “${filter}”`}
          </p>
          <div className="border border-border rounded-md max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No “{filter}” statements
              </div>
            ) : (
              filtered.map((r) => {
                const phase = phaseOf(r);
                return (
                  <div key={r.index} className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-b-0">
                    {phase === 'ok' && <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />}
                    {phase === 'failed' && <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                    {phase === 'skipped' && <SkipForward className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-foreground/90 whitespace-pre-wrap break-all">
                        {r.sql}
                      </p>
                      {r.error && (
                        <p className="text-xs text-red-500 mt-1 whitespace-pre-wrap break-all">{r.error}</p>
                      )}
                      {(r.ok || r.skipped) && (r.rowsAffected !== null || r.rowCount !== null) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.rowCount !== null ? `${r.rowCount} row(s) returned` : `${r.rowsAffected} row(s) affected`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}