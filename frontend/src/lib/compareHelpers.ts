import React from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  XCircle,
} from 'lucide-react'
import type {
  SchemaReport,
  CompareStatus,
} from '@/types/compare'
import {
  TableColumnsDiff,
  IndexDetail,
  FkDetail,
} from '@/components/compare/DiffDetails'

export type DiffGroupKey = 'missing' | 'modified' | 'new' | 'equal'

export interface CompareResultItem {
  id: string
  group: DiffGroupKey
  status: CompareStatus
  name: string
  sectionLabel: string
  detail?: React.ReactNode
}

export const STATUS_CONFIG: Record<
  CompareStatus,
  { label: string; color: string; icon: typeof XCircle }
> = {
  equal: { label: 'Coinciden', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', icon: CheckCircle2 },
  modified: { label: 'Modificados', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', icon: AlertTriangle },
  new: { label: 'Solo en B', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', icon: PlusCircle },
  missing: { label: 'Solo en A', color: 'text-red-600 bg-red-50 dark:bg-red-950/30', icon: XCircle },
}

export function buildCompareItems(report: SchemaReport): CompareResultItem[] {
  const out: CompareResultItem[] = []
  const push = (group: DiffGroupKey, name: string, sectionLabel: string, detail?: React.ReactNode) => {
    out.push({
      id: `${group}:${sectionLabel}:${name}`,
      group,
      status: group === 'equal' ? 'equal' : group === 'missing' ? 'missing' : group === 'new' ? 'new' : 'modified',
      name,
      sectionLabel,
      detail,
    })
  }

  report.tables.forEach((t) => push(t.status as DiffGroupKey, t.name, 'tabla', React.createElement(TableColumnsDiff, { item: t })))
  report.indexes.forEach((i) => push(i.status as DiffGroupKey, `${i.table}.${i.name}`, 'índice', React.createElement(IndexDetail, { item: i })))
  report.foreign_keys.forEach((f) => push(f.status as DiffGroupKey, `${f.table}.${f.name}`, 'FK', React.createElement(FkDetail, { item: f })))
  report.constraints.forEach((c) => push(c.status as DiffGroupKey, `${c.table}.${c.name}`, 'constraint'))
  report.views.forEach((v) => push(v.status as DiffGroupKey, v.name, 'vista'))
  report.procedures.forEach((p) => push(p.status as DiffGroupKey, p.name, 'procedimiento'))
  report.functions.forEach((f) => push(f.status as DiffGroupKey, f.name, 'función'))
  report.triggers.forEach((t) => push(t.status as DiffGroupKey, t.name, 'trigger'))
  return out
}
