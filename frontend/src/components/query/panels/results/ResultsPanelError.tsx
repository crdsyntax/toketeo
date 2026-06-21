import { AlertCircle, X } from 'lucide-react';
import type { QueryTab } from '@/store/useAppStore';
import { ExecutionStatus } from '@/types/database';

interface ResultsPanelErrorProps {
  activeTab: QueryTab | null;
  updateTabResults: (tabId: string, updates: Partial<QueryTab>) => void;
}

export function ResultsPanelError({ activeTab, updateTabResults }: ResultsPanelErrorProps) {
  if (activeTab?.status !== ExecutionStatus.ERROR) return null;

  return (
    <div className="absolute top-0 left-0 right-0 p-3 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-start gap-2.5 m-3 rounded-lg z-30 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-md">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="text-xs font-semibold leading-none">Query Execution Failed</p>
        <p className="text-xs font-mono opacity-90 break-all">{activeTab.error}</p>
      </div>
      <button
        onClick={() => updateTabResults(activeTab.id, { status: ExecutionStatus.IDLE, error: null })}
        className="p-1 hover:bg-destructive/20 rounded-md text-destructive/80 hover:text-destructive transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
