import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import type { DbRow } from '@/types/database';

interface ResultsPanelJsonViewProps {
  sortedRows: DbRow[];
}

export function ResultsPanelJsonView({ sortedRows }: ResultsPanelJsonViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Dynamic height estimation
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full w-full overflow-auto bg-background p-4">
      <div className="font-mono text-sm font-bold text-foreground/70 mb-2">{"["}</div>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const isLast = virtualRow.index === sortedRows.length - 1;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pl-6 pb-2"
            >
              <div className="relative">
                <JsonView
                  value={sortedRows[virtualRow.index]}
                  style={{ ...darkTheme, backgroundColor: 'transparent' }}
                  shouldExpandNodeInitially={(isExpanded, { value }) => {
                    if (Array.isArray(value)) return false;
                    return true;
                  }}
                  displayDataTypes={false}
                />
                {!isLast && <span className="absolute -bottom-1 left-0 font-mono text-foreground/70">,</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="font-mono text-sm font-bold text-foreground/70 mt-2">{"]"}</div>
    </div>
  );
}
