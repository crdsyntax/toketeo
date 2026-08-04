import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { DbRow } from '@/types/database';
import { cn } from '@/lib/utils';
import { formatCellValue } from '@/lib/formatCellValue';

interface DataListViewProps {
  rows: DbRow[];
  indexOffset: number;
  fontFamily: string;
  fontSize: number;
}

type JsonNode = unknown;

function isExpandable(value: JsonNode): boolean {
  return value !== null && typeof value === 'object';
}

function isEmptyContainer(value: JsonNode): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function PrimitiveValue({ value }: { value: JsonNode }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-emerald-500">{value}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-sky-500">{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-orange-500">{String(value)}</span>;
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function FieldRow({
  name,
  value,
  depth,
  defaultOpen = false,
}: {
  name: string;
  value: JsonNode;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = isExpandable(value);
  const isArray = Array.isArray(value);
  const entries = expandable
    ? Object.entries(value as Record<string, unknown>)
    : [];

  if (expandable) {
    const label = isEmptyContainer(value)
      ? isArray
        ? '[]'
        : '{}'
      : open
        ? isArray
          ? '['
          : '{'
        : isArray
          ? `[${entries.length}]`
          : `{${entries.length}}`;
    return (
      <>
        <div
          className="flex items-center gap-2 px-2 py-[3px] rounded-sm hover:bg-muted/40 cursor-pointer select-none"
          style={{ paddingLeft: depth > 0 ? 6 + depth * 14 : 8 }}
          onClick={() => setOpen((prev) => !prev)}
        >
          <ChevronRight
            className={cn(
              'w-3 h-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="text-muted-foreground font-mono text-xs shrink-0">
            {name}
          </span>
          <span className="text-sky-500 font-mono text-xs truncate">{label}</span>
        </div>
        {open && (
          <div className="border-l border-border/30 ml-[15px] pl-2">
            {entries.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-2 py-1" style={{ paddingLeft: 6 + depth * 14 }}>
                empty
              </div>
            ) : (
              entries.map(([k, v], i) => (
                <FieldRow
                  key={`${isArray ? i : k}`}
                  name={isArray ? `[${i}]` : k}
                  value={v}
                  depth={depth + 1}
                />
              ))
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-[3px] rounded-sm hover:bg-muted/40"
      style={{ paddingLeft: depth > 0 ? 6 + depth * 14 : 8 }}
    >
      <span className="w-3 h-3 shrink-0" />
      <span className="text-muted-foreground font-mono text-xs shrink-0 min-w-0">
        {name}
      </span>
      <div className="text-muted-foreground font-mono text-xs shrink-0 select-none">
        :
      </div>
      <PrimitiveValue value={value} />
    </div>
  );
}

function DocumentCard({
  row,
  index,
  fontFamily,
  fontSize,
}: {
  row: DbRow;
  index: number;
  fontFamily: string;
  fontSize: number;
}) {
  const [open, setOpen] = useState(true);
  const idValue = row['_id'];
  const idLabel =
    idValue === null || idValue === undefined ? null : formatCellValue(idValue);
  const entries = Object.entries(row);

  return (
    <div className="border border-border rounded-md bg-muted/20 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30 cursor-pointer select-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          #{index}
        </span>
        {idLabel && (
          <span className="font-mono text-xs text-primary truncate">{idLabel}</span>
        )}
      </div>
      {open && (
        <div
          className="py-1"
          style={{ fontFamily, fontSize: fontSize * 0.92 }}
        >
          {entries.map(([k, v]) => (
            <FieldRow key={k} name={k} value={v} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DataListView({ rows, indexOffset, fontFamily, fontSize }: DataListViewProps) {
  return (
    <div className="p-4 space-y-3">
      {rows.map((row, i) => (
        <DocumentCard
          key={i}
          row={row}
          index={indexOffset + i}
          fontFamily={fontFamily}
          fontSize={fontSize}
        />
      ))}
    </div>
  );
}
