import { useState, useMemo } from 'react';
import { Copy, Check, Download, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncScript, ScriptOptions } from '@/types/compare';

interface ScriptPreviewProps {
  script: SyncScript;
  options: ScriptOptions;
  onToggleStatement: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
  onOptionsChange: (options: Partial<ScriptOptions>) => void;
  sourceName?: string;
  targetName?: string;
}

export function ScriptPreview({
  script,
  options,
  onToggleStatement,
  onToggleAll,
  onOptionsChange,
  sourceName,
  targetName,
}: ScriptPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const selectedCount = script.statements.filter((s) => s.selected).length;

  const scriptHeader = useMemo(() => {
    const lines: string[] = [];
    lines.push(`-- ============================================================`);
    lines.push(`-- Sync Script — Target: ${script.target_db_type.toUpperCase()}`);
    if (targetName) lines.push(`-- Target Database: ${targetName}`);
    if (sourceName) lines.push(`-- Source: ${sourceName}`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(`-- Statements: ${script.statements.length} (${selectedCount} selected)`);
    lines.push(`-- ============================================================`);
    lines.push('');
    if (targetName) lines.push(`USE \`${targetName}\`;`);
    lines.push('');
    return lines.join('\n');
  }, [script.target_db_type, sourceName, targetName, script.statements.length, selectedCount]);

  const selectedSql = useMemo(() => {
    const body = script.statements
      .filter((s) => s.selected)
      .map((s) => s.sql)
      .join('\n\n');
    return scriptHeader + body;
  }, [script.statements, scriptHeader]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = selectedSql;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([selectedSql], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync_${script.target_db_type}_${Date.now()}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const optionToggles: { key: keyof ScriptOptions; label: string }[] = [
    { key: 'include_creates', label: 'CREATE statements' },
    { key: 'include_alters', label: 'ALTER statements' },
    { key: 'include_drops', label: 'DROP statements' },
    { key: 'include_indexes', label: 'Indexes' },
    { key: 'include_constraints', label: 'Constraints & FKs' },
    { key: 'include_views', label: 'Views' },
    { key: 'include_routines', label: 'Routines & Triggers' },
    { key: 'wrap_in_transaction', label: 'Wrap in transaction' },
  ];

  return (
    <div className="space-y-4">
      {/* Script Options */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left text-sm font-medium"
        >
          {showOptions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Script Options
        </button>
        {showOptions && (
          <div className="p-4 grid grid-cols-2 gap-2">
            {optionToggles.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={options[key] as boolean}
                  onChange={(e) => onOptionsChange({ [key]: e.target.checked })}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedCount === script.statements.length}
            onChange={(e) => onToggleAll(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-muted-foreground">
            {selectedCount} / {script.statements.length} selected
          </span>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowSql(!showSql)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title={showSql ? 'Hide SQL' : 'Show SQL'}
          >
            {showSql ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-xs font-medium"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy SQL'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Statement List */}
      {showSql && (
        <div className="space-y-2 max-h-96 overflow-y-auto border border-border rounded-lg p-2">
          {script.statements.map((stmt) => (
            <div key={stmt.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 rounded transition-colors">
              <input
                type="checkbox"
                checked={stmt.selected}
                onChange={() => onToggleStatement(stmt.id)}
                className="mt-0.5 rounded border-border shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium mb-0.5">{stmt.description}</p>
                <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
                  {stmt.sql}
                </pre>
              </div>
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5',
                stmt.diff_type.startsWith('drop') ? 'text-red-600 bg-red-50 dark:bg-red-950/30' :
                stmt.diff_type.startsWith('create') ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' :
                'text-blue-600 bg-blue-50 dark:bg-blue-950/30'
              )}>
                {stmt.diff_type}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Raw SQL Preview */}
      {showSql && selectedSql && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground border-b border-border">
            Generated SQL ({selectedCount} statements)
          </div>
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 bg-background">
            {selectedSql}
          </pre>
        </div>
      )}
    </div>
  );
}
