import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  XCircle,
  Database,
  Eye,
  Code2,
  FunctionSquare,
  Bell,
  ListOrdered,
  Link2,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SchemaReport,
  ObjectDiff,
  IndexDiff,
  FkDiff,
  ConstraintDiff,
  CompareStatus,
  TableDiff,
  ColumnDiffDetail,
} from '@/types/compare';

// ── Descriptions ──

function describeObjectDiff(item: ObjectDiff, sectionLabel: string): string {
  const lower = sectionLabel.toLowerCase().replace(/s$/, '');
  switch (item.status) {
    case 'missing':
      return `${item.name} exists in source but not in target. Will be created as a CREATE ${lower.toUpperCase()}.`;
    case 'new':
      return `${item.name} exists in target but not in source. No action needed.`;
    case 'modified': {
      const d = item.details;
      if (!d) return `${item.name} has differences between source and target.`;
      if ('columns' in d) {
        const td = d as TableDiff;
        const parts: string[] = [];
        const missing = td.columns.filter((c: ColumnDiffDetail) => c.status === 'missing');
        const added = td.columns.filter((c: ColumnDiffDetail) => c.status === 'new');
        const changed = td.columns.filter((c: ColumnDiffDetail) => c.status === 'modified');
        if (missing.length) parts.push(`missing in target: ${missing.map((c: ColumnDiffDetail) => c.name).join(', ')}`);
        if (added.length) parts.push(`extra in target: ${added.map((c: ColumnDiffDetail) => c.name).join(', ')}`);
        if (changed.length) {
          parts.push(
            changed
              .map((c: ColumnDiffDetail) => {
                const diffs: string[] = [];
                if (c.source_type !== c.target_type) diffs.push(`type ${c.source_type ?? '?'} → ${c.target_type ?? '?'}`);
                if (c.source_nullable !== c.target_nullable) diffs.push(`nullable ${c.source_nullable} → ${c.target_nullable}`);
                if (c.source_default !== c.target_default) diffs.push(`default ${c.source_default ?? 'NULL'} → ${c.target_default ?? 'NULL'}`);
                return `${c.name} (${diffs.join(', ')})`;
              })
              .join('; ')
          );
        }
        return parts.length ? parts.join('. ') : `${item.name} has structural differences.`;
      }
      if ('source_hash' in d) return `${item.name} definition differs between source and target.`;
      if ('timing_changed' in d || 'event_changed' in d || 'body_hash_changed' in d) {
        const parts: string[] = [];
        const dd = d as Record<string, unknown>;
        if (dd.timing_changed) parts.push('timing changed');
        if (dd.event_changed) parts.push('event changed');
        if (dd.body_hash_changed) parts.push('body/logic changed');
        return `${item.name}: ${parts.join(', ')}.`;
      }
      return `${item.name} has differences between source and target.`;
    }
    default:
      return `${item.name} is identical in both source and target.`;
  }
}

function describeIndexDiff(item: IndexDiff): string {
  switch (item.status) {
    case 'missing':
      return `Index exists in source but not in target. Will be created on ${item.table}.`;
    case 'new':
      return `Index exists in target but not in source. Already present.`;
    case 'modified': {
      const parts: string[] = [];
      if (item.columns_changed) {
        const [src, tgt] = item.columns_changed;
        parts.push(`columns: [${src.join(', ')}] → [${tgt.join(', ')}]`);
      }
      if (item.unique_changed) {
        parts.push(`unique: ${item.unique_changed[0]} → ${item.unique_changed[1]}`);
      }
      if (item.type_changed) {
        parts.push(`type: ${item.type_changed[0]} → ${item.type_changed[1]}`);
      }
      return `${item.name} on ${item.table}: ${parts.join('; ')}`;
    }
    default:
      return `${item.name} on ${item.table} is identical.`;
  }
}

function describeFkDiff(item: FkDiff): string {
  switch (item.status) {
    case 'missing':
      return `Foreign key exists in source but not in target. Will be created on ${item.table}.`;
    case 'new':
      return `Foreign key exists in target but not in source. Already present.`;
    case 'modified': {
      const parts: string[] = [];
      if (item.referenced_table) parts.push(`referenced table: ${item.referenced_table[0]} → ${item.referenced_table[1]}`);
      if (item.on_delete) parts.push(`ON DELETE: ${item.on_delete[0] || '—'} → ${item.on_delete[1] || '—'}`);
      if (item.on_update) parts.push(`ON UPDATE: ${item.on_update[0] || '—'} → ${item.on_update[1] || '—'}`);
      if (item.columns) parts.push(`columns: [${item.columns[0].join(', ')}] → [${item.columns[1].join(', ')}]`);
      return `${item.name} on ${item.table}: ${parts.join('; ')}`;
    }
    default:
      return `${item.name} on ${item.table} is identical.`;
  }
}

function describeConstraintDiff(item: ConstraintDiff): string {
  switch (item.status) {
    case 'missing':
      return `Constraint (${item.constraint_type ?? 'unknown'}) exists in source but not in target. Will be created on ${item.table}.`;
    case 'new':
      return `Constraint (${item.constraint_type ?? 'unknown'}) exists in target but not in source. Already present.`;
    case 'modified': {
      const parts: string[] = [];
      if (item.constraint_type) parts.push(`type: ${item.constraint_type}`);
      if (item.definition_changed) parts.push(`definition changed`);
      return `${item.name} on ${item.table}: ${parts.join('; ')}`;
    }
    default:
      return `${item.name} on ${item.table} is identical.`;
  }
}

// ── Status components ──

function StatusIcon({ status }: { status: CompareStatus }) {
  switch (status) {
    case 'equal':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'modified':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'new':
      return <PlusCircle className="w-4 h-4 text-blue-500" />;
    case 'missing':
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function StatusBadge({ status }: { status: CompareStatus }) {
  const config: Record<CompareStatus, { label: string; color: string }> = {
    equal: { label: 'Equal', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
    modified: { label: 'Modified', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    new: { label: 'New', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
    missing: { label: 'Missing', color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
  };
  const c = config[status];
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', c.color)}>
      {c.label}
    </span>
  );
}

// ── Column detail pills (for expanded table rows) ──

function ColumnDiffPill({ col }: { col: ColumnDiffDetail }) {
  const badge =
    col.status === 'missing'
      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
      : col.status === 'new'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';

  const parts: string[] = [];
  if (col.status === 'missing') {
    parts.push(`type: ${col.source_type ?? '?'}`);
    if (col.source_nullable !== undefined) parts.push(`nullable: ${col.source_nullable}`);
  } else if (col.status === 'new') {
    parts.push(`type: ${col.target_type ?? '?'}`);
    if (col.target_nullable !== undefined) parts.push(`nullable: ${col.target_nullable}`);
  } else {
    if (col.source_type !== col.target_type) parts.push(`type: ${col.source_type ?? '?'} → ${col.target_type ?? '?'}`);
    if (col.source_nullable !== col.target_nullable) parts.push(`nullable: ${col.source_nullable} → ${col.target_nullable}`);
    if (col.source_default !== col.target_default) parts.push(`default: ${col.source_default ?? 'NULL'} → ${col.target_default ?? 'NULL'}`);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('px-1.5 py-0.5 rounded font-medium', badge)}>
        {col.status === 'missing' ? '−' : col.status === 'new' ? '+' : '~'}
      </span>
      <span className="font-mono font-medium">{col.name}</span>
      <span className="text-muted-foreground">{parts.join(' · ')}</span>
    </div>
  );
}

// ── Diff row with expand ──

interface DiffRowProps {
  item: unknown;
  getStatus: (i: unknown) => CompareStatus;
  getName: (i: unknown) => string;
  describe: (i: unknown) => string;
  children?: React.ReactNode;
}

function DiffRow({ item, getStatus, getName, describe, children }: DiffRowProps) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(item);
  const name = getName(item);
  const description = describe(item);
  const hasChildren = !!children;
  const canExpand = status !== 'equal' && hasChildren;

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors',
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
        <StatusIcon status={status} />
        <span className="text-sm font-mono flex-1 min-w-0 truncate">{name}</span>
        <StatusBadge status={status} />
      </button>
      {status !== 'equal' && (
        <div className="px-4 pb-1.5 pl-11 text-xs text-muted-foreground leading-relaxed border-t border-border/30">
          {description}
        </div>
      )}
      {expanded && children && (
        <div className="px-4 pb-2 pl-11 space-y-1 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Section ──

interface SectionDef {
  key: string;
  label: string;
  icon: typeof Database;
  items: (ObjectDiff | IndexDiff | FkDiff | ConstraintDiff)[];
  getStatus: (item: unknown) => CompareStatus;
  getName: (item: unknown) => string;
  describe: (item: unknown) => string;
  renderDetail?: (item: unknown) => React.ReactNode;
}

function Section({ section }: { section: SectionDef }) {
  const [expanded, setExpanded] = useState(true);
  const Icon = section.icon;
  const total = section.items.length;
  const modified = section.items.filter((i) => {
    const s = section.getStatus(i);
    return s === 'modified' || s === 'new' || s === 'missing';
  }).length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium text-sm">{section.label}</span>
        <span className="text-xs text-muted-foreground ml-1">({total})</span>
        {modified > 0 && (
          <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">
            {modified} change{modified !== 1 ? 's' : ''}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {section.items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-2 italic">No differences</p>
          ) : (
            section.items.map((item, i) => (
              <DiffRow
                key={i}
                item={item}
                getStatus={section.getStatus}
                getName={section.getName}
                describe={section.describe}
              >
                {section.renderDetail?.(item)}
              </DiffRow>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Accessors ──

function getObjectDiffStatus(item: unknown): CompareStatus {
  return (item as ObjectDiff).status;
}

function getObjectDiffName(item: unknown): string {
  return (item as ObjectDiff).name;
}

function getObjectDiffDescribe(sectionLabel: string) {
  return (item: unknown) => describeObjectDiff(item as ObjectDiff, sectionLabel);
}

function getIndexDiffStatus(item: unknown): CompareStatus {
  return (item as IndexDiff).status;
}

function getIndexDiffName(item: unknown): string {
  const idx = item as IndexDiff;
  return `${idx.table}.${idx.name}`;
}

function getFkDiffStatus(item: unknown): CompareStatus {
  return (item as FkDiff).status;
}

function getFkDiffName(item: unknown): string {
  const fk = item as FkDiff;
  return `${fk.table}.${fk.name}`;
}

function getConstraintDiffStatus(item: unknown): CompareStatus {
  return (item as ConstraintDiff).status;
}

function getConstraintDiffName(item: unknown): string {
  const c = item as ConstraintDiff;
  return `${c.table}.${c.name}`;
}

// ── Table detail renderer ──

function renderTableDetail(item: unknown) {
  const obj = item as ObjectDiff;
  const details = obj.details as TableDiff | undefined;
  if (!details?.columns) return null;
  const diffCols = details.columns.filter((c) => c.status !== 'equal');
  if (diffCols.length === 0) return null;
  return (
    <div className="space-y-1 pt-1">
      {diffCols.map((col) => (
        <ColumnDiffPill key={col.name} col={col} />
      ))}
    </div>
  );
}

// ── Index detail renderer ──

function renderIndexDetail(item: unknown) {
  const idx = item as IndexDiff;
  if (idx.status !== 'modified') return null;
  const parts: React.ReactNode[] = [];
  if (idx.columns_changed) {
    parts.push(
      <div key="cols" className="text-xs text-muted-foreground">
        Columns: <span className="font-mono">[{idx.columns_changed[0].join(', ')}]</span> → <span className="font-mono">[{idx.columns_changed[1].join(', ')}]</span>
      </div>
    );
  }
  if (idx.unique_changed) {
    parts.push(
      <div key="uniq" className="text-xs text-muted-foreground">
        Unique: <span className="font-mono">{String(idx.unique_changed[0])}</span> → <span className="font-mono">{String(idx.unique_changed[1])}</span>
      </div>
    );
  }
  if (idx.type_changed) {
    parts.push(
      <div key="typ" className="text-xs text-muted-foreground">
        Type: <span className="font-mono">{idx.type_changed[0]}</span> → <span className="font-mono">{idx.type_changed[1]}</span>
      </div>
    );
  }
  return parts.length ? <div className="space-y-0.5 pt-1">{parts}</div> : null;
}

// ── FK detail renderer ──

function renderFkDetail(item: unknown) {
  const fk = item as FkDiff;
  if (fk.status !== 'modified') return null;
  const parts: React.ReactNode[] = [];
  if (fk.referenced_table) {
    parts.push(
      <div key="ref" className="text-xs text-muted-foreground">
        Referenced table: <span className="font-mono">{fk.referenced_table[0]}</span> → <span className="font-mono">{fk.referenced_table[1]}</span>
      </div>
    );
  }
  if (fk.on_delete) {
    parts.push(
      <div key="od" className="text-xs text-muted-foreground">
        ON DELETE: <span className="font-mono">{fk.on_delete[0] || '—'}</span> → <span className="font-mono">{fk.on_delete[1] || '—'}</span>
      </div>
    );
  }
  if (fk.on_update) {
    parts.push(
      <div key="ou" className="text-xs text-muted-foreground">
        ON UPDATE: <span className="font-mono">{fk.on_update[0] || '—'}</span> → <span className="font-mono">{fk.on_update[1] || '—'}</span>
      </div>
    );
  }
  return parts.length ? <div className="space-y-0.5 pt-1">{parts}</div> : null;
}

// ── Main tree ──

export function SchemaDiffTree({ report }: { report: SchemaReport }) {
  const sections: SectionDef[] = [
    {
      key: 'tables',
      label: 'Tables',
      icon: Database,
      items: report.tables,
      getStatus: getObjectDiffStatus,
      getName: getObjectDiffName,
      describe: getObjectDiffDescribe('Tables'),
      renderDetail: renderTableDetail,
    },
    {
      key: 'indexes',
      label: 'Indexes',
      icon: ListOrdered,
      items: report.indexes,
      getStatus: getIndexDiffStatus,
      getName: getIndexDiffName,
      describe: (item) => describeIndexDiff(item as IndexDiff),
      renderDetail: renderIndexDetail,
    },
    {
      key: 'foreign_keys',
      label: 'Foreign Keys',
      icon: Link2,
      items: report.foreign_keys,
      getStatus: getFkDiffStatus,
      getName: getFkDiffName,
      describe: (item) => describeFkDiff(item as FkDiff),
      renderDetail: renderFkDetail,
    },
    {
      key: 'constraints',
      label: 'Constraints',
      icon: Shield,
      items: report.constraints,
      getStatus: getConstraintDiffStatus,
      getName: getConstraintDiffName,
      describe: (item) => describeConstraintDiff(item as ConstraintDiff),
    },
    {
      key: 'views',
      label: 'Views',
      icon: Eye,
      items: report.views,
      getStatus: getObjectDiffStatus,
      getName: getObjectDiffName,
      describe: getObjectDiffDescribe('Views'),
    },
    {
      key: 'procedures',
      label: 'Procedures',
      icon: Code2,
      items: report.procedures,
      getStatus: getObjectDiffStatus,
      getName: getObjectDiffName,
      describe: getObjectDiffDescribe('Procedures'),
    },
    {
      key: 'functions',
      label: 'Functions',
      icon: FunctionSquare,
      items: report.functions,
      getStatus: getObjectDiffStatus,
      getName: getObjectDiffName,
      describe: getObjectDiffDescribe('Functions'),
    },
    {
      key: 'triggers',
      label: 'Triggers',
      icon: Bell,
      items: report.triggers,
      getStatus: getObjectDiffStatus,
      getName: getObjectDiffName,
      describe: getObjectDiffDescribe('Triggers'),
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <Section key={section.key} section={section} />
      ))}
    </div>
  );
}
