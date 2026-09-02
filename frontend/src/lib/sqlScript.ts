
export function splitSqlStatements(sql: string): string[] {
  if (!sql.trim()) return []

  const statements: string[] = []
  let stmtStart = 0
  let delimiter = ';'
  let i = 0
  let atLineStart = true
  const len = sql.length

  while (i < len) {
    const c = sql[i]

    if (c === '-' && sql[i + 1] === '-') {
      while (i < len && sql[i] !== '\n') {
        i++
      }
      continue
    }

    if (c === '/' && sql[i + 1] === '*') {
      i += 2
      while (i + 1 < len && !(sql[i] === '*' && sql[i + 1] === '/')) {
        i++
      }
      if (i + 1 < len) {
        i += 2
      } else {
        i = len
      }
      continue
    }

    if (c === "'") {
      i++
      while (i < len) {
        if (sql[i] === "'") {
          i++
          if (sql[i] === "'") {
            i++
            continue
          }
          break
        }
        i++
      }
      continue
    }

    if (c === '"' || c === '`') {
      const quote = c
      i++
      while (i < len) {
        if (sql[i] === quote) {
          i++
          if (sql[i] === quote) {
            i++
            continue
          }
          break
        }
        i++
      }
      continue
    }

    if (atLineStart) {
      const rest = sql.slice(i, Math.min(i + 64, len))
      const newDelimiter = parseDelimiter(rest)
      if (newDelimiter !== null) {
        const chunk = sql.slice(stmtStart, i).trim()
        if (containsSql(chunk)) {
          statements.push(chunk)
        }
        while (i < len && sql[i] !== '\n') i++
        if (i < len) i++
        stmtStart = i
        delimiter = newDelimiter
        atLineStart = true
        continue
      }
    }

    if (sql.startsWith(delimiter, i)) {
      const end = delimiter === ';' ? i + 1 : i
      const chunk = sql.slice(stmtStart, end).trim()
      if (containsSql(chunk)) {
        statements.push(chunk)
      }
      i += delimiter.length
      stmtStart = i
      atLineStart = false
      continue
    }

    if (c === '\n') {
      atLineStart = true
    } else if (!/\s/.test(c)) {
      atLineStart = false
    }
    i++
  }

  if (stmtStart < len) {
    const chunk = sql.slice(stmtStart).trim()
    if (containsSql(chunk)) {
      statements.push(chunk)
    }
  }

  return statements
}


function parseDelimiter(sqlRest: string): string | null {
  const trimmed = sqlRest.trimStart()
  const head = trimmed.slice(0, 'DELIMITER'.length)
  if (head.toUpperCase() !== 'DELIMITER') return null
  const after = trimmed.slice('DELIMITER'.length)
  if (!after || !/\s/.test(after[0])) return null
  const token = after.trimStart().split(/\s+/)[0]
  return token && token.length > 0 ? token : null
}


function containsSql(fragment: string): boolean {
  let i = 0
  while (i < fragment.length) {
    const c = fragment[i]
    if (c === '-' && fragment[i + 1] === '-') {
      while (i < fragment.length && fragment[i] !== '\n') i++
      continue
    }
    if (c === '/' && fragment[i + 1] === '*') {
      i += 2
      while (i + 1 < fragment.length && !(fragment[i] === '*' && fragment[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') return true
    if (!/\s/.test(c) && c !== ';') return true
    i++
  }
  return false
}