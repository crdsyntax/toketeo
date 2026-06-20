import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Search } from 'lucide-react';
import type { MongoFilterState } from '@/store/useAppStore';

interface MongoFilterBarProps {
  filter: MongoFilterState;
  onChange: (filter: Partial<MongoFilterState>) => void;
  onExecute: () => void;
}

interface FieldDef {
  key: keyof MongoFilterState;
  label: string;
  placeholder: string;
}

const FIELDS: FieldDef[] = [
  { key: 'find',      label: 'Filter',    placeholder: '{ "status": "active", "age": { "$gt": 21 } }' },
  { key: 'project',   label: 'Project',   placeholder: '{ "name": 1, "email": 1, "_id": 0 }' },
  { key: 'sort',      label: 'Sort',      placeholder: '{ "createdAt": -1, "name": 1 }' },
  { key: 'collation', label: 'Collation', placeholder: '{ "locale": "en", "strength": 2 }' },
  { key: 'hint',      label: 'Hint',      placeholder: '{ "email_1": 1 } or "email_1"' },
];

export function MongoFilterBar({ filter, onChange, onExecute }: MongoFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <div className="border-b border-border bg-muted/5 shrink-0">
      {/* Header row: always visible */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Filter className="w-3 h-3 text-primary/60 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
          Mongo Filter
        </span>

        {/* Main filter (find) always visible */}
        <input
          className="flex-1 max-w-md bg-background border border-border/70 px-2.5 py-1 rounded text-xs outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-muted-foreground/50 font-mono"
          placeholder='Filter: { "field": "value" }'
          value={filter.find}
          onChange={(e) => onChange({ find: e.target.value })}
          onKeyDown={handleKeyDown}
        />

        {/* Run button */}
        <button
          onClick={onExecute}
          className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground rounded text-[10px] font-bold hover:opacity-90 transition-all"
        >
          <Search className="w-3 h-3" />
          Find
        </button>

        {/* Toggle advanced */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-muted/60 transition-colors"
        >
          Options
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </button>
      </div>

      {/* Advanced panel */}
      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {FIELDS.slice(1).map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
                {label}
              </span>
              <input
                className="bg-background border border-border/60 px-2.5 py-1 rounded text-[11px] font-mono outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-muted-foreground/40"
                placeholder={placeholder}
                value={filter[key]}
                onChange={(e) => onChange({ [key]: e.target.value })}
                onKeyDown={handleKeyDown}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
