import { memo, useState, useCallback, useMemo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import {
  Database,
  Table2,
  ChevronDown,
  ChevronUp,
  TableProperties,
  Rows,
  Braces,
  Copy,
  Check,
} from 'lucide-react';
import { formatCellValue as formatRawCellValue } from '@/lib/formatCellValue';
import { JsonResultsView } from '@/components/ui/JsonResultsView';
import { cn } from '@/lib/utils';
import type { DbRow, DbValue } from '@/types/database';
import toast from 'react-hot-toast';

export interface SqlTableNodeData extends Record<string, unknown> {
  label: string;
  isRoot: boolean;
  alias?: string;
  tableName: string;
  columns?: string[];
  rows?: Record<string, DbValue>[];
}

export type SqlTableNodeType = Node<SqlTableNodeData, 'sqlTable'>;

function getDisplayValue(val: DbValue): { text: string; isNull?: boolean; isBool?: boolean } {
  if (val === null || val === undefined) {
    return { text: 'null', isNull: true };
  }
  if (typeof val === 'boolean') {
    return { text: val ? 'true' : 'false', isBool: true };
  }
  return { text: formatRawCellValue(val) };
}

export const SqlTableNode = memo(({ data, selected }: NodeProps<SqlTableNodeType>) => {
  const isRoot = data.isRoot;
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('json');
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => data.rows ?? [], [data.rows]);
  const hasRows = rows.length > 0;
  const columns = useMemo(() => {
    if (data.columns && data.columns.length > 0) return data.columns;
    if (hasRows) return Object.keys(rows[0]);
    return [];
  }, [data.columns, hasRows, rows]);

  const handleCopyJson = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      setCopied(true);
      toast.success(`JSON copiado (${rows.length} registros)`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Error al copiar JSON');
    }
  }, [rows]);

  return (
    <div
      className={cn(
        'relative bg-card/95 backdrop-blur border rounded-xl shadow-xl transition-all duration-200 hover:shadow-2xl hover:border-primary/60 group w-full h-full flex flex-col overflow-hidden',
        hasRows ? 'min-w-[320px] min-h-[220px]' : 'min-w-[240px] min-h-[160px]',
        isRoot
          ? 'border-emerald-500/50 shadow-emerald-950/20'
          : 'border-blue-500/40 shadow-blue-950/20',
        selected && 'ring-2 ring-primary border-primary'
      )}
    >
      {/* Node Resizer Control */}
      <NodeResizer
        minWidth={300}
        minHeight={180}
        isVisible={selected}
        lineClassName="!border-primary/70"
        handleClassName="!h-2.5 !w-2.5 !bg-primary !rounded !border-2 !border-background"
      />

      {/* Target Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!w-3 !h-3 !border-2 !border-background',
          isRoot ? '!bg-emerald-500' : '!bg-blue-500'
        )}
      />
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3 !border-2 !border-background',
          isRoot ? '!bg-emerald-500' : '!bg-blue-500'
        )}
      />

      {/* Header */}
      <div
        className={cn(
          'px-3.5 py-2.5 border-b flex items-center justify-between gap-2 select-none shrink-0',
          isRoot
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isRoot ? (
            <Database className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <Table2 className="w-4 h-4 shrink-0 text-blue-400" />
          )}
          <span className="font-semibold text-sm truncate text-foreground" title={data.tableName}>
            {data.tableName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
              isRoot
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
            )}
          >
            {isRoot ? 'FROM (Base)' : 'JOIN'}
          </span>

          {hasRows && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-background/40 rounded transition-colors text-muted-foreground hover:text-foreground"
              title={isExpanded ? 'Contraer registros' : 'Expandir registros'}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Table Metadata Subheader & View Controls */}
      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/60 text-xs flex items-center justify-between text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          {data.alias && (
            <span className="flex items-center gap-1 font-mono">
              <span>alias:</span>
              <span className="font-semibold px-1 py-0.2 rounded bg-muted text-primary border border-border">
                {data.alias}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasRows && (
            <div className="flex items-center bg-background/80 border border-border/70 rounded-md p-0.5 mr-1">
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors',
                  viewMode === 'table'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Vista de Tabla"
              >
                <Table2 className="w-3 h-3" />
                Tabla
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors',
                  viewMode === 'json'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Vista JSON"
              >
                <Braces className="w-3 h-3" />
                JSON
              </button>
            </div>
          )}

          {hasRows && (
            <button
              onClick={handleCopyJson}
              className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
              title="Copiar JSON al portapapeles"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}

          <div className="flex items-center font-mono text-[11px]">
            {data.rows !== undefined ? (
              <span
                className={cn(
                  'flex items-center gap-1 font-medium px-1.5 py-0.5 rounded',
                  hasRows
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Rows className="w-3 h-3" />
                {rows.length} {rows.length === 1 ? 'reg' : 'regs'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground/70">
                <TableProperties className="w-3 h-3" />
                Estructura
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body: Table or JSON View */}
      {data.rows !== undefined ? (
        isExpanded && (
          <div className="p-2 bg-background/70 flex-1 min-h-0 flex flex-col">
            {hasRows && columns.length > 0 ? (
              viewMode === 'table' ? (
                <div className="border border-border/80 rounded-lg overflow-hidden bg-card/60 shadow-inner flex-1 min-h-0 flex flex-col">
                  <div className="overflow-auto scrollbar-thin flex-1 min-h-[100px]">
                    <table className="w-full border-collapse text-left font-mono text-[11px]">
                      <thead>
                        <tr className="bg-muted/70 border-b border-border text-muted-foreground sticky top-0 z-10 backdrop-blur">
                          <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/80 w-8 text-center border-r border-border/50">
                            #
                          </th>
                          {columns.map((col) => (
                            <th
                              key={col}
                              className="px-2.5 py-1.5 font-semibold text-foreground/90 whitespace-nowrap border-r border-border/50 last:border-r-0"
                              title={col}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-primary/5 transition-colors group/row"
                          >
                            <td className="px-2 py-1 text-[10px] text-center text-muted-foreground/60 border-r border-border/40 select-none bg-muted/20">
                              {idx + 1}
                            </td>
                            {columns.map((col) => {
                              const val = row[col];
                              const { text, isNull, isBool } = getDisplayValue(val);
                              return (
                                <td
                                  key={col}
                                  className="px-2.5 py-1 whitespace-nowrap border-r border-border/40 last:border-r-0 max-w-[180px] truncate text-foreground"
                                  title={`${col}: ${text}`}
                                >
                                  {isNull ? (
                                    <span className="italic text-muted-foreground/50 text-[10px] font-sans">
                                      null
                                    </span>
                                  ) : isBool ? (
                                    <span
                                      className={cn(
                                        'px-1 py-0.2 rounded text-[10px] font-bold',
                                        val ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                      )}
                                    >
                                      {text}
                                    </span>
                                  ) : (
                                    <span>{text}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* JSON View Mode (Idéntico a ResultsPanel) */
                <div className="border border-border/80 rounded-lg overflow-hidden bg-card/80 flex-1 min-h-[100px] relative">
                  <JsonResultsView rows={rows as DbRow[]} />
                </div>
              )
            ) : (
              <div className="py-4 px-3 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/80 flex-1 flex flex-col justify-center items-center">
                <p className="text-xs font-medium text-muted-foreground/80">
                  0 registros resultantes
                </p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5 max-w-[240px]">
                  Esta tabla no contiene filas que coincidan con la condición del JOIN / WHERE.
                </p>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="p-3 text-xs flex flex-col gap-1 bg-background/50 text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Tipo:</span>
            <span className="font-medium text-foreground">Tabla</span>
          </div>
        </div>
      )}

      {/* Output Source Handles */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!w-3 !h-3 !border-2 !border-background',
          isRoot ? '!bg-emerald-500' : '!bg-blue-500'
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-3 !h-3 !border-2 !border-background',
          isRoot ? '!bg-emerald-500' : '!bg-blue-500'
        )}
      />
    </div>
  );
});

SqlTableNode.displayName = 'SqlTableNode';
