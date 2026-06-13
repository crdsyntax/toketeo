import { Trash2, Layout, Table2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueryMenusProps {
  showContextMenu: { x: number, y: number, tabId: string } | null;
  removeTab: (id: string) => void;
  setShowContextMenu: (show: { x: number, y: number, tabId: string } | null) => void;
  showLayoutMenu: boolean;
  setShowLayoutMenu: (show: boolean) => void;
  panels: { editor: boolean, results: boolean };
  togglePanel: (panel: 'editor' | 'results') => void;
}

export function QueryMenus({
  showContextMenu,
  removeTab,
  setShowContextMenu,
  showLayoutMenu,
  setShowLayoutMenu,
  panels,
  togglePanel,
}: QueryMenusProps) {
  return (
    <>
      {showContextMenu && (
        <div 
          className="fixed z-[200] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[150px]" 
          style={{ top: showContextMenu.y, left: showContextMenu.x }}
        >
          <button 
            onClick={() => { removeTab(showContextMenu.tabId); setShowContextMenu(null); }} 
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Close Tab
          </button>
        </div>
      )}

      {showLayoutMenu && (
        <div className="absolute top-12 right-0 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]">
          <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1 text-left">
            Toggle Panels
          </div>
          <button 
            onClick={() => { togglePanel('editor'); setShowLayoutMenu(false); }} 
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
          >
            <div className="flex items-center gap-2"><Layout className="w-3.5 h-3.5" />SQL Editor</div>
            {panels.editor && <Check className="w-3 h-3 text-primary" />}
          </button>
          <button 
            onClick={() => { togglePanel('results'); setShowLayoutMenu(false); }} 
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
          >
            <div className="flex items-center gap-2"><Table2 className="w-3.5 h-3.5" />Results Panel</div>
            {panels.results && <Check className="w-3 h-3 text-primary" />}
          </button>
        </div>
      )}
    </>
  );
}
