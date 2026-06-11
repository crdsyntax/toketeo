import { Plus, FileUp, Save, Layout, Play, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

interface EditorToolbarProps {
  onNew: () => void;
  onOpen: (content: string, fileName: string) => void;
  onSave: () => void;
  onExecute: () => void;
  onCancel: () => void;
  isExecuting: boolean;
  showLayoutMenu: boolean;
  setShowLayoutMenu: (show: boolean) => void;
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
        
        <button 
          onClick={onNew}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-none transition-all"
          title="Create a new query tab"
        >
          <Plus className="w-3.5 h-3.5" />
          New Script
        </button>
        
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

        <button 
          onClick={onExecute} 
          disabled={isExecuting} 
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-none text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
          title="Execute the entire script (Run All)"
        >
          {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {isExecuting ? 'Running...' : 'Run All'}
        </button>

        {isExecuting && (
          <button 
            onClick={onCancel} 
            className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-none text-xs font-bold hover:bg-destructive/20 transition-colors shadow-sm"
          >
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={() => setShowLayoutMenu(!showLayoutMenu)} 
          className={cn(
            "p-1.5 hover:bg-muted rounded-none transition-colors", 
            showLayoutMenu && "bg-muted text-primary"
          )}
          title="Toggle Panels"
        >
          <Layout className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
