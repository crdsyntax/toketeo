import type { Node, Edge } from '@xyflow/react'
import type { ColumnResponse, ForeignKeyResponse } from '@/types/database'

interface TableData {
  label: string
  columns?: ColumnResponse[]
  foreignKeys?: ForeignKeyResponse[]
}

const CARDINALITY_SYMBOLS: Record<string, string> = {
  '1:1': '||--||',
  '1:N': '||--o{',
  'N:M': '}o--o{',
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/


function sanitizeEntity(raw: string, used: Set<string>): string {
  let safe = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^(\d)/, '_$1')
  if (!safe) safe = 'ENTITY'
  let candidate = safe
  let i = 2
  while (used.has(candidate)) {
    candidate = `${safe}_${i++}`
  }
  used.add(candidate)
  return candidate
}


function quotedEntity(raw: string, used: Set<string>): string {
  let candidate = `["${raw.replace(/"/g, '\\"')}"]`
  let i = 2
  while (used.has(candidate)) {
    candidate = `["${raw.replace(/"/g, '\\"')} (${i++})"]`
  }
  used.add(candidate)
  return candidate
}


function sanitizeColumn(raw: string): string {
  if (SAFE_IDENTIFIER.test(raw)) return raw
  return `"${raw.replace(/"/g, '\\"')}"`
}



export function nodesToMermaid(nodes: Node[], edges: Edge[]): string {
  const entityIds = new Map<string, string>()
  const used = new Set<string>()
  const lines: string[] = ['erDiagram']

  for (const node of nodes) {
    const raw = String((node.data as { label?: string } | undefined)?.label ?? node.id)
    const entity = SAFE_IDENTIFIER.test(raw) ? sanitizeEntity(raw, used) : quotedEntity(raw, used)
    entityIds.set(node.id, entity)

    if (node.type === 'view') {
      lines.push(`    %% VIEW ${raw}`)
      const query = (node.data as { query?: string } | undefined)?.query
      if (query) {
        for (const qline of query.split('\n')) {
          lines.push(`    %% ${qline}`)
        }
      }
      lines.push(`    ${entity} {}`)
      continue
    }

    const data = (node.data ?? {}) as unknown as TableData
    const columns = data.columns ?? []
    const fkColumns = new Set((data.foreignKeys ?? []).map((fk) => fk.columnName))

    lines.push(`    ${entity} {`)
    for (const col of columns) {
      const markers: string[] = []
      if (col.isPrimaryKey) markers.push('PK')
      if (fkColumns.has(col.name)) markers.push('FK')
      const marker = markers.length > 0 ? ` ${markers.join(' ')}` : ''
      lines.push(`        ${col.type} ${sanitizeColumn(col.name)}${marker}`)
    }
    lines.push('    }')
  }

  for (const edge of edges) {
    const source = entityIds.get(edge.source)
    const target = entityIds.get(edge.target)
    if (!source || !target) continue

    const card = String((edge.data as { cardinality?: string } | undefined)?.cardinality ?? '1:N')
    const symbol = CARDINALITY_SYMBOLS[card] ?? '||--o{'
    const edgeLabel = typeof edge.label === 'string' ? edge.label : undefined
    const label = edgeLabel ? ` : "${edgeLabel.replace(/"/g, '\\"')}"` : ''
    lines.push(`    ${source} ${symbol} ${target}${label}`)
  }

  return lines.join('\n')
}
