import { Trash2, Plus } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';

interface ForeignKeysTabProps {
  foreignKeys?: any[];
  isLoading: boolean;
  onAdd: () => void;
  dropForeignKeyMutation: UseMutationResult<unknown, Error, string>;
}

export function ForeignKeysTab({
  foreignKeys,
  isLoading,
  onAdd,
  dropForeignKeyMutation,
}: ForeignKeysTabProps) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-end">
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add FK
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
                <th className="pb-2 font-medium">Constraint Name</th>
                <th className="pb-2 font-medium">Column</th>
                <th className="pb-2 font-medium">Ref Table</th>
                <th className="pb-2 font-medium">Ref Column</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {foreignKeys?.map((fk, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3">
                    {fk.constraintName || fk.CONSTRAINT_NAME || fk.constraint_name || 'N/A'}
                  </td>
                  <td className="py-3">
                    {fk.columnName || fk.COLUMN_NAME || fk.column_name || 'N/A'}
                  </td>
                  <td className="py-3">
                    {fk.referencedTable || fk.REFERENCED_TABLE_NAME || fk.referenced_table_name || 'N/A'}
                  </td>
                  <td className="py-3">
                    {fk.referencedColumn || fk.REFERENCED_COLUMN_NAME || fk.referenced_column_name || 'N/A'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => dropForeignKeyMutation.mutate(fk.constraintName || fk.CONSTRAINT_NAME || fk.constraint_name)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
