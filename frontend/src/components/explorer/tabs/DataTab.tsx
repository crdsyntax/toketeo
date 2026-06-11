import { Loader2, AlertCircle, ChevronLeft, ChevronRight as ChevronRightIcon, Layout, Code, Play } from 'lucide-react';
import type { QueryResult, ExecutionStatus, DatabaseObject } from '@/types/database';

interface DataTabProps {
  selectedItem: DatabaseObject;
  isLoading: boolean;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  queryData: QueryResult | null;
  pageSize: number;
  setPageSize: (size: number) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  handleExecute: () => void;
  handleCancel: () => void;
}

export function DataTab({
  selectedItem,
  isLoading,
  executionStatus,
  executionError,
  queryData,
  pageSize,
  setPageSize,
  page,
  setPage,
  handleExecute,
  handleCancel,
}: DataTabProps) {
  if ((selectedItem.type === 'view' || selectedItem.type === 'procedure') && executionStatus === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        {selectedItem.type === 'view' ? (
          <Layout className="w-12 h-12 text-muted-foreground mb-4" />
        ) : (
          <Code className="w-12 h-12 text-muted-foreground mb-4" />
        )}
        <h4 className="font-bold mb-2">
          {selectedItem.type === 'view' ? 'View Data' : 'Execute Procedure'}
        </h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          {selectedItem.type === 'view'
            ? 'Viewing data from a view may take time.'
            : 'Executing a procedure will run its code on the server.'}{' '}
          Click the button to proceed via WebSocket.
        </p>
        <button
          onClick={() => handleExecute()}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" />
          {selectedItem.type === 'view' ? 'Execute View' : 'Run Procedure'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {executionStatus === 'error' && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <p className="text-xs font-mono">{executionError}</p>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-primary animate-pulse mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">
                Executing via WebSocket...
              </span>
              <button
                onClick={handleCancel}
                className="ml-auto bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded text-[10px] font-bold hover:bg-destructive/20 transition-colors"
              >
                Stop
              </button>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : queryData ? (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr>
                {queryData.columns.map((col) => (
                  <th
                    key={col}
                    className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryData.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                  {queryData.columns.map((col) => (
                    <td key={col} className="p-2 border-r border-border last:border-0 truncate max-w-[200px]">
                      {row[col] === null ? (
                        <span className="text-muted-foreground italic text-[10px]">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          executionStatus === 'success' && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Query executed successfully but returned no data.
            </div>
          )
        )}
      </div>
      {queryData && (
        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Rows: <span className="font-bold text-foreground">{queryData.rows.length}</span>
            </span>
            <span>
              Execution: <span className="font-bold text-foreground">{queryData.executionTime}ms</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-[10px] bg-background border border-border rounded px-2 py-1 outline-none"
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <div className="flex items-center gap-1 ml-4">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-bold px-2">{page + 1}</span>
              <button
                disabled={queryData.rows.length < pageSize}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
