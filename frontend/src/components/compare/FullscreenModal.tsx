import { useState } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';

interface FullscreenModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function FullscreenModal({ open, title, children, onClose }: FullscreenModalProps) {
  const [minimized, setMinimized] = useState(false);

  if (!open) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/90 text-sm font-medium transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
          {title}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        <span className="text-sm font-semibold flex-1">{title}</span>
        <button
          onClick={() => setMinimized(true)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Minimizar"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto min-h-0 p-4">
        {children}
      </div>
    </div>
  );
}

interface CompareExpandButtonProps {
  onClick: () => void;
  label: string;
}

export function CompareExpandButton({ onClick, label }: CompareExpandButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors ml-auto"
      title={label}
    >
      <Maximize2 className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
