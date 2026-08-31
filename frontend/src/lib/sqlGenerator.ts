import type { DbRow, DbValue } from '@/types/database'
import { DatabaseType } from '@/types/database'

export type SqlTemplateAction = 'select' | 'insert' | 'update' | 'delete'

export function getQuoteChars(dbType?: DatabaseType): { open: string; close: string } {
  if (dbType === DatabaseType.MYSQL || dbType === DatabaseType.MARIADB) {
    return { open: '`', close: '`' }
  }
  return { open: '"', close: '"' }
}

export function quoteIdent(name: string, dbType?: DatabaseType): string {
  const { open, close } = getQuoteChars(dbType)
  return `${open}${name.replace(close, close + close)}${close}`
}

export function quoteTableName(table: string, dbType?: DatabaseType): string {
  const { open, close } = getQuoteChars(dbType)
  return `${open}${table.replace(close, close + close)}${close}`
}

export function formatSqlValue(value: DbValue): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

export function parseInputValue(raw: string): DbValue {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.toLowerCase() === 'null') return null
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
}



export function normalizeFilterQuotes(
  filter: string,
  columnNames: string[],
  dbType?: DatabaseType,
): string {
  if (!filter.includes('"')) return filter
  if (
    dbType === DatabaseType.MYSQL ||
    dbType === DatabaseType.MARIADB ||
    dbType === DatabaseType.MONGODB
  ) {
    return filter
  }
  const lowerCols = new Set(columnNames.map((c) => c.toLowerCase()))
  return filter.replace(/"([^"]*)"/g, (match, token: string) => {
    if (lowerCols.has(token.toLowerCase())) return match
    return `'${token.replace(/'/g, "''")}'`
  })
}

export interface TableSqlTemplates {
  select: string
  insert: string
  update: string
  delete: string
}


export function generateTableTemplates(
  table: string,
  dbType: DatabaseType | undefined,
  columns: string[],
  primaryKeys: string[],
): TableSqlTemplates {
  const tbl = quoteTableName(table, dbType)
  const colList = columns.map((c) => quoteIdent(c, dbType)).join(', ')
  const nulls = columns.map(() => 'NULL').join(', ')
  const where = primaryKeys[0]
    ? `${quoteIdent(primaryKeys[0], dbType)} IS NULL`
    : '1 = 0'

  return {
    select: `SELECT * FROM ${tbl} LIMIT 100;`,
    insert: columns.length
      ? `INSERT INTO ${tbl} (${colList}) VALUES (${nulls});`
      : `INSERT INTO ${tbl};`,
    update: columns.length
      ? `UPDATE ${tbl} SET ${columns.map((c) => `${quoteIdent(c, dbType)} = NULL`).join(', ')} WHERE ${where};`
      : `UPDATE ${tbl} SET 1 = 0 WHERE ${where};`,
    delete: `DELETE FROM ${tbl} WHERE ${where};`,
  }
}



function resolveSingleKey(rows: DbRow[], primaryKeys: string[]): string | null {
  if (primaryKeys.length === 1) return primaryKeys[0]
  if (primaryKeys.length > 0) return null
  if (rows.length === 0) return null
  const candidates = ['id', '_id', 'uuid', 'key']
  for (const key of candidates) {
    if (rows.every((r) => r[key] !== undefined && r[key] !== null)) return key
  }
  return null
}



export function generateRowsWhereClause(
  rows: DbRow[],
  primaryKeys: string[],
  dbType?: DatabaseType,
): string {
  const singleKey = resolveSingleKey(rows, primaryKeys)
  if (singleKey) {

    if (rows.length === 1) {
      return `${quoteIdent(singleKey, dbType)} = ${formatSqlValue(rows[0][singleKey])}`
    }
    const values = rows.map((r) => formatSqlValue(r[singleKey]))
    return `${quoteIdent(singleKey, dbType)} IN (${values.join(', ')})`
  }

  const clauses: string[] = []
  for (const row of rows) {
    const keys =
      primaryKeys.length > 0
        ? primaryKeys.filter((k) => row[k] !== undefined)
        : Object.keys(row).filter((k) => row[k] !== undefined && row[k] !== null)
    if (keys.length === 0) continue
    const conds = keys.map((k) => {
      const v = row[k]
      if (v === null || v === undefined) {
        return `${quoteIdent(k, dbType)} IS NULL`
      }
      return `${quoteIdent(k, dbType)} = ${formatSqlValue(v)}`
    })
    clauses.push(`(${conds.join(' AND ')})`)
  }
  return clauses.join(' OR ')
}

export function generateSelectByIds(
  table: string,
  rows: DbRow[],
  primaryKeys: string[],
  dbType?: DatabaseType,
): string {
  const where = generateRowsWhereClause(rows, primaryKeys, dbType)
  if (!where) return ''
  return `SELECT * FROM ${quoteTableName(table, dbType)} WHERE ${where};`
}

export function generateDeleteByIds(
  table: string,
  rows: DbRow[],
  primaryKeys: string[],
  dbType?: DatabaseType,
): string {
  const where = generateRowsWhereClause(rows, primaryKeys, dbType)
  if (!where) return ''
  return `DELETE FROM ${quoteTableName(table, dbType)} WHERE ${where};`
}

export function generateUpdateByIds(
  table: string,
  rows: DbRow[],
  primaryKeys: string[],
  assignments: { column: string; value: DbValue }[],
  dbType?: DatabaseType,
): string {
  const where = generateRowsWhereClause(rows, primaryKeys, dbType)
  if (!where || assignments.length === 0) return ''
  const set = assignments
    .map((a) => `${quoteIdent(a.column, dbType)} = ${formatSqlValue(a.value)}`)
    .join(', ')
  return `UPDATE ${quoteTableName(table, dbType)} SET ${set} WHERE ${where};`
}



export function generateInsertRows(
  table: string,
  rows: DbRow[],
  dbType?: DatabaseType,
): string {
  if (rows.length === 0) return ''
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  if (columns.length === 0) return ''
  const colList = columns.map((c) => quoteIdent(c, dbType)).join(', ')
  const valueList = rows
    .map((row) => columns.map((c) => formatSqlValue(row[c])).join(', '))
    .map((v) => `(${v})`)
    .join(', ')
  return `INSERT INTO ${quoteTableName(table, dbType)} (${colList}) VALUES ${valueList};`
}
