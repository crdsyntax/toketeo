import { useState, useEffect } from 'react';
import { X, Copy, Code } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import type { Connection } from '@/types/database';

interface ModelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  schema?: string | null;
  connection?: Connection | null;
}

const FRAMEWORKS = ['Mongoose', 'TypeORM', 'Prisma', 'Sequelize'];

export function ModelExportModal({ isOpen, onClose, tableName, schema, connection }: ModelExportModalProps) {
  const [selectedFramework, setSelectedFramework] = useState(FRAMEWORKS[0]);
  const [modelCode, setModelCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const storeConnection = useAppStore((state) => state.activeConnection);
  const activeConnection = connection ?? storeConnection;

  useEffect(() => {
    if (!isOpen || !activeConnection) return;
    let cancelled = false;
    const fetchModel = async () => {
      setIsLoading(true);
      try {
        const code = await invoke<string>('generate_model', {
          id: activeConnection.id,
          framework: selectedFramework.toLowerCase(),
          table: tableName,
          schema: schema ?? null,
        });
        if (!cancelled) setModelCode(code);
      } catch (e) {
        console.error(e);
        if (!cancelled) setModelCode(`// Error generating model:\n${e}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchModel();
    return () => { cancelled = true; };
  }, [isOpen, selectedFramework, activeConnection, tableName, schema]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <h3 className="font-bold flex items-center gap-2"><Code className="w-4 h-4" /> Export Model: {tableName}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 border-b border-border flex gap-2">
          {FRAMEWORKS.map((fw) => (
            <button
              key={fw}
              onClick={() => setSelectedFramework(fw)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                selectedFramework === fw
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {fw}
            </button>
          ))}
        </div>

        <div className="h-96 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
              <span className="text-sm font-bold animate-pulse text-primary">Generating...</span>
            </div>
          )}
          <textarea
            className="w-full h-full p-4 font-mono text-xs bg-background outline-none resize-none"
            value={modelCode}
            readOnly
          />
        </div>

        <div className="p-4 flex justify-end gap-2 border-t border-border">
          <button
            onClick={() => navigator.clipboard.writeText(modelCode)}
            className="px-4 py-2 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded flex items-center gap-2"
          >
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
