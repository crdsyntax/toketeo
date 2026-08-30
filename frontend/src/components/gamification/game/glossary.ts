import type { LText } from './types'

export interface GlossEntry {
  label: LText
  def: LText
  example?: string
}

export const GLOSSARY: Record<string, GlossEntry> = {
  relacion: {
    label: { en: 'Relationship', es: 'Relación' },
    def: {
      en: 'How two tables are linked: one column (foreign key) points at another table\'s primary key. Join them with ON table_a.id = table_b.a_id.',
      es: 'Cómo se vinculan dos tablas: una columna (clave foránea) apunta a la llave primaria de otra tabla. Se unen con ON tabla_a.id = tabla_b.a_id.',
    },
    example: '-- persons(id) <- roles(person_id)\nSELECT *\nFROM persons p\nJOIN roles r ON r.person_id = p.id',
  },
  join: {
    label: { en: 'JOIN', es: 'JOIN' },
    def: {
      en: 'Combines rows of two tables side by side wherever the ON condition matches. INNER JOIN keeps only pairs that match; LEFT JOIN keeps all rows of the left table even without a match.',
      es: 'Combina filas de dos tablas lado a lado donde la condición ON coincide. INNER JOIN conserva solo los pares que coinciden; LEFT JOIN conserva todas las filas de la izquierda aunque no haya coincidencia.',
    },
    example: "SELECT p.name, r.job\nFROM persons p\nINNER JOIN roles r ON p.id = r.person_id",
  },
  select: {
    label: { en: 'SELECT', es: 'SELECT' },
    def: {
      en: 'Reads data without modifying it. After SELECT you list the columns you want (* = all); this is called projection.',
      es: 'Lee datos sin modificarlos. Tras SELECT listas las columnas que quieres (* = todas); esto se llama proyección.',
    },
    example: 'SELECT name, alley FROM victims',
  },
  from: {
    label: { en: 'FROM', es: 'FROM' },
    def: {
      en: 'Declares the table (or joined tables) the rows come from.',
      es: 'Declara la tabla (o tablas unidas) de donde vienen las filas.',
    },
    example: 'SELECT * FROM victims',
  },
  where: {
    label: { en: 'WHERE', es: 'WHERE' },
    def: {
      en: 'Filters individual ROWS before any grouping. Only rows making the condition true survive. Use AND / OR to combine conditions.',
      es: 'Filtra FILAS individuales antes de cualquier agrupación. Solo sobreviven las filas que cumplen la condición. Combina condiciones con AND / OR.',
    },
    example: "SELECT * FROM victims WHERE alley = 'Tallow Lane'",
  },
  groupby: {
    label: { en: 'GROUP BY', es: 'GROUP BY' },
    def: {
      en: 'Buckets rows sharing the same value into groups so aggregates (COUNT, SUM, AVG…) run once per bucket.',
      es: 'Agrupa en baldes las filas que comparten el mismo valor para que los agregados (COUNT, SUM, AVG…) se calculen una vez por balde.',
    },
    example: 'SELECT alley, COUNT(*) AS total\nFROM victims\nGROUP BY alley',
  },
  having: {
    label: { en: 'HAVING', es: 'HAVING' },
    def: {
      en: 'Like WHERE but for GROUPS: it filters after aggregation already happened. WHERE cannot see COUNT/SUM results; HAVING can.',
      es: 'Como WHERE pero para GRUPOS: filtra después de que la agregación ocurrió. WHERE no puede ver resultados de COUNT/SUM; HAVING sí.',
    },
    example: 'SELECT alley, COUNT(*) AS total\nFROM victims\nGROUP BY alley\nHAVING COUNT(*) > 3',
  },
  count: {
    label: { en: 'COUNT', es: 'COUNT' },
    def: {
      en: 'Aggregate that counts rows (COUNT *) or non-null values (COUNT col) of each group.',
      es: 'Agregado que cuenta filas (COUNT *) o valores no nulos (COUNT col) de cada grupo.',
    },
    example: 'SELECT COUNT(*) FROM victims',
  },
  like: {
    label: { en: 'LIKE', es: 'LIKE' },
    def: {
      en: 'Pattern match for text: % replaces any sequence of characters, _ exactly one. %whey% matches any residue containing whey.',
      es: 'Coincidencia de patrones en texto: % reemplaza cualquier secuencia de caracteres, _ exactamente uno. %whey% coincide con cualquier residuo que contenga suero.',
    },
    example: "SELECT * FROM tools WHERE residue LIKE '%whey%'",
  },
  pk: {
    label: { en: 'Primary key', es: 'Llave primaria' },
    def: {
      en: 'The column that uniquely identifies each row of a table (usually id). Never repeats, never null. Other tables reference it.',
      es: 'La columna que identifica de forma única cada fila de una tabla (normalmente id). Nunca se repite ni es nula. Otras tablas la referencian.',
    },
    example: 'persons(id ← primary key)',
  },
  fk: {
    label: { en: 'Foreign key', es: 'Clave foránea' },
    def: {
      en: 'A column that stores the primary key of ANOTHER table, creating the relationship. roles.person_id stores a persons.id value.',
      es: 'Una columna que guarda la llave primara de OTRA tabla, creando la relación. roles.person_id guarda valores de persons.id.',
    },
    example: 'roles(person_id) → references persons(id)',
  },
  document: {
    label: { en: 'Document (MongoDB)', es: 'Documento (MongoDB)' },
    def: {
      en: 'MongoDB unit of data: a JSON-like object of field:value pairs inside a collection. Documents of the same collection may have different fields (schema-less).',
      es: 'Unidad de datos de MongoDB: un objeto tipo JSON de pares campo:valor dentro de una colección. Los documentos de una misma colección pueden tener campos distintos (sin esquema fijo).',
    },
    example: '{ role: "butcher", shift: "night" }',
  },
  collection: {
    label: { en: 'Collection', es: 'Colección' },
    def: {
      en: 'MongoDB\'s equivalent of a table: a container of documents. Accessed as db.<name>.',
      es: 'El equivalente de una tabla en MongoDB: contenedor de documentos. Se accede como db.<nombre>.',
    },
    example: 'db.residents.find({ ... })',
  },
  find: {
    label: { en: 'find()', es: 'find()' },
    def: {
      en: 'Reads documents whose fields match the filter. Multiple fields in one filter mean AND automatically.',
      es: 'Lee los documentos cuyos campos coinciden con el filtro. Varios campos en un filtro implican AND automáticamente.',
    },
    example: 'db.residents.find({ role: "butcher", shift: "night" })',
  },
  sortedset: {
    label: { en: 'Sorted set (Redis)', es: 'Sorted set (Redis)' },
    def: {
      en: 'Redis structure storing unique members with a score, always ordered by score. Written with ZADD; ideal for leaderboards.',
      es: 'Estructura de Redis que guarda miembros únicos con puntaje, siempre ordenados por puntaje. Se escribe con ZADD; ideal para rankings.',
    },
    example: 'ZADD suspects 100 "aldous_vex"',
  },
  setex: {
    label: { en: 'SETEX / TTL', es: 'SETEX / TTL' },
    def: {
      en: 'Stores a value with a time-to-live in seconds; Redis deletes the key automatically when it expires. Atomic: set + expire in one command.',
      es: 'Guarda un valor con tiempo de vida en segundos; Redis borra la clave automáticamente al expirar. Atómico: set + expiración en un comando.',
    },
    example: 'SETEX evidence:knife 60 sealed-cleaver',
  },
  deadlock: {
    label: { en: 'Deadlock', es: 'Deadlock' },
    def: {
      en: 'Circular wait between transactions: A holds a lock B needs while B holds one A needs. The engine detects it and aborts one transaction.',
      es: 'Espera circular entre transacciones: A retiene un candado que B necesita mientras B retiene uno que A necesita. El motor la detecta y cancela una de las dos.',
    },
    example: '-- T1 locks row 1, wants row 2\n-- T2 locks row 2, wants row 1  → deadlock',
  },
  transaction: {
    label: { en: 'Transaction', es: 'Transacción' },
    def: {
      en: 'A group of operations executed as ONE unit: all succeed (COMMIT) or none apply (ROLLBACK). Locks protect its rows from other sessions.',
      es: 'Grupo de operaciones ejecutadas como UNA unidad: todas tienen éxito (COMMIT) o no se aplica ninguna (ROLLBACK). Los candados protegen sus filas de otras sesiones.',
    },
    example: 'BEGIN;\nUPDATE accounts SET balance = balance - 50 ...\nCOMMIT;',
  },
}

const ALIASES: Array<[RegExp, string]> = [
  [/claves?\s+for[aá]neas?|llaves?\s+for[aá]neas?|foreign\s+keys?/i, 'fk'],
  [/llave\s+primari[ao]s?|primary\s+keys?/i, 'pk'],
  [/inner\s+joins?|joins?/i, 'join'],
  [/group\s+by|agrupaci[oó]n/i, 'groupby'],
  [/sorted\s+sets?|zadd/i, 'sortedset'],
  [/setex|time\s+to\s+live|ttl|expira(?:ci[oó]n|r|ndo)?|expires?/i, 'setex'],
  [/deadlocks?/i, 'deadlock'],
  [/transacciones?|transactions?/i, 'transaction'],
  [/relaci[oó]n(es)?|relationships?/i, 'relacion'],
  [/documents?|documentos?/i, 'document'],
  [/collections?|colecci[oó]n|colecciones/i, 'collection'],
  [/find\(\)/i, 'find'],
  [/count\s*\(\*\)|counts?/i, 'count'],
  [/select/i, 'select'],
  [/\bfrom\b/i, 'from'],
  [/\bwhere\b/i, 'where'],
  [/\bhaving\b/i, 'having'],
  [/\blike\b/i, 'like'],
]

const escaped = ALIASES.map(([re]) => `(?:${re.source})`)
const RICH_RE = new RegExp(escaped.join('|'), 'gi')

export interface RichPiece {
  text: string
  termKey?: string
}

export function segmentRichText(input: string): RichPiece[] {
  const pieces: RichPiece[] = []
  let last = 0
  for (const match of input.matchAll(RICH_RE)) {
    const idx = match.index ?? 0
    if (idx > last) pieces.push({ text: input.slice(last, idx) })
    let matched = false
    for (const [re, key] of ALIASES) {
      const m = match[0].match(new RegExp(`^(?:${re.source})$`, 'i'))
      if (m && GLOSSARY[key]) {
        pieces.push({ text: match[0], termKey: key })
        matched = true
        break
      }
    }
    if (!matched) pieces.push({ text: match[0] })
    last = idx + match[0].length
  }
  if (last < input.length) pieces.push({ text: input.slice(last) })
  return pieces
}
