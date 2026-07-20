import { useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, AlertTriangle, PlusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataReport, TableDataDiff, RowColumnDiff } from '@/types/compare';

function DataStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'equal': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'modified': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    default: return null;
  }
}

function TableDiffRow({ table }: { table: TableDataDiff }) {
  const [expanded, setExpanded] = useState(false);
  const hasDifferences = table.rows_modified > 0 || table.rows_only_in_source > 0 || table.rows_only_in_target > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        {hasDifferences ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
        <span className="font-medium text-sm font-mono">{table.table}</span>
        <span className="text-xs text-muted-foreground ml-2">({table.source_count.toLocaleString()} src / {table.target_count.toLocaleString()} tgt)</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-emerald-600">{table.rows_equal.toLocaleString()} equal</span>
          {table.rows_modified > 0 && <span className="text-amber-600">{table.rows_modified} modified</span>}
          {table.rows_only_in_source > 0 && <span className="text-red-600">{table.rows_only_in_source} src-only</span>}
          {table.rows_only_in_target > 0 && <span className="text-blue-600">{table.rows_only_in_target} tgt-only</span>}
        </div>
      </button>
      {expanded && hasDifferences && table.column_diffs.length > 0 && (
        <div className="px-4 pb-3">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1 pr-2">PK Value</th>
                <th className="text-left py-1 px-2">Column</th>
                <th className="text-left py-1 px-2">Source</th>
                <th className="text-left py-1 pl-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {table.column_diffs.slice(0, 50).map((diff, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 pr-2 font-mono text-muted-foreground">{diff.pk_value}</td>
                  <td className="py-1 px-2 font-medium">{diff.column}</td>
                  <td className="py-1 px-2 font-mono text-red-600">{formatValue(diff.source_value)}</td>
                  <td className="py-1 pl-2 font-mono text-emerald-600">{formatValue(diff.target_value)}</td>
                </tr>
              ))}
              {table.column_diffs.length > 50 && (
                <tr>
                  <td colSpan={4} className="text-center py-2 text-muted-foreground italic">
                    ... and {table.column_diffs.length - 50} more differences
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '<null>';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function DataDiffView({ report }: { report: DataReport }) {
  const totalModified = report.tables.reduce(
    (sum, t) => sum + t.rows_modified + t.rows_only_in_source + t.rows_only_in_target,
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <span>{report.tables.length} tables compared</span>
        <span className="text-muted-foreground/50">|</span>
        <span className={cn(totalModified > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600')}>
          {totalModified > 0 ? `${totalModified} total differences` : 'All rows equal'}
        </span>
      </div>
      {report.tables.map((table, i) => (
        <TableDiffRow key={i} table={table} />
      ))}
    </div>
  );
}
