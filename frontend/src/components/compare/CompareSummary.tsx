import { useMemo } from 'react'
import { CheckCircle2, AlertTriangle, PlusCircle, XCircle, FileCode, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildCompareItems } from '@/lib/compareHelpers'
import type { CompareStatus, SchemaReport } from '@/types/compare'

const CARDS: {
  status: CompareStatus;
  label: string;
  icon: typeof CheckCircle2;
  iconColor: string;
  cardColor: string;
  countColor: string;
}[] = [
  {
    status: 'equal',
    label: 'Coinciden',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    cardColor: 'border-emerald-500/25 bg-emerald-500/[0.04]',
    countColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    status: 'modified',
    label: 'Modificados',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    cardColor: 'border-amber-500/25 bg-amber-500/[0.04]',
    countColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    status: 'new',
    label: 'Solo en B (nuevos)',
    icon: PlusCircle,
    iconColor: 'text-sky-500',
    cardColor: 'border-sky-500/25 bg-sky-500/[0.04]',
    countColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    status: 'missing',
    label: 'Solo en A (faltan en B)',
    icon: XCircle,
    iconColor: 'text-red-500',
    cardColor: 'border-red-500/25 bg-red-500/[0.04]',
    countColor: 'text-red-600 dark:text-red-400',
  },
];

export function CompareSummary({
  report,
  onViewScript,
  onReviewDiffs,
}: {
  report: SchemaReport;
  onViewScript: () => void;
  onReviewDiffs: () => void;
}) {
  const counts = useMemo(() => {
    const c: Record<CompareStatus, number> = { equal: 0, modified: 0, missing: 0, new: 0 };
    for (const item of buildCompareItems(report)) c[item.status] += 1;
    return c;
  }, [report]);

  const total = counts.equal + counts.modified + counts.missing + counts.new;
  const hasDiffs = counts.modified + counts.missing + counts.new > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {CARDS.map(({ status, label, icon: Icon, iconColor, cardColor, countColor }) => (
          <div
            key={status}
            className={cn(
              'flex flex-col gap-1 rounded-lg border px-3 py-2.5 min-w-0',
              cardColor
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />
              <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
            </div>
            <span className={cn('text-xl font-bold leading-none', countColor)}>{counts[status]}</span>
          </div>
        ))}
      </div>

      {report.summary && (
        <p className="text-xs leading-relaxed text-foreground/80 bg-muted/30 border border-border/50 rounded-lg px-3 py-2.5">
          {report.summary}
        </p>
      )}

      {hasDiffs && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onViewScript}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:opacity-90 transition-all">
            <FileCode className="w-3 h-3" />
            View sync script
          </button>
          <button onClick={onReviewDiffs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
            <ListChecks className="w-3 h-3 text-muted-foreground" />
            Revisar diferencias
          </button>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        {total} objetos comparados en {report.source_name} vs {report.target_name}
      </div>
    </div>
  );
}
