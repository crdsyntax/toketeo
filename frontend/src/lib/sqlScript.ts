


export function splitSqlStatements(sql: string): string[] {
  if (!sql.trim()) return []

  const statements: string[] = []
  let current = ''
  let delimiter = ';'
  let i = 0
  let atLineStart = true

  while (i < sql.length) {
    const c = sql[i]


    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        current += sql[i]
        i++
      }
      continue
    }


    if (c === '/' && sql[i + 1] === '*') {
      current += '/*'
      i += 2
      while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        current += sql[i]
        i++
      }
      if (i + 1 < sql.length) {
        current += '*/'
        i += 2
      } else {
        current += '*/'
        i = sql.length
      }
      continue
    }


    if (c === "'") {
      current += "'"
      i++
      while (i < sql.length) {
        current += sql[i]
        if (sql[i] === "'") {
          i++
          if (sql[i] === "'") {
            current += "'"
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
      current += c
      i++
      while (i < sql.length) {
        current += sql[i]
        if (sql[i] === c) {
          i++
          if (sql[i] === c) {
            current += c
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
      const newDelimiter = parseDelimiter(sql.slice(i))
      if (newDelimiter !== null) {
        if (containsSql(current)) {
          statements.push(current)
          current = ''
        }
        while (i < sql.length && sql[i] !== '\n') i++
        if (i < sql.length) i++
        delimiter = newDelimiter
        atLineStart = true
        continue
      }
    }


    if (sql.startsWith(delimiter, i)) {

      if (delimiter === ';') current += delimiter
      i += delimiter.length
      if (containsSql(current)) {
        statements.push(current)
        current = ''
      }
      atLineStart = false
      continue
    }

    current += c
    if (c === '\n') {
      atLineStart = true
    } else if (!/\s/.test(c)) {
      atLineStart = false
    }
    i++
  }


  if (containsSql(current)) {
    statements.push(current)
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