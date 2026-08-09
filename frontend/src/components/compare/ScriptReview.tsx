import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, AlertTriangle, Copy, CheckCircle2, Download, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScriptStatement } from '@/types/compare';

type ScriptGroupKey = 'create' | 'alter' | 'drop' | 'data';

const GROUP_TYPES: Record<ScriptGroupKey, string[]> = {
  create: ['create', 'create_index', 'add_fk', 'create_view', 'create_procedure', 'create_function', 'create_trigger'],
  alter: ['alter', 'alter_add', 'alter_drop', 'recreate_index', 'recreate_fk', 'recreate_table'],
  drop: ['drop', 'drop_index', 'drop_fk', 'drop_view', 'drop_procedure', 'drop_function', 'drop_trigger'],
  data: ['data_insert', 'data_update', 'data_delete'],
};

const GROUP_CONFIG: Record<ScriptGroupKey, { label: string; color: string; chip: string }> = {
  create: { label: 'CREATE', color: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  alter: { label: 'ALTER', color: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  drop: { label: 'DROP', color: 'text-red-600 dark:text-red-400', chip: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  data: { label: 'DATA SYNC', color: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
};

function classifyStatement(diffType: string): ScriptGroupKey | 'section' | 'other' {
  if (diffType === 'section') return 'section';
  for (const key of Object.keys(GROUP_TYPES) as ScriptGroupKey[]) {
    if (GROUP_TYPES[key].includes(diffType)) return key;
  }
  return 'other';
}

function isDestructive(stmt: ScriptStatement): boolean {
  const t = stmt.diff_type;
  return t === 'alter_drop' || t === 'recreate_table' || t === 'data_delete' || classifyStatement(t) === 'drop';
}

const KEYWORDS = /\b(?:ADD|ALTER|AND|AS|ASC|AUTO_INCREMENT|BEGIN|BIGINT|BOOLEAN|CALL|CASCADE|CASE|CHAR|CHARSET|CHECK|COLLATE|COLUMN|COMMENT|COMMIT|CONSTRAINT|CREATE|DATETIME|DECIMAL|DEFAULT|DELETE|DESC|DOUBLE|DROP|ELSE|END|ENGINE|EXECUTE|EXISTS|FLOAT|FOREIGN|FROM|IF|INDEX|INSERT|INT|INTEGER|INTO|KEY|NOT|NULL|ON|OR|PRIMARY|PROCEDURE|REFERENCES|RENAME|RETURN|SELECT|SET|TABLE|TEXT|THEN|TIME|TIMESTAMP|TO|TRANSACTION|TRIGGER|UNIQUE|UPDATE|USING|VALUES|VARCHAR|VIEW|WHEN|WHERE|WITH|IDENTITY|BOOLEAN)\b|'[^']*'|"[^"]*"|`[^`]*`/gi;

function highlightSql(sql: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(KEYWORDS.source, 'gi');
  while ((m = re.exec(sql)) !== null) {
    if (m.index > last) parts.push(sql.slice(last, m.index));
    const token = m[0];
    const isString = token.startsWith("'") || token.startsWith('"') || token.startsWith('`');
    parts.push(
      <span key={i++} className={isString ? 'text-emerald-400' : 'text-sky-400 font-semibold'}>
        {token}
      </span>
    );
    last = m.index + token.length;
  }
  if (last < sql.length) parts.push(sql.slice(last));
  return parts;
}

function StatementRow({
  stmt,
  selected,
  onToggle,
}: {
  stmt: ScriptStatement;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const group = classifyStatement(stmt.diff_type);
  const destructive = isDestructive(stmt);
  const cfg = group !== 'section' && group !== 'other' ? GROUP_CONFIG[group] : null;

  if (group === 'section') {
    return (
      <div className="px-3 py-1 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all bg-muted/20 rounded">
        {stmt.sql}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden',
        destructive ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-border/50'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(stmt.id)}
          className="rounded border-border accent-primary shrink-0"
        />
        {destructive && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="Cambio destructivo" />}
        {cfg && <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0', cfg.chip)}>{cfg.label}</span>}
        <span className="text-[11px] text-muted-foreground shrink-0">{stmt.object_type}</span>
        <span className="text-xs font-mono text-foreground flex-1 min-w-0 truncate">{stmt.object_name}</span>
        <span className="text-[11px] text-muted-foreground hidden md:inline shrink-0 max-w-[220px] truncate">{stmt.description}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && (
        <pre className="mx-3 mb-2 mt-0.5 text-[11px] font-mono bg-muted/40 border border-border rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed text-foreground/90">
          {highlightSql(stmt.sql)}
        </pre>
      )}
    </div>
  );
}

export function ScriptReview({
  statements,
  selectedIds,
  onToggle,
  onCopy,
  copied,
  onDownload,
}: {
  statements: ScriptStatement[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
}) {
  const groups = useMemo(() => {
    const order: ScriptGroupKey[] = ['create', 'alter', 'drop', 'data'];
    return order
      .map((key) => ({
        key,
        items: statements.filter((s) => classifyStatement(s.diff_type) === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [statements]);

  const sections = useMemo(
    () => statements.filter((s) => classifyStatement(s.diff_type) === 'section'),
    [statements]
  );

  const selectedCount = statements.filter((s) => selectedIds.has(s.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedCount}</span> de{' '}
          <span className="font-semibold text-foreground">{statements.length}</span> statements seleccionados
        </span>
        <div className="flex items-center gap-2">
          <button onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy Selected'}
          </button>
          <button onClick={onDownload} disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <Download className="w-3 h-3" />
            Download .sql
          </button>
        </div>
      </div>

      {sections.length > 0 && (
        <div className="space-y-1">{sections.map((s) => <StatementRow key={s.id} stmt={s} selected={false} onToggle={() => undefined} />)}</div>
      )}

      <div className="space-y-2">
        {groups.map((group) => {
          const cfg = GROUP_CONFIG[group.key];
          const allSelected = group.items.every((s) => selectedIds.has(s.id));
          const toggleGroup = () => {
            if (allSelected) group.items.forEach((s) => { if (selectedIds.has(s.id)) onToggle(s.id) })
            else group.items.forEach((s) => { if (!selectedIds.has(s.id)) onToggle(s.id) })
          };
          return (
            <div key={group.key} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleGroup}
                  className="rounded border-border accent-primary shrink-0"
                  title="Seleccionar todo el grupo"
                />
                <span className={cn('font-semibold text-xs', cfg.color)}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground">({group.items.length})</span>
              </div>
              <div className="px-2 py-2 space-y-1">
                {group.items.map((s) => (
                  <StatementRow key={s.id} stmt={s} selected={selectedIds.has(s.id)} onToggle={onToggle} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {statements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <FileCode className="w-8 h-8 opacity-30" />
          <p className="text-sm">No statements generated. All objects may already exist in target.</p>
        </div>
      )}
    </div>
  );
}
