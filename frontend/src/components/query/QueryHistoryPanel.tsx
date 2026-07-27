import { useState, useMemo } from 'react';
import { Clock, Search, Trash2, CheckCircle2, XCircle, ChevronRight, Copy, X } from 'lucide-react';
import type { QueryHistoryEntry } from '@/store/useAppStore';
import { ExecutionStatus } from '@/types/database';

interface QueryHistoryPanelProps {
  connectionId: string | undefined;
  history: QueryHistoryEntry[];
  onClear: (connectionId: string) => void;
  onReplay: (query: string) => void;
  onClose: () => void;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(epoch: number): string {
  const d = new Date(epoch);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (isToday) return time;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

function truncateQuery(q: string, max = 120): string {
  const single = q.replace(/\s+/g, ' ').trim();
  return single.length > max ? single.slice(0, max) + '…' : single;
}

export function QueryHistoryPanel({
  connectionId,
  history,
  onClear,
  onReplay,
  onClose,
}: QueryHistoryPanelProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter((e) => e.query.toLowerCase().includes(q));
  }, [history, search]);

  const handleClear = () => {
    if (!connectionId) return;
    if (window.confirm('Clear all query history for this connection?')) {
      onClear(connectionId);
    }
  };

  return (
    <div className="absolute right-0 top-10 z-50 w-[520px] max-h-[70vh] flex flex-col border border-border rounded-none bg-card shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">Query History</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{history.length} entries</span>
        {history.length > 0 && connectionId && (
          <button
            onClick={handleClear}
            className="p-1 rounded-none hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded-none hover:bg-muted text-muted-foreground transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-none border border-border/50">
          <Search className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter queries…"
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Clock className="w-8 h-8 opacity-30" />
            <p className="text-xs">{history.length === 0 ? 'No queries executed yet' : 'No results match your filter'}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="group hover:bg-muted/30 transition-colors"
                >
                  <div
                    className="flex items-start gap-2 px-3 py-2 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {/* Status icon */}
                    <div className="shrink-0 mt-0.5">
                      {entry.status === ExecutionStatus.SUCCESS ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive" />
                      )}
                    </div>

                    {/* Query preview */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground font-mono leading-relaxed break-all">
                        {truncateQuery(entry.query)}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">{formatDate(entry.executedAt)}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDuration(entry.durationMs)}</span>
                        {entry.rowCount !== undefined && entry.status === ExecutionStatus.SUCCESS && (
                          <span className="text-[10px] text-muted-foreground">{entry.rowCount} rows</span>
                        )}
                        {entry.status === ExecutionStatus.ERROR && (
                          <span className="text-[10px] text-destructive truncate max-w-[200px]">{entry.error}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(entry.query).catch(() => undefined);
                        }}
                        title="Copy query"
                        className="p-1 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplay(entry.query);
                        }}
                        title="Load into editor"
                        className="p-1 rounded-none hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: full query */}
                  {isExpanded && (
                    <div className="px-3 pb-2">
                      <pre className="text-[11px] font-mono text-foreground bg-muted/50 border border-border/50 rounded-none p-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-40">
                        {entry.query}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
