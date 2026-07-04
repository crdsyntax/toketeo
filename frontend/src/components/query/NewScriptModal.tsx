import { useState, useEffect } from 'react';
import { X, Database, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { schemaService } from '@/services/schema.service';
import type { Connection } from '@/types/database';

interface NewScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: Connection[];
  onCreate: (connectionId?: string, database?: string) => void;
}

export function NewScriptModal({ isOpen, onClose, connections, onCreate }: NewScriptModalProps) {
  const [selectedConnId, setSelectedConnId] = useState('');
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedConnId('');
    setSelectedDb('');
    setDatabases([]);
  }, [isOpen]);

  useEffect(() => {
    if (!selectedConnId) {
      setDatabases([]);
      setSelectedDb('');
      return;
    }
    setLoading(true);
    setSelectedDb('');
    const conn = connections.find(c => c.id === selectedConnId);
    if (!conn) { setLoading(false); return; }

    const fetchDbs = conn.type === 'postgres'
      ? schemaService.getDatabases(selectedConnId)
      : schemaService.getSchemas(selectedConnId);

    fetchDbs.then((dbs) => {
      setDatabases(dbs);
    }).catch(() => {
      setDatabases([]);
    }).finally(() => {
      setLoading(false);
    });
  }, [selectedConnId, connections]);

  const selectedConn = connections.find(c => c.id === selectedConnId);
  const dbLabel = selectedConn?.type === 'postgres' ? 'Database' : 'Schema';

  const handleCreate = () => {
    if (selectedConnId && selectedDb) {
      onCreate(selectedConnId, selectedDb);
    } else {
      onCreate();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Database className="w-4 h-4" />
            New Script
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
              Connection
            </label>
            <select
              value={selectedConnId}
              onChange={(e) => setSelectedConnId(e.target.value)}
              className="w-full appearance-none bg-background border border-border text-foreground px-3 py-2 rounded text-xs outline-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="">None (blank script)</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedConnId && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                {dbLabel}
              </label>
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                className={cn(
                  "w-full appearance-none bg-background border border-border text-foreground px-3 py-2 rounded text-xs outline-none cursor-pointer hover:border-primary/50 transition-colors",
                  loading && "opacity-50 pointer-events-none"
                )}
              >
                <option value="">Select {dbLabel.toLowerCase()}...</option>
                {databases.map(db => (
                  <option key={db} value={db}>{db}</option>
                ))}
              </select>
              {loading && (
                <p className="text-[10px] text-muted-foreground mt-1">Loading {dbLabel.toLowerCase()}s...</p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={() => { onCreate(undefined, undefined); onClose(); }}
            className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all"
          >
            Blank Script
          </button>
          <button
            onClick={handleCreate}
            disabled={!!selectedConnId && !selectedDb}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-all disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
