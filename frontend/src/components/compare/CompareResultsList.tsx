import { useMemo, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  SchemaReport,
} from '@/types/compare'
import {
  STATUS_CONFIG,
  buildCompareItems,
  type DiffGroupKey,
  type CompareResultItem,
} from '@/lib/compareHelpers'

export type { DiffGroupKey, CompareResultItem }

interface ItemRowProps {
  item: CompareResultItem
  selected: boolean
  onToggleSelect: (id: string) => void
}

function ItemRow({ item, selected, onToggleSelect }: ItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[item.status]
  const canExpand = item.status !== 'equal' && !!item.detail

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          className="rounded border-border accent-primary shrink-0"
          title="Incluir en el script"
        />
        <button
          onClick={() => canExpand && setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-2 flex-1 min-w-0 text-left transition-colors',
            canExpand ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default'
          )}
        >
          {canExpand ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <cfg.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-mono flex-1 min-w-0 truncate">{item.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">{item.sectionLabel}</span>
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium shrink-0', cfg.color)}>
            {cfg.label}
          </span>
        </button>
      </div>
      {expanded && item.detail && (
        <div className="px-3 pb-2 pl-11 space-y-1 border-t border-border/30">{item.detail}</div>
      )}
    </div>
  )
}

function GroupSection({
  group,
  items,
  selectedIds,
  onToggleSelect,
}: {
  group: DiffGroupKey
  items: CompareResultItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  if (items.length === 0) return null

  const selectedCount = items.filter((i) => selectedIds.has(i.id)).length
  const groupLabels: Record<DiffGroupKey, string> = {
    missing: 'Solo en A (faltan en B)',
    modified: 'Modificados',
    new: 'Solo en B (nuevos)',
    equal: 'Coinciden',
  }
  const groupColors: Record<DiffGroupKey, string> = {
    missing: 'text-red-600 dark:text-red-400',
    modified: 'text-amber-600 dark:text-amber-400',
    new: 'text-blue-600 dark:text-blue-400',
    equal: 'text-emerald-600 dark:text-emerald-400',
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className={cn('font-medium text-sm', groupColors[group])}>{groupLabels[group]}</span>
        <span className="text-xs text-muted-foreground">({items.length})</span>
        {selectedCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{selectedCount} seleccionados</span>
        )}
      </button>
      {expanded && (
        <div className="px-2 py-2 space-y-1">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CompareResultsList({
  report,
  selectedIds,
  onToggleSelect,
}: {
  report: SchemaReport
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState<DiffGroupKey | 'all'>('all')

  const items = useMemo<CompareResultItem[]>(() => buildCompareItems(report), [report])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sectionLabel.toLowerCase().includes(search.toLowerCase())
      const matchGroup = activeGroup === 'all' || item.group === activeGroup
      return matchSearch && matchGroup
    })
  }, [items, search, activeGroup])

  const byGroup: Record<DiffGroupKey, CompareResultItem[]> = {
    missing: filtered.filter((i) => i.group === 'missing'),
    modified: filtered.filter((i) => i.group === 'modified'),
    new: filtered.filter((i) => i.group === 'new'),
    equal: filtered.filter((i) => i.group === 'equal'),
  }

  const counts: Record<DiffGroupKey, number> = {
    missing: items.filter((i) => i.group === 'missing').length,
    modified: items.filter((i) => i.group === 'modified').length,
    new: items.filter((i) => i.group === 'new').length,
    equal: items.filter((i) => i.group === 'equal').length,
  }

  const sel = selectedIds ?? new Set<string>()
  const onToggle = onToggleSelect ?? (() => {})

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por nombre o tipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(['all', 'missing', 'modified', 'new', 'equal'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={cn(
                'px-2.5 py-1.5 transition-colors',
                activeGroup === g
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-background hover:bg-muted text-muted-foreground'
              )}
            >
              {g === 'all' ? `Todos (${items.length})` : `${g} (${counts[g]})`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <GroupSection
          group="missing"
          items={byGroup.missing}
          selectedIds={sel}
          onToggleSelect={onToggle}
        />
        <GroupSection
          group="modified"
          items={byGroup.modified}
          selectedIds={sel}
          onToggleSelect={onToggle}
        />
        <GroupSection
          group="new"
          items={byGroup.new}
          selectedIds={sel}
          onToggleSelect={onToggle}
        />
        <GroupSection
          group="equal"
          items={byGroup.equal}
          selectedIds={sel}
          onToggleSelect={onToggle}
        />
      </div>
    </div>
  )
}
