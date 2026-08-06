import type { DbRow } from '@/types/database'
import type { ChartType } from '@/store/visualizerStore'

export type ColumnRole = 'numeric' | 'categorical' | 'temporal' | 'id'

export interface ColumnProfile {
  name: string
  role: ColumnRole
  uniqueValues: number
  totalValues: number
  min?: number
  max?: number
}

function classifyValue(value: unknown): ColumnRole {
  if (value === null || value === undefined) return 'categorical'
  if (typeof value === 'number') return 'numeric'
  if (typeof value === 'boolean') return 'categorical'
  if (typeof value === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(value)) return 'numeric'
    if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(value)) return 'temporal'
    if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(value)) return 'temporal'
    return 'categorical'
  }
  return 'categorical'
}

export function detectColumns(columns: string[], rows: DbRow[]): ColumnProfile[] {
  return columns.map((name) => {
    const values = rows.map((r) => r[name])
    const uniqueSet = new Set(values.map((v) => String(v)))
    const numericValues = values
      .map((v) => (v !== null ? Number(v) : NaN))
      .filter((n) => !isNaN(n))

    let role = classifyValue(values.find((v) => v !== null) ?? null)
    if (role === 'categorical') {
      const catCount = values.filter((v) => v !== null && v !== undefined).length
      if (catCount > 0 && uniqueSet.size < catCount * 0.3) {
        role = 'categorical'
      }
    }

    const nameLower = name.toLowerCase()
    if (
      role !== 'numeric' &&
      (nameLower === 'id' ||
        nameLower.endsWith('_id') ||
        nameLower.endsWith('id') ||
        nameLower === 'key' ||
        nameLower.endsWith('_key'))
    ) {
      role = 'id'
    }

    if (
      role !== 'numeric' &&
      role !== 'id' &&
      (nameLower.includes('date') ||
        nameLower.includes('time') ||
        nameLower.includes('year') ||
        nameLower.includes('month') ||
        nameLower === 'created_at' ||
        nameLower === 'updated_at')
    ) {
      role = 'temporal'
    }

    return {
      name,
      role,
      uniqueValues: uniqueSet.size,
      totalValues: values.length,
      min: numericValues.length > 0 ? Math.min(...numericValues) : undefined,
      max: numericValues.length > 0 ? Math.max(...numericValues) : undefined,
    }
  })
}

export interface ChartSuggestion {
  chartType: ChartType
  xColumn: string
  yColumns: string[]
  groupColumn: string | null
}

export function suggestChart(profiles: ColumnProfile[]): ChartSuggestion {
  const numeric = profiles.filter((p) => p.role === 'numeric')
  const categorical = profiles.filter((p) => p.role === 'categorical')
  const temporal = profiles.filter((p) => p.role === 'temporal')

  if (numeric.length === 0) {
    return {
      chartType: 'bar',
      xColumn: categorical[0]?.name ?? profiles[0]?.name ?? '',
      yColumns: [],
      groupColumn: null,
    }
  }

  const xCol = temporal[0]?.name ?? categorical[0]?.name ?? numeric[0]?.name ?? ''
  const yCols = [numeric[0].name]

  if (temporal.length > 0) {
    return { chartType: 'line', xColumn: xCol, yColumns: yCols, groupColumn: null }
  }

  if (numeric.length >= 2 && categorical.length > 0) {
    return { chartType: 'bar', xColumn: categorical[0].name, yColumns: numeric.slice(0, 3).map((p) => p.name), groupColumn: null }
  }

  if (categorical.length > 0) {
    return { chartType: 'bar', xColumn: categorical[0].name, yColumns: yCols, groupColumn: null }
  }

  return {
    chartType: 'pie',
    xColumn: xCol,
    yColumns: yCols,
    groupColumn: null,
  }
}
