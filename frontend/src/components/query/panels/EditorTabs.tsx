import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueryTab } from '@/store/useAppStore';

interface EditorTabsProps {
  tabs: QueryTab[];
  activeTabId: string | null;
  setActiveTabId: (id: string) => void;
  removeTab: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

export function EditorTabs({
  tabs,
  activeTabId,
  setActiveTabId,
  removeTab,
  onContextMenu,
}: EditorTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto min-h-[40px] border-b border-border/50">
      {tabs.map((tab) => (
        <div 
          key={tab.id}
          onClick={() => setActiveTabId(tab.id)}
          onContextMenu={(e) => onContextMenu(e, tab.id)}
          className={cn(
            "group flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-medium cursor-pointer transition-colors border-x border-t",
            activeTabId === tab.id ? "bg-card border-border text-foreground" : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <span className="truncate max-w-[120px]">{tab.name}</span>
          {tab.status === 'executing' && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          <button 
            onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }} 
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/20 rounded transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
