import { useState } from 'react';
import { Trash2, Plus, Check, X, Key, Info } from 'lucide-react';
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

const COMMON_TYPES = [
  'VARCHAR(255)',
  'TEXT',
  'INT',
  'BIGINT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'DECIMAL(10,2)',
  'JSON',
];

export function ColumnsTab({
  tableName,
  columns,
  isLoading,
  onAdd,
  editColumnMutation,
  dropColumnMutation,
}: ColumnsTabProps) {
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editedColData, setEditedColData] = useState<ColumnResponse | null>(null);

  const startEdit = (col: ColumnResponse) => {
    setEditingColumn(col.name);
    setEditedColData({ ...col });
  };

  const cancelEdit = () => {
    setEditingColumn(null);
    setEditedColData(null);
  };

  const saveEdit = (oldName: string) => {
    if (!editedColData) return;
    const nullable = editedColData.isNullable ? 'NULL' : 'NOT NULL';
    const defaultValue = editedColData.defaultValue ? `DEFAULT '${editedColData.defaultValue}'` : '';
    const comment = editedColData.comment ? `COMMENT '${editedColData.comment}'` : '';
    const pk = editedColData.isPrimaryKey ? 'PRIMARY KEY' : '';
    const sql = `ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${oldName}\` \`${editedColData.name}\` ${editedColData.type} ${nullable} ${defaultValue} ${pk} ${comment};`;
    editColumnMutation.mutate(sql, { onSuccess: () => cancelEdit() });
  };

  const handleDelete = (colName: string) => {
    if (confirm(`Are you sure you want to drop column "${colName}"?`)) {
      dropColumnMutation.mutate(colName);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <div className="px-4 py-2 border-b border-border bg-muted flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Edit mode generates ALTER TABLE SQL statements
          </span>
        </div>
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:opacity-90 px-3 py-1 rounded-md transition-all active:scale-95"
        >
          <Plus className="w-3 h-3" />
          Add Column
        </button>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground uppercase tracking-widest text-[10px]">
              <th className="pb-3 px-2 font-bold w-[20%]">Name</th>
              <th className="pb-3 px-2 font-bold w-[15%]">Type</th>
              <th className="pb-3 px-2 font-bold w-[10%] text-center">PK</th>
              <th className="pb-3 px-2 font-bold w-[10%] text-center">Nullable</th>
              <th className="pb-3 px-2 font-bold w-[15%]">Default</th>
              <th className="pb-3 px-2 font-bold w-[20%]">Comment</th>
              <th className="pb-3 px-2 font-bold w-[10%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {columns?.map((col) => {
              const isEditing = editingColumn === col.name;
              return (
                <tr key={col.name} className={cn("group hover:bg-muted transition-colors", isEditing && "bg-primary")}>
                  <td className="py-2 px-2">
                    {isEditing ? (
                      <input
                        className="w-full bg-background border border-border px-2 py-1 outline-none focus:ring-1 focus:ring-primary rounded-md"
                        value={editedColData?.name || ''}
                        autoFocus
                        onChange={(e) => setEditedColData(prev => prev ? { ...prev, name: e.target.value } : null)}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        {col.isPrimaryKey && <Key className="w-3 h-3 text-yellow-500 shrink-0" />}
                        <span className="font-bold text-foreground truncate">{col.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {isEditing ? (
                      <select
                        className="w-full bg-background border border-border px-1 py-1 outline-none focus:ring-1 focus:ring-primary rounded-md font-mono text-[10px]"
                        value={editedColData?.type.toUpperCase() || ''}
                        onChange={(e) => setEditedColData(prev => prev ? { ...prev, type: e.target.value } : null)}
                      >
                        {editedColData?.type && !COMMON_TYPES.includes(editedColData.type.toUpperCase()) && (
                           <option value={editedColData.type}>{editedColData.type}</option>
                        )}
                        {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-tighter truncate block max-w-[120px]">
                        {col.type}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input 
                      type="checkbox"
                      disabled={!isEditing}
                      checked={isEditing ? !!editedColData?.isPrimaryKey : !!col.isPrimaryKey}
                      className="rounded border-border text-primary focus:ring-primary"
                      onChange={(e) => setEditedColData(prev => prev ? { ...prev, isPrimaryKey: e.target.checked } : null)}
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                     <input 
                      type="checkbox"
                      disabled={!isEditing}
                      checked={isEditing ? !!editedColData?.isNullable : !!col.isNullable}
                      className="rounded border-border text-primary focus:ring-primary"
                      onChange={(e) => setEditedColData(prev => prev ? { ...prev, isNullable: e.target.checked } : null)}
                    />
                  </td>
                  <td className="py-2 px-2">
                    {isEditing ? (
                      <input
                        className="w-full bg-background border border-border px-2 py-1 outline-none focus:ring-1 focus:ring-primary rounded-md text-[10px]"
                        value={editedColData?.defaultValue || ''}
                        placeholder="NULL"
                        onChange={(e) => setEditedColData(prev => prev ? { ...prev, defaultValue: e.target.value } : null)}
                      />
                    ) : (
                      <span className="text-muted-foreground truncate block max-w-[100px] text-[10px]">
                        {col.defaultValue || 'NULL'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {isEditing ? (
                      <input
                        className="w-full bg-background border border-border px-2 py-1 outline-none focus:ring-1 focus:ring-primary rounded-md text-[10px]"
                        value={editedColData?.comment || ''}
                        placeholder="Column description..."
                        onChange={(e) => setEditedColData(prev => prev ? { ...prev, comment: e.target.value } : null)}
                      />
                    ) : (
                      <span className="text-muted-foreground truncate block max-w-[150px] text-[10px] italic">
                        {col.comment || '-'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(col.name)} className="p-1.5 bg-primary text-primary-foreground rounded-md transition-colors">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 bg-destructive text-destructive-foreground rounded-md transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(col)} className="p-1.5 text-muted-foreground hover:text-primary transition-all opacity-0 group-hover:opacity-100">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(col.name)} className="p-1.5 text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
