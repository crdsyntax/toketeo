import React, { useState } from 'react';
import { Copy, X } from 'lucide-react';

interface SqlGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSql: string;
}

export function SqlGeneratorModal({ isOpen, onClose, initialSql }: SqlGeneratorModalProps) {
  const [sql, setSql] = useState(initialSql);
  const [prevInitialSql, setPrevInitialSql] = useState(initialSql);

  if (initialSql !== prevInitialSql) {
    setSql(initialSql);
    setPrevInitialSql(initialSql);
  }

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <h3 className="font-bold">SQL Generator</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="h-64 border-b border-border">
          <textarea
            className="w-full h-full p-4 font-mono text-xs bg-background outline-none resize-none"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
          />
        </div>
        <div className="p-4 flex justify-end gap-2">
          <button onClick={handleCopy} className="px-4 py-2 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Copy
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
