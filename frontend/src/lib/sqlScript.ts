/**
 * Splitter ligero de SQL que replica el comportamiento del backend
 * (application/script/splitter.rs). Se usa SOLO para decidir si un script
 * contiene varios statements y rutea la ejecución al comando `run_script`
 * (que soporta skip/skip_all/cancel por statement).
 *
 * Respeta:
 * - strings entre comillas simples (con '' escapado)
 * - identificadores entre comillas dobles o backticks
 * - comentarios de linea (--) y de bloque (slash-star ... star-slash)
 * - `;` como terminador por defecto
 * - directivas `DELIMITER <token>` (compatibilidad MySQL): la línea de la
 *   directiva no forma parte de ningún statement, solo cambia el terminador.
 */
export function splitSqlStatements(sql: string): string[] {
  if (!sql.trim()) return []

  const statements: string[] = []
  let current = ''
  let delimiter = ';'
  let i = 0
  let atLineStart = true

  while (i < sql.length) {
    const c = sql[i]

    // Comentario de línea
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        current += sql[i]
        i++
      }
      continue
    }

    // Comentario de bloque
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

    // String entre comillas simples
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

    // Identificador entre comillas dobles o backticks
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

    // Directiva DELIMITER: solo al inicio de línea
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

    // Terminador de statement (token actual, por defecto ';')
    if (sql.startsWith(delimiter, i)) {
      // Solo el ';' por defecto se conserva en el statement (el servidor lo
      // entiende). Los tokens personalizados (p. ej. '$$' con 'DELIMITER $$')
      // NO se envían al servidor: solo delimitan el bloque.
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

  // Statement final sin terminador
  if (containsSql(current)) {
    statements.push(current)
  }

  return statements
}

/**
 * Parsea una directiva `DELIMITER <token>` al inicio de línea. Devuelve el
 * token ($$, //, ;;, ;, ...) o null si no es una directiva.
 */
function parseDelimiter(sqlRest: string): string | null {
  const trimmed = sqlRest.trimStart()
  const head = trimmed.slice(0, 'DELIMITER'.length)
  if (head.toUpperCase() !== 'DELIMITER') return null
  const after = trimmed.slice('DELIMITER'.length)
  if (!after || !/\s/.test(after[0])) return null
  const token = after.trimStart().split(/\s+/)[0]
  return token && token.length > 0 ? token : null
}

/** True si el fragmento contiene SQL real (no solo comentarios/espacios). */
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