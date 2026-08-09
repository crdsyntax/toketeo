import { useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  XCircle,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SchemaReport,
  ObjectDiff,
  IndexDiff,
  FkDiff,
  CompareStatus,
  TableDiff,
  ColumnDiffDetail,
} from '@/types/compare';

export type DiffGroupKey = 'missing' | 'modified' | 'new' | 'equal';

export interface CompareResultItem {
  id: string;
  group: DiffGroupKey;
  status: CompareStatus;
  name: string;
  sectionLabel: string;
  detail?: React.ReactNode;
}

const STATUS_CONFIG: Record<
  CompareStatus,
  { label: string; color: string; icon: typeof XCircle }
> = {
  equal: { label: 'Coinciden', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', icon: CheckCircle2 },
  modified: { label: 'Modificados', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', icon: AlertTriangle },
  new: { label: 'Solo en B', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', icon: PlusCircle },
  missing: { label: 'Solo en A', color: 'text-red-600 bg-red-50 dark:bg-red-950/30', icon: XCircle },
};

// ── Diff table A vs B for modified tables ──

function Cell({ value, highlight }: { value: React.ReactNode; highlight?: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-1.5 text-xs font-mono border-b border-border/40 align-top',
        highlight ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 'text-foreground'
      )}
    >
      {value ?? <span className="text-muted-foreground">—</span>}
    </td>
  );
}

function tableColumnsDiff(item: ObjectDiff): React.ReactNode {
  const details = item.details as TableDiff | undefined;
  if (!details?.columns || details.columns.length === 0) return null;
  const diffCols = details.columns.filter((c) => c.status !== 'equal');
  if (diffCols.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-muted/40">
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columna</th>
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">A</th>
            <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">B</th>
          </tr>
        </thead>
        <tbody>
          {diffCols.map((col: ColumnDiffDetail) => {
            const removed = col.status === 'missing'
            const added = col.status === 'new'
            return (
              <tr key={col.name}>
                <td className="px-3 py-1.5 text-xs font-mono border-b border-border/40 whitespace-nowrap">
                  {col.name}
                  <span
                    className={cn(
                      'ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium',
                      removed && 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
                      added && 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
                      !removed && !added && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                    )}
                  >
                    {removed ? 'solo en A' : added ? 'solo en B' : 'modificado'}
                  </span>
                </td>
                <Cell
                  value={removed ? undefined : col.source_type}
                  highlight={removed}
                />
                <Cell
                  value={added ? undefined : col.target_type}
                  highlight={added}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
      {diffCols.some((c) => c.status === 'modified') && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border/40 bg-muted/20">
          Detalle de cambios en columnas modificadas:
          <ul className="mt-1 space-y-0.5">
            {diffCols
              .filter((c) => c.status === 'modified')
              .map((c) => {
                const parts: string[] = [];
                if (c.source_type !== c.target_type) parts.push(`tipo ${c.source_type ?? '?'} → ${c.target_type ?? '?'}`);
                if (c.source_nullable !== c.target_nullable) parts.push(`nullable ${c.source_nullable} → ${c.target_nullable}`);
                if (c.source_default !== c.target_default) parts.push(`default ${c.source_default ?? 'NULL'} → ${c.target_default ?? 'NULL'}`);
                return (
                  <li key={c.name} className="font-mono">
                    {c.name}: {parts.join(' · ') || 'cambio estructural'}
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

function indexDetail(item: IndexDiff): React.ReactNode {
  if (item.status !== 'modified') return null;
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {item.columns_changed && (
        <div>
          Columnas: <span className="font-mono">[{item.columns_changed[0].join(', ')}]</span> → <span className="font-mono">[{item.columns_changed[1].join(', ')}]</span>
        </div>
      )}
      {item.unique_changed && (
        <div>
          Unique: <span className="font-mono">{String(item.unique_changed[0])}</span> → <span className="font-mono">{String(item.unique_changed[1])}</span>
        </div>
      )}
      {item.type_changed && (
        <div>
          Tipo: <span className="font-mono">{item.type_changed[0]}</span> → <span className="font-mono">{item.type_changed[1]}</span>
        </div>
      )}
    </div>
  );
}

function fkDetail(item: FkDiff): React.ReactNode {
  if (item.status !== 'modified') return null;
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {item.referenced_table && (
        <div>
          Tabla referenciada: <span className="font-mono">{item.referenced_table[0]}</span> → <span className="font-mono">{item.referenced_table[1]}</span>
        </div>
      )}
      {item.on_delete && (
        <div>
          ON DELETE: <span className="font-mono">{item.on_delete[0] || '—'}</span> → <span className="font-mono">{item.on_delete[1] || '—'}</span>
        </div>
      )}
      {item.on_update && (
        <div>
          ON UPDATE: <span className="font-mono">{item.on_update[0] || '—'}</span> → <span className="font-mono">{item.on_update[1] || '—'}</span>
        </div>
      )}
    </div>
  );
}

// ── Item row with expand + selection ──

interface ItemRowProps {
  item: CompareResultItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function ItemRow({ item, selected, onToggleSelect }: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[item.status];
  const canExpand = item.status !== 'equal' && !!item.detail;

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          className="rounded border-border accent-primary shrink-0"
          title="Incluir en el script"
        />
        <button
          onClick={() => canExpand && setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-2 flex-1 min-w-0 text-left transition-colors',
            canExpand ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default'
          )}
        >
          {canExpand ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <cfg.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-mono flex-1 min-w-0 truncate">{item.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">{item.sectionLabel}</span>
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium shrink-0', cfg.color)}>
            {cfg.label}
          </span>
        </button>
      </div>
      {expanded && item.detail && (
        <div className="px-3 pb-2 pl-11 space-y-1 border-t border-border/30">{item.detail}</div>
      )}
    </div>
  );
}

// ── Group section ──

function GroupSection({
  group,
  items,
  selectedIds,
  onToggleSelect,
}: {
  group: DiffGroupKey;
  items: CompareResultItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;

  const selectedCount = items.filter((i) => selectedIds.has(i.id)).length;
  const groupLabels: Record<DiffGroupKey, string> = {
    missing: 'Solo en A (faltan en B)',
    modified: 'Modificados',
    new: 'Solo en B (nuevos)',
    equal: 'Coinciden',
  };
  const groupColors: Record<DiffGroupKey, string> = {
    missing: 'text-red-600 dark:text-red-400',
    modified: 'text-amber-600 dark:text-amber-400',
    new: 'text-blue-600 dark:text-blue-400',
    equal: 'text-emerald-600 dark:text-emerald-400',
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className={cn('font-medium text-sm', groupColors[group])}>{groupLabels[group]}</span>
        <span className="text-xs text-muted-foreground">({items.length})</span>
        {selectedCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{selectedCount} seleccionados</span>
        )}
      </button>
      {expanded && (
        <div className="px-2 py-2 space-y-1">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item factory (shared with callers that need id → object mapping) ──

// eslint-disable-next-line react-refresh/only-export-components
export function buildCompareItems(report: SchemaReport): CompareResultItem[] {
  const out: CompareResultItem[] = [];
  const push = (group: DiffGroupKey, name: string, sectionLabel: string, detail?: React.ReactNode) => {
    out.push({
      id: `${group}:${sectionLabel}:${name}`,
      group,
      status: group === 'equal' ? 'equal' : group === 'missing' ? 'missing' : group === 'new' ? 'new' : 'modified',
      name,
      sectionLabel,
      detail,
    });
  };

  report.tables.forEach((t) => push(t.status as DiffGroupKey, t.name, 'tabla', tableColumnsDiff(t)));
  report.indexes.forEach((i) => push(i.status as DiffGroupKey, `${i.table}.${i.name}`, 'índice', indexDetail(i)));
  report.foreign_keys.forEach((f) => push(f.status as DiffGroupKey, `${f.table}.${f.name}`, 'FK', fkDetail(f)));
  report.constraints.forEach((c) => push(c.status as DiffGroupKey, `${c.table}.${c.name}`, 'constraint'));
  report.views.forEach((v) => push(v.status as DiffGroupKey, v.name, 'vista'));
  report.procedures.forEach((p) => push(p.status as DiffGroupKey, p.name, 'procedimiento'));
  report.functions.forEach((f) => push(f.status as DiffGroupKey, f.name, 'función'));
  report.triggers.forEach((t) => push(t.status as DiffGroupKey, t.name, 'trigger'));
  return out;
}

// ── Main component ──

export function CompareResultsList({
  report,
  selectedIds,
  onToggleSelect,
}: {
  report: SchemaReport;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompareStatus | 'all'>('all');

  const items = useMemo<CompareResultItem[]>(() => buildCompareItems(report), [report]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<DiffGroupKey, number> = { missing: 0, modified: 0, new: 0, equal: 0 };
    for (const item of items) c[item.group] += 1;
    return c;
  }, [items]);

  const byGroup = useMemo(
    () => ({
      missing: filtered.filter((i) => i.group === 'missing'),
      modified: filtered.filter((i) => i.group === 'modified'),
      new: filtered.filter((i) => i.group === 'new'),
      equal: filtered.filter((i) => i.group === 'equal'),
    }),
    [filtered]
  );

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar objeto..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'missing', 'modified', 'new', 'equal'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                statusFilter === s
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {s === 'all' ? `Todo (${items.length})` : `${STATUS_CONFIG[s].label} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-2">
        <GroupSection group="missing" items={byGroup.missing} selectedIds={selectedIds ?? new Set()} onToggleSelect={onToggleSelect ?? (() => {})} />
        <GroupSection group="modified" items={byGroup.modified} selectedIds={selectedIds ?? new Set()} onToggleSelect={onToggleSelect ?? (() => {})} />
        <GroupSection group="new" items={byGroup.new} selectedIds={selectedIds ?? new Set()} onToggleSelect={onToggleSelect ?? (() => {})} />
        <GroupSection group="equal" items={byGroup.equal} selectedIds={selectedIds ?? new Set()} onToggleSelect={onToggleSelect ?? (() => {})} />
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 italic">
          No hay objetos que coincidan con el filtro
        </p>
      )}
    </div>
  );
}
