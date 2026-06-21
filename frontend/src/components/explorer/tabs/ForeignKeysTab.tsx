import { Trash2, Plus, Edit2, Check, X, Copy } from 'lucide-react';
import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ForeignKeyResponse } from '@/types/database';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { toast } from 'react-hot-toast';

interface ForeignKeysTabProps {
  foreignKeys?: ForeignKeyResponse[];
  isLoading: boolean;
  onAdd: () => void;
  dropForeignKeyMutation: UseMutationResult<unknown, Error, string>;
  renameForeignKeyMutation?: UseMutationResult<unknown, Error, { oldName: string; newName: string }>;
}

export function ForeignKeysTab({
  foreignKeys,
  isLoading,
  onAdd,
  dropForeignKeyMutation,
  renameForeignKeyMutation,
}: ForeignKeysTabProps) {
  const [editingFk, setEditingFk] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fkName: string } | null>(null);

  const handleStartEdit = (name: string) => {
    setEditingFk(name);
    setNewName(name);
  };

  const handleSaveEdit = (oldName: string) => {
    if (newName && newName !== oldName && renameForeignKeyMutation) {
      const loadingToast = toast.loading('Renaming foreign key...');
      renameForeignKeyMutation.mutate({ oldName, newName }, {
        onSuccess: () => {
          setEditingFk(null);
          toast.success('Foreign key renamed successfully', { id: loadingToast });
        },
        onError: (err: Error) => {
          toast.error(`Failed to rename foreign key: ${err.message || 'Unknown error'}`, { id: loadingToast });
        }
      });
    } else {
      setEditingFk(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-end">
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add FK
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 px-2 font-medium">Constraint Name</th>
                <th className="pb-2 px-2 font-medium">Column</th>
                <th className="pb-2 px-2 font-medium">Ref Table</th>
                <th className="pb-2 px-2 font-medium">Ref Column</th>
                <th className="pb-2 px-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {foreignKeys?.map((fk, i) => {
                const name = (fk.constraintName || fk.CONSTRAINT_NAME || fk.constraint_name || 'N/A') as string;
                const column = fk.columnName || fk.COLUMN_NAME || fk.column_name || 'N/A';
                const refTable = fk.referencedTable || fk.REFERENCED_TABLE_NAME || fk.referenced_table_name || 'N/A';
                const refColumn = fk.referencedColumn || fk.REFERENCED_COLUMN_NAME || fk.referenced_column_name || 'N/A';

                return (
                  <tr 
                    key={i} 
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.pageX, y: e.pageY, fkName: name });
                    }}
                  >
                    <td className="py-3 px-2">
                      {editingFk === name ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="bg-background border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[200px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(name);
                              if (e.key === 'Escape') setEditingFk(null);
                            }}
                          />
                          <button onClick={() => handleSaveEdit(name)} className="text-primary hover:text-primary/80">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingFk(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span className="truncate max-w-[150px]" title={name}>{name}</span>
                          {renameForeignKeyMutation && (
                            <button 
                              onClick={() => handleStartEdit(name)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 truncate max-w-[120px]" title={column as string}>{column as React.ReactNode}</td>
                    <td className="py-3 px-2 truncate max-w-[120px]" title={refTable as string}>{refTable as React.ReactNode}</td>
                    <td className="py-3 px-2 truncate max-w-[120px]" title={refColumn as string}>{refColumn as React.ReactNode}</td>
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => dropForeignKeyMutation.mutate(name)}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDismiss={() => setContextMenu(null)}
          groups={[
            {
              title: 'Foreign Key Actions',
              items: [
                ...(renameForeignKeyMutation ? [{
                  label: 'Rename FK',
                  icon: <Edit2 className="w-3.5 h-3.5" />,
                  onClick: () => handleStartEdit(contextMenu.fkName)
                }] : []),
                {
                  label: 'Copy Name',
                  icon: <Copy className="w-3.5 h-3.5" />,
                  onClick: () => navigator.clipboard.writeText(contextMenu.fkName)
                },
                {
                  label: 'Drop FK',
                  icon: <Trash2 className="w-3.5 h-3.5" />,
                  variant: 'destructive',
                  onClick: () => dropForeignKeyMutation.mutate(contextMenu.fkName)
                }
              ]
            }
          ]}
        />
      )}
    </div>
  );
}
