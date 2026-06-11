import { Trash2, Plus } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ConstraintResponse } from '@/types/database';

interface ConstraintsTabProps {
  constraints?: ConstraintResponse[];
  isLoading: boolean;
  onAdd: () => void;
  dropConstraintMutation: UseMutationResult<unknown, Error, string>;
}

export function ConstraintsTab({
  constraints,
  isLoading,
  onAdd,
  dropConstraintMutation,
}: ConstraintsTabProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-end">
        <button 
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Constraint
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
          <table className="w-full text-left text-sm border-collapse min-w-[400px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 px-2 font-medium">Constraint Name</th>
                <th className="pb-2 px-2 font-medium">Type</th>
                <th className="pb-2 px-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {constraints?.map((con, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2 truncate max-w-[200px]" title={con.name || con.CONSTRAINT_NAME || con.constraint_name}>
                    {con.name || con.CONSTRAINT_NAME || con.constraint_name || 'N/A'}
                  </td>
                  <td className="py-3 px-2 truncate max-w-[150px]" title={con.type || con.CONSTRAINT_TYPE || con.constraint_type}>
                    {con.type || con.CONSTRAINT_TYPE || con.constraint_type || 'N/A'}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <button
                      onClick={() => dropConstraintMutation.mutate((con.name || con.CONSTRAINT_NAME || con.constraint_name) as string)}
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
