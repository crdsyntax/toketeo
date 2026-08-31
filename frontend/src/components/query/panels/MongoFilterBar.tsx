import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { MongoFilterState } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

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
    <div className="border-b border-border bg-background/80 backdrop-blur shrink-0">

      <div className="flex items-center gap-2 px-3 h-9">
        <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-emerald-400/80 shrink-0">
          Filter
        </span>


        <input
          className="flex-1 max-w-sm bg-background border border-border/70 px-2.5 py-1 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-muted-foreground/40 font-mono"
          placeholder='{ "field": "value" }'
          value={filter.find}
          onChange={(e) => onChange({ find: e.target.value })}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={onExecute}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded text-[var(--ch-text-9)] font-semibold hover:bg-emerald-500 transition-all shrink-0"
        >
          <Search className="w-3 h-3" />
          Find
        </button>


        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors shrink-0',
            expanded
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >
          Options
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </button>
      </div>


      {expanded && (
        <div className="px-3 pb-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
          {FIELDS.slice(1).map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-[var(--ch-text-9)] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {label}
              </span>
              <input
                className="bg-background border border-border/60 px-2.5 py-1 rounded text-[var(--ch-text-11)] font-mono outline-none focus:ring-1 focus:ring-emerald-500/40 placeholder:text-muted-foreground/30"
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
