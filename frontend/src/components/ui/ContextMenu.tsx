import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuGroup {
  title?: string;
  items: ContextMenuItem[];
  initiallyOpen?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
  onDismiss: () => void;
}

/**
 * Phase 9 — Context-aware right-click menu.
 *
 * Renders at (x, y) using fixed positioning.
 * Auto-adjusts to avoid viewport overflow.
 * Dismisses on outside click, Escape key, or item selection.
 *
 * Groups with a title render as an expandable dropdown: collapsed by
 * default, toggled by clicking the group header.
 *
 * Usage: render conditionally based on `contextMenuState !== null`.
 */
export function ContextMenu({ x, y, groups, onDismiss }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  const toggleGroup = (gi: number) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gi)) {
        next.delete(gi);
      } else {
        next.add(gi);
      }
      return next;
    });
  const isOpen = (gi: number) =>
    groups[gi].initiallyOpen || openGroups.has(gi);

  // Dismiss on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDismiss]);

  // Adjust position to stay within viewport after mount
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const estimatedW = 200;
  const estimatedH = groups.reduce((acc, g, gi) => {
    if (!g.title) {
      return acc + g.items.length * 32 + 6;
    }
    if (isOpen(gi)) {
      return acc + 28 + g.items.length * 32 + 6;
    }
    return acc + 28 + 6;
  }, 18);
  const adjustedX = x + estimatedW > viewportW ? x - estimatedW : x;
  const adjustedY = y + estimatedH > viewportH ? y - estimatedH : y;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[300] min-w-[180px] max-w-[260px] bg-surface-elevated border border-border/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100 select-none"
      style={{ top: adjustedY, left: adjustedX }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <hr className="border-border/50 my-1" />}
          {group.title ? (
            <>
              <button
                type="button"
                onClick={() => toggleGroup(gi)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider rounded-md hover:bg-accent-muted hover:text-accent transition-colors duration-100"
                aria-expanded={isOpen(gi)}
              >
                <span className="truncate">{group.title}</span>
                <ChevronRight
                  className={cn('w-3 h-3 shrink-0 transition-transform duration-150', isOpen(gi) && 'rotate-90')}
                />
              </button>
              {isOpen(gi) && (
                <div className="space-y-0.5">
                  {group.items.map((item, ii) => (
                    <button
                      key={ii}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        if (!item.disabled) {
                          item.onClick();
                          onDismiss();
                        }
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors duration-100 flex items-center justify-between gap-2 font-medium',
                        item.disabled
                          ? 'text-muted-foreground/50 cursor-not-allowed'
                          : item.variant === 'destructive'
                            ? 'text-destructive hover:bg-destructive/10'
                            : 'text-foreground hover:bg-accent-muted hover:text-accent',
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {item.icon && (
                          <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                            {item.icon}
                          </span>
                        )}
                        {item.label}
                      </span>
                      {item.shortcut && (
                        <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono shrink-0">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-0.5">
              {group.items.map((item, ii) => (
                <button
                  key={ii}
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled) {
                      item.onClick();
                      onDismiss();
                    }
                  }}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors duration-100 flex items-center justify-between gap-2 font-medium',
                    item.disabled
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : item.variant === 'destructive'
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'text-foreground hover:bg-accent-muted hover:text-accent',
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {item.icon && (
                      <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                        {item.icon}
                      </span>
                    )}
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
