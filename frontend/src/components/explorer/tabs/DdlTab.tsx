import { Loader2, Save } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import type { UseMutationResult } from '@tanstack/react-query';

interface DdlTabProps {
  isLoading: boolean;
  editableDdl: string;
  setEditableDdl: (ddl: string) => void;
  updateDdlMutation: UseMutationResult<unknown, Error, string>;
}

export function DdlTab({
  isLoading,
  editableDdl,
  setEditableDdl,
  updateDdlMutation,
}: DdlTabProps) {
  return (
    <div className="flex-1 flex flex-col bg-muted/30 relative">
      <div className="p-2 border-b border-border bg-background/50 flex justify-between items-center px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Definition Editor
        </span>
        <button
          onClick={() => updateDdlMutation.mutate(editableDdl)}
          disabled={updateDdlMutation.isPending}
          className="flex items-center gap-2 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-[10px] font-bold hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {updateDdlMutation.isPending ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Save className="w-2.5 h-2.5" />
          )}
          {updateDdlMutation.isPending ? 'Saving...' : 'Apply Changes'}
        </button>
      </div>
      <div className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-4 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={editableDdl}
            onChange={(val) => setEditableDdl(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16 },
            }}
          />
        )}
      </div>
    </div>
  );
}
