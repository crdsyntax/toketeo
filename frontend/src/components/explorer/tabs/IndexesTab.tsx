import { Trash2, Plus, Edit2, Check, X } from 'lucide-react';
import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { IndexResponse } from '@/types/database';

interface IndexesTabProps {
  indexes?: IndexResponse[];
  isLoading: boolean;
  onAdd: () => void;
  dropIndexMutation: UseMutationResult<unknown, Error, string>;
  renameIndexMutation: UseMutationResult<unknown, Error, { oldName: string; newName: string }>;
}

export function IndexesTab({
  indexes,
  isLoading,
  onAdd,
  dropIndexMutation,
  renameIndexMutation,
}: IndexesTabProps) {
  const [editingIndex, setEditingIndex] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleStartEdit = (name: string) => {
    setEditingIndex(name);
    setNewName(name);
  };

  const handleSaveEdit = (oldName: string) => {
    if (newName && newName !== oldName) {
      renameIndexMutation.mutate({ oldName, newName }, {
        onSuccess: () => setEditingIndex(null)
      });
    } else {
      setEditingIndex(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-end">
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Index
        </button>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 font-medium">Index Name</th>
                <th className="pb-2 font-medium">Source Column</th>
                <th className="pb-2 font-medium">Dest Column</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Unique</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {indexes?.map((idx, i) => {
                const name = idx.name || idx.INDEX_NAME || idx.index_name || 'N/A';
                const column = idx.column || idx.COLUMN_NAME || idx.column_name || 'N/A';
                const destColumn = idx.targetColumn || column;
                const type = idx.type || idx.INDEX_TYPE || idx.index_type || 'N/A';
                const isUnique = idx.isUnique || idx.NON_UNIQUE === 0 || idx.non_unique === 0;

                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3">
                      {editingIndex === name ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="bg-background border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[200px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(name);
                              if (e.key === 'Escape') setEditingIndex(null);
                            }}
                          />
                          <button onClick={() => handleSaveEdit(name)} className="text-primary hover:text-primary/80">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingIndex(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span>{name}</span>
                          <button 
                            onClick={() => handleStartEdit(name)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3">{column}</td>
                    <td className="py-3 text-muted-foreground italic">{destColumn}</td>
                    <td className="py-3 text-xs uppercase tracking-tight">{type}</td>
                    <td className="py-3">
                      {isUnique ? (
                        <span className="text-primary font-medium">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => dropIndexMutation.mutate(name)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
