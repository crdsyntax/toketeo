import {
  Plus,
  FileUp,
  Save,
  Layout,
  Play,
  Loader2,
  Square,
  Clock,
  CheckCircle2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRef } from 'react';
import type { Connection } from '@/types/database';

interface EditorToolbarProps {
  onNew: () => void;
  onOpen: (content: string, fileName: string) => void;
  onSave: () => void;
  onExecute: () => void;
  onCancel: () => void;
  isExecuting: boolean;
  showLayoutMenu: boolean;
  setShowLayoutMenu: (show: boolean) => void;
  connections: Connection[];
  currentConnectionId?: string;
  onConnectionChange: (connectionId: string) => void;
  onHistoryToggle: () => void;
  showHistory: boolean;
  historyCount: number;
  onCommit: () => void;
  onRollback: () => void;
  isTransactional: boolean;
  onNewWithConnection: () => void;
}

export function EditorToolbar({
  onNew,
  onOpen,
  onSave,
  onExecute,
  onCancel,
  isExecuting,
  showLayoutMenu,
  setShowLayoutMenu,
  connections,
  currentConnectionId,
  onConnectionChange,
  onHistoryToggle,
  showHistory,
  historyCount,
  onCommit,
  onRollback,
  isTransactional,
  onNewWithConnection,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        onOpen(content, file.name);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10 h-12 shrink-0">
      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".sql,.json,.txt,.csv"
        />

        <div className="flex items-center">
          <button
            onClick={() => onNew()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-l-md transition-all"
            title="Create a new query tab"
          >
            <Plus className="w-3.5 h-3.5" />
            New Script
          </button>
          <button
            onClick={() => onNewWithConnection()}
            className="flex items-center px-1 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-r-md transition-all border-l border-border"
            title="New Script with connection and database"
          >
            <span className="text-[10px] leading-none">▼</span>
          </button>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-none transition-all"
          title="Open a local SQL or text file"
        >
          <FileUp className="w-3.5 h-3.5" />
          Open Script
        </button>

        <button
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-none transition-all"
          title="Save the current script as a file"
        >
          <Save className="w-3.5 h-3.5" />
          Save Script
        </button>

        <div className="w-[1px] h-4 bg-border mx-2" />

        <select
          value={currentConnectionId || ''}
          onChange={(e) => onConnectionChange(e.target.value)}
          className="appearance-none bg-background border border-border text-foreground px-3 py-1 rounded text-xs font-bold mr-2 outline-none cursor-pointer hover:border-primary/50 transition-colors"
          title="Connection for this query tab"
        >
          {connections.map(c => <option key={c.id} value={c.id}>{c.database ? `${c.name} / ${c.database}` : c.name}</option>)}
        </select>

        {connections.find(c => c.id === currentConnectionId)?.readOnly && (
          <span className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold tracking-widest uppercase rounded mr-2 flex items-center select-none">
            Read-Only
          </span>
        )}

        <button
          onClick={() => onExecute()}
          disabled={isExecuting}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-none text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
          title="Execute the entire script (Run All)"
        >
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          {isExecuting ? 'Running...' : 'Run All'}
        </button>

        {isTransactional && (
          <>
            <div className="w-[1px] h-4 bg-border mx-2" />
            <button
              onClick={onCommit}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-none transition-all disabled:opacity-50"
              title="Commit Transaction"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Commit
            </button>
            <button
              onClick={onRollback}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-none transition-all disabled:opacity-50"
              title="Rollback Transaction"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Rollback
            </button>
          </>
        )}

        {isExecuting && (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-none text-xs font-bold hover:bg-destructive/20 transition-colors shadow-sm"
          >
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 p-0.5 bg-muted/30 rounded-lg border border-border/50">
        <button
          onClick={onHistoryToggle}
          className={cn(
            'relative p-1.5 rounded-md transition-all duration-200',
            showHistory
              ? 'bg-amber-500/15 text-amber-500 dark:bg-amber-500/20 shadow-sm'
              : 'text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500',
          )}
          title="Query History"
        >
          <Clock className="w-4 h-4" />
          {historyCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
              {historyCount > 99 ? '99+' : historyCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowLayoutMenu(!showLayoutMenu)}
          className={cn(
            'p-1.5 rounded-md transition-all duration-200',
            showLayoutMenu
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20 shadow-sm'
              : 'text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500',
          )}
          title="Toggle Panels"
        >
          <Layout className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
