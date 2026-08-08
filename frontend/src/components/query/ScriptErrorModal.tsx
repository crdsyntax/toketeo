import { AlertTriangle, X } from 'lucide-react';

export interface ScriptErrorPrompt {
  runId: string;
  index: number;
  sql: string;
  error: string;
}

interface ScriptErrorModalProps {
  prompt: ScriptErrorPrompt | null;
  responding: boolean;
  onSkip: () => void;
  onSkipAll: () => void;
  onCancel: () => void;
}

/**
 * Modal mostrado cuando un statement de un script multi-statement falla.
 * "Skip" continúa con el siguiente statement; "Skip all" corre el resto sin
 * volver a preguntar; "Cancel" revierte toda la transacción (rollback).
 */
export function ScriptErrorModal({ prompt, responding, onSkip, onSkipAll, onCancel }: ScriptErrorModalProps) {
  if (!prompt) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-red-500/10">
          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Statement failed
          </h3>
          <button onClick={onCancel} disabled={responding} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Statement {prompt.index + 1} of the script failed. Choose how to continue:
          </p>
          <pre className="bg-muted/40 border border-border rounded-md p-3 font-mono text-xs max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {prompt.sql}
          </pre>
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
            <p className="text-xs font-bold text-red-500 mb-1">Error</p>
            <p className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all">{prompt.error}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={responding}
              className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/80 rounded"
              title="Rollback all statements applied so far"
            >
              Cancel (Rollback)
            </button>
            <button
              onClick={onSkip}
              disabled={responding}
              className="px-4 py-2 text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded"
            >
              Skip this
            </button>
            <button
              onClick={onSkipAll}
              disabled={responding}
              className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded"
              title="Continue to the end; no more prompts"
            >
              Skip all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}