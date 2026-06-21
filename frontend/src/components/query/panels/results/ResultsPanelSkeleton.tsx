import type { QueryTab } from '@/store/useAppStore';
import { ExecutionStatus } from '@/types/database';

interface ResultsPanelSkeletonProps {
  activeTab: QueryTab | null;
}

export function ResultsPanelSkeleton({ activeTab }: ResultsPanelSkeletonProps) {
  if (activeTab?.status !== ExecutionStatus.EXECUTING) return null;

  return (
    <div className="flex-1 overflow-hidden pointer-events-none animate-in fade-in duration-150">
      <table className="w-full border-collapse table-fixed text-sm">
        <thead className="bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
          <tr>
            <th className="w-12 h-10 border-r border-border/60 bg-muted"></th>
            {[1, 2, 3].map(i => (
              <th key={i} className="p-2.5 text-left border-r border-border/60 w-[250px]">
                <div className="h-4 w-32 bg-muted-foreground/10 rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {[1, 2, 3, 4, 5].map(rowIdx => (
            <tr key={rowIdx} className="bg-background/50 h-9">
              <td className="w-12 border-r border-border/60 bg-muted/10"></td>
              <td className="p-2.5 border-r border-border/40">
                <div className="h-3 w-40 bg-muted rounded animate-pulse" style={{ animationDelay: `${rowIdx * 75}ms` }} />
              </td>
              <td className="p-2.5 border-r border-border/40">
                <div className="h-3 w-24 bg-muted rounded animate-pulse hidden md:block" style={{ animationDelay: `${rowIdx * 100}ms` }} />
              </td>
              <td className="p-2.5 border-r border-border/40">
                <div className="h-3 w-52 bg-muted rounded animate-pulse hidden lg:block" style={{ animationDelay: `${rowIdx * 125}ms` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
