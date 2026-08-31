import type { DbRow } from '@/types/database'

export type MongoAction = 'find' | 'update' | 'insert' | 'delete'

function formatMongoValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.$oid) return `ObjectId("${String(obj.$oid)}")`
    if (obj.$date !== undefined) {
      const d = obj.$date
      if (typeof d === 'string') return `ISODate("${d}")`
      if (typeof d === 'number') return `ISODate(${d})`
      if (d && typeof d === 'object') {
        const nl = (d as Record<string, unknown>).$numberLong
        if (nl !== undefined) return `ISODate(${String(nl)})`
      }
    }
    if (obj.$numberLong !== undefined) return `NumberLong("${String(obj.$numberLong)}")`
    const inner = Object.entries(obj)
      .map(([k, v]) => `${JSON.stringify(k)}: ${formatMongoValue(v)}`)
      .join(', ')
    return `{ ${inner} }`
  }
  return String(value)
}


function buildRowFilter(row: DbRow): string {
  const id = row['_id']
  if (id !== undefined && id !== null) {
    return `{ _id: ${formatMongoValue(id)} }`
  }
  const conds = Object.entries(row)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${JSON.stringify(k)}: ${formatMongoValue(v)}`)
  if (conds.length === 0) return '{}'
  return `{ ${conds.join(', ')} }`
}


function buildIdInFilter(rows: DbRow[]): string {
  const ids = rows
    .map((r) => r['_id'])
    .filter((v) => v !== undefined && v !== null)
  if (ids.length === 0) return '{}'
  const list = ids.map((v) => formatMongoValue(v)).join(', ')
  return `{ _id: { $in: [${list}] } }`
}

function collectionRef(collection: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(collection)
    ? collection
    : `[${JSON.stringify(collection)}]`
}

function docLiteral(row: DbRow): string {
  const fields = Object.entries(row)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${JSON.stringify(k)}: ${formatMongoValue(v)}`)
  return `{ ${fields.join(', ')} }`
}



export function generateMongoCommand(
  collection: string,
  action: MongoAction,
  rows: DbRow[],
): string {
  const ref = collectionRef(collection)
  const list = rows.length > 0 ? rows : []

  switch (action) {
    case 'find':
      return list.length > 1
        ? `db.${ref}.find(${buildIdInFilter(list)})`
        : `db.${ref}.find(${buildRowFilter(list[0] ?? {})})`
    case 'delete':
      return list.length > 1
        ? `db.${ref}.deleteMany(${buildIdInFilter(list)})`
        : `db.${ref}.deleteOne(${buildRowFilter(list[0] ?? {})})`
    case 'update': {
      const filter = list.length > 1 ? buildIdInFilter(list) : buildRowFilter(list[0] ?? {})
      const target = list[0] ?? {}
      const setFields = Object.entries(target)
        .filter(([k, v]) => k !== '_id' && v !== undefined)
        .map(([k, v]) => `${JSON.stringify(k)}: ${formatMongoValue(v)}`)
      const set = setFields.length > 0 ? `{ ${setFields.join(', ')} }` : '{}'
      return list.length > 1
        ? `db.${ref}.updateMany(${filter}, { $set: ${set} })`
        : `db.${ref}.updateOne(${filter}, { $set: ${set} })`
    }
    case 'insert':
      return list.length > 1
        ? `db.${ref}.insertMany([${list.map(docLiteral).join(', ')}])`
        : `db.${ref}.insertOne(${docLiteral(list[0] ?? {})})`
  }
}


export function extractMongoCollection(query: string): string | null {
  const cleaned = query.trim().replace(/;\s*$/, '')
  const shell = cleaned.match(
    /^\s*db\s*\.\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/,
  )
  if (shell) return shell[1]
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && typeof parsed.collection === 'string') {
      return parsed.collection
    }
  } catch {

  }
  return null
}