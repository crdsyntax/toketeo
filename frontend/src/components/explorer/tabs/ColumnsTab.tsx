import { useState } from 'react';
import { List, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnResponse } from '@/types/database';
import type { UseMutationResult } from '@tanstack/react-query';

interface ColumnsTabProps {
  tableName: string;
  columns?: ColumnResponse[];
  isLoading: boolean;
  onAdd: () => void;
  editColumnMutation: UseMutationResult<unknown, Error, string>;
  dropColumnMutation: UseMutationResult<unknown, Error, string>;
}

export function ColumnsTab({
  tableName,
  columns,
  isLoading,
  onAdd,
  editColumnMutation,
  dropColumnMutation,
}: ColumnsTabProps) {
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editedColData, setEditedColData] = useState<{
    name: string;
    type: string;
  } | null>(null);

  const startEdit = (col: ColumnResponse) => {
    setEditingColumn(col.name);
    setEditedColData({ name: col.name, type: col.type });
  };

  const saveEdit = (oldName: string) => {
    if (!editedColData) return;
    const sql = `ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${oldName}\` \`${editedColData.name}\` ${editedColData.type};`;
    editColumnMutation.mutate(sql, {
      onSuccess: () => setEditingColumn(null),
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-end">
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Column
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
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Nullable</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {columns?.map((col) => (
                <tr
                  key={col.name}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 font-medium text-foreground">
                    {editingColumn === col.name ? (
                      <input
                        className="bg-muted px-1 outline-none focus:ring-1 focus:ring-primary/50 rounded"
                        value={editedColData?.name}
                        onChange={(e) =>
                          setEditedColData((prev) =>
                            prev ? { ...prev, name: e.target.value } : null,
                          )
                        }
                      />
                    ) : (
                      col.name
                    )}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground uppercase tracking-tighter">
                    {editingColumn === col.name ? (
                      <input
                        className="bg-muted px-1 outline-none focus:ring-1 focus:ring-primary/50 rounded"
                        value={editedColData?.type}
                        onChange={(e) =>
                          setEditedColData((prev) =>
                            prev ? { ...prev, type: e.target.value } : null,
                          )
                        }
                      />
                    ) : (
                      col.type
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        col.isNullable
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {col.isNullable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingColumn === col.name ? (
                        <button
                          onClick={() => saveEdit(col.name)}
                          className="text-primary font-bold text-xs hover:underline"
                        >
                          Save
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(col)}
                            className="text-muted-foreground hover:text-primary text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => dropColumnMutation.mutate(col.name)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
