import type { MapNode, Puzzle } from '../types'

const VICTIMS_TABLE = {
  name: 'victims',
  columns: ['id', 'name', 'age', 'alley', 'cause_of_death', 'died_on'],
  rows: [
    ['1', 'Marta Vell', '34', 'Tallow Lane', 'strangulation', '1887-01-01'],
    ['2', 'Oren Pike', '51', 'Gallows Row', 'stake', '1887-01-02'],
    ['3', 'Hesper Vane', '22', 'Ash Court', 'drowning', '1887-01-03'],
    ['4', 'Bram Cot', '47', 'Tallow Lane', 'strangulation', '1887-01-04'],
    ['5', 'Ivo Renn', '19', 'Gallows Row', '', '1887-01-05'],
    ['6', 'Nula Sart', '63', 'Tallow Lane', 'strangulation', '1887-01-06'],
    ['7', 'Piers Undy', '28', 'Ash Court', 'strangulation', '1887-01-07'],
    ['8', 'Rosa Mott', '41', 'Gallows Row', 'burning', '1887-01-08'],
  ],
}

const p1: Puzzle = {
  id: 'l1-s1-p1',
  kind: 'trivia',
  engine: 'sql',
  xp: 150,
  title: { en: 'First Blood on Avenida SELECT', es: 'Primera sangre en Avenida SELECT' },
  story: {
    en: 'The rain over Nullville tastes like rust. On the sidewalk lies the first body: a row, torn from the victims table. The Coroner kneels beside it and asks what statement could have pulled it out.',
    es: 'La lluvia sobre Nullville sabe a óxido. En la acera yace el primer cuerpo: una fila arrancada de la tabla victims. El Forense se arrodilla y pregunta qué sentencia pudo sacarla.',
  },
  prompt: {
    en: 'You must READ rows without changing anything. Which statement retrieves only the rows where cause_of_death is exactly "stake"?',
    es: 'Debes LEER filas sin cambiar nada. ¿Qué sentencia recupera solo las filas donde cause_of_death es exactamente "stake"?',
  },
  hint: { en: 'One of these destroys data instead of reading it.', es: 'Una de estas destruye datos en vez de leerlos.' },
  explain: {
    en: 'SELECT only reads. WHERE filters rows by a condition before returning them. UPDATE modifies and DELETE removes - never use them to investigate.',
    es: 'SELECT solo lee. WHERE filtra filas por una condición antes de devolverlas. UPDATE modifica y DELETE elimina - nunca los uses para investigar.',
  },
  options: [
    { en: "UPDATE victims SET cause_of_death = 'stake'", es: "UPDATE victims SET cause_of_death = 'stake'" },
    { en: "SELECT * FROM victims WHERE cause_of_death = 'stake'", es: "SELECT * FROM victims WHERE cause_of_death = 'stake'" },
    { en: 'SELECT * FROM victims ORDER BY cause_of_death', es: 'SELECT * FROM victims ORDER BY cause_of_death' },
    { en: "DELETE FROM victims WHERE cause_of_death = 'stake'", es: "DELETE FROM victims WHERE cause_of_death = 'stake'" },
  ],
  answerIndex: 1,
}

const p2: Puzzle = {
  id: 'l1-s1-p2',
  kind: 'query',
  engine: 'sql',
  xp: 200,
  title: { en: 'Name the Dead', es: 'Nombra a los muertos' },
  story: {
    en: 'The Coroner hands you a ledger gone soft with blood. Twelve names, twelve families waiting. The candle gutters; below the morgue something knocks.',
    es: 'El Forense te entrega un registro blando de sangre. Doce nombres, doce familias esperando. La vela parpadea; bajo la morgue algo golpea.',
  },
  prompt: {
    en: 'Table: victims(id, name, alley, cause_of_death). Return ONLY the name column of every victim.',
    es: 'Tabla: victims(id, name, alley, cause_of_death). Devuelve SOLO la columna name de todas las víctimas.',
  },
  solution: 'SELECT name FROM victims',
  hint: { en: 'Projection: list the column after SELECT.', es: 'Proyección: lista la columna después de SELECT.' },
  explain: {
    en: 'SELECT name PROJECTS one column: every row comes back but only the name field survives.',
    es: 'SELECT name PROYECTA una columna: vuelven todas las filas pero solo el campo name sobrevive.',
  },
  tables: [VICTIMS_TABLE],
}

const p3: Puzzle = {
  id: 'l1-s1-p3',
  kind: 'query',
  engine: 'sql',
  xp: 250,
  title: { en: 'The Tallow Lane Trail', es: 'El rastro de Tallow Lane' },
  story: {
    en: 'Three corpses share one alley. The Coroner circles it in red ink: "Whatever hunts, it hunts here. Pull me every body from Tallow Lane."',
    es: 'Tres cadáveres comparten un callejón. El Forense lo rodea en tinta roja: "Lo que sea que caza, caza aquí. Tráeme cada cuerpo de Tallow Lane".',
  },
  prompt: {
    en: 'Return every column of the victims whose alley is exactly "Tallow Lane".',
    es: 'Devuelve todas las columnas de las víctimas cuyo alley sea exactamente "Tallow Lane".',
  },
  solution: "SELECT * FROM victims WHERE alley = 'Tallow Lane'",
  hint: { en: '* means every column; WHERE keeps matching rows.', es: '* significa todas las columnas; WHERE conserva las filas que coinciden.' },
  explain: {
    en: '* projects all columns while WHERE alley = X keeps only rows whose alley equals the literal string. Text literals need quotes.',
    es: '* proyecta todas las columnas mientras WHERE alley = X conserva solo las filas cuyo alley coincide con el literal. Los textos necesitan comillas.',
  },
  tables: [VICTIMS_TABLE],
}

const p4: Puzzle = {
  id: 'l1-s1-p4',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'The Same Name Twice', es: 'El mismo nombre dos veces' },
  story: {
    en: 'Witness statements repeat the same four names over and over, ink smeared with tears. The Scribe wants a clean list: each name once, no echoes.',
    es: 'Los testimonios repiten los mismos cuatro nombres, la tinta borrada por lágrimas. La Escribana quiere una lista limpia: cada nombre una sola vez, sin ecos.',
  },
  prompt: {
    en: 'Which keyword makes SELECT return only UNIQUE values, removing duplicates?',
    es: '¿Qué palabra clave hace que SELECT devuelva solo valores ÚNICOS, sin duplicados?',
  },
  hint: { en: 'It literally means clearly different.', es: 'Literalmente significa claramente diferente.' },
  explain: {
    en: 'DISTINCT collapses duplicate values into one row per unique value: SELECT DISTINCT name shows each witness once.',
    es: 'DISTINCT colapsa duplicados en una fila por valor único: SELECT DISTINCT name muestra cada testigo una vez.',
  },
  options: [
    { en: 'UNIQUE', es: 'UNIQUE' },
    { en: 'DISTINCT', es: 'DISTINCT' },
    { en: 'SINGLE', es: 'SINGLE' },
    { en: 'NODUP', es: 'NODUP' },
  ],
  answerIndex: 1,
}

const p5: Puzzle = {
  id: 'l1-s1-p5',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'The Newest Ghost', es: 'El fantasma más nuevo' },
  story: {
    en: 'The killer still smells of the last crime. The Coroner needs the freshest entry in the ledger before the trail goes cold at sunrise.',
    es: 'El asesino aún huele al último crimen. El Forense necesita la entrada más reciente del registro antes de que el rastro se enfríe al amanecer.',
  },
  prompt: {
    en: 'Return ONLY the name of the most recently dead victim: sort by died_on descending and take just the first row.',
    es: 'Devuelve SOLO el nombre de la víctima muerta más recientemente: ordena por died_on descendente y toma solo la primera fila.',
  },
  solution: 'SELECT name FROM victims ORDER BY died_on DESC LIMIT 1',
  hint: { en: 'ORDER BY ... DESC sorts newest first; LIMIT 1 cuts the rest.', es: 'ORDER BY ... DESC ordena del más nuevo al más viejo; LIMIT 1 corta el resto.' },
  explain: {
    en: 'ORDER BY sorts the result set; DESC flips to descending. LIMIT 1 keeps only the first row after sorting - the newest death.',
    es: 'ORDER BY ordena el resultado; DESC invierte a descendente. LIMIT 1 conserva solo la primera fila tras ordenar - la muerte más reciente.',
  },
  tables: [VICTIMS_TABLE],
}

const p6: Puzzle = {
  id: 'l1-s1-p6',
  kind: 'trivia',
  engine: 'sql',
  xp: 150,
  title: { en: 'A Handful of Rows', es: 'Un puñado de filas' },
  story: {
    en: '"Show me ten rows, no more," the Coroner says, pinching the air. "The page can only hold so much blood."',
    es: '"Muéstrame diez filas, no más", dice el Forense pellizcando el aire. "La página solo aguanta tanta sangre".',
  },
  prompt: {
    en: 'Which clause caps how many rows a query returns?',
    es: '¿Qué cláusula limita cuántas filas devuelve una consulta?',
  },
  hint: { en: 'Its name is a limit.', es: 'Su nombre es un límite.' },
  explain: {
    en: 'LIMIT n truncates the result to n rows. It runs AFTER sorting, so LIMIT 1 + ORDER BY gives you the top row.',
    es: 'LIMIT n trunca el resultado a n filas. Se ejecuta DESPUÉS de ordenar, así que LIMIT 1 + ORDER BY te da la fila superior.',
  },
  options: [
    { en: 'TOP ONLY', es: 'TOP ONLY' },
    { en: 'LIMIT', es: 'LIMIT' },
    { en: 'CAP', es: 'CAP' },
    { en: 'FIRST', es: 'FIRST' },
  ],
  answerIndex: 1,
}

const p7: Puzzle = {
  id: 'l1-s1-p7',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'Two Conditions, One Killer', es: 'Dos condiciones, un asesino' },
  story: {
    en: 'The pattern emerges: strangled, and no longer young. The Coroner draws two circles that overlap on one corpse. "Give me everyone inside both circles."',
    es: 'El patrón emerge: estrangulados y ya no jóvenes. El Forense dibuja dos círculos que se cruzan en un cadáver. "Tráeme a todos dentro de ambos círculos".',
  },
  prompt: {
    en: 'Return every column of victims whose cause_of_death is "strangulation" AND whose age is greater than 30.',
    es: 'Devuelve todas las columnas de las víctimas cuyo cause_of_death sea "strangulation" Y cuya edad sea mayor a 30.',
  },
  solution: "SELECT * FROM victims WHERE cause_of_death = 'strangulation' AND age > 30",
  hint: { en: 'AND requires both sides to be true at once.', es: 'AND exige que ambos lados sean verdaderos a la vez.' },
  explain: {
    en: 'WHERE supports boolean logic: AND keeps only rows satisfying BOTH conditions, OR accepts either. Numbers compare without quotes.',
    es: 'WHERE soporta lógica booleana: AND conserva solo filas que cumplen AMBAS condiciones, OR acepta cualquiera. Los números se comparan sin comillas.',
  },
  tables: [VICTIMS_TABLE],
}

const p8: Puzzle = {
  id: 'l1-s1-p8',
  kind: 'trivia',
  engine: 'sql',
  xp: 250,
  title: { en: 'The Unknown Cause', es: 'La causa desconocida' },
  story: {
    en: 'Ivo Renn lies in the ledger with an empty cause_of_death. The Coroner whispers: "No one knows what stopped his heart. Find every row like him - the blanks."',
    es: 'Ivo Renn yace en el registro con cause_of_death vacío. El Forense susurra: "Nadie sabe qué detuvo su corazón. Encuentra cada fila como él - los vacíos".',
  },
  prompt: {
    en: 'cause_of_death can be NULL (no value at all). Which condition correctly finds those rows?',
    es: 'cause_of_death puede ser NULL (sin valor alguno). ¿Qué condición encuentra correctamente esas filas?',
  },
  hint: { en: 'NULL is not equal to anything, not even to itself.', es: 'NULL no es igual a nada, ni siquiera a sí mismo.' },
  explain: {
    en: '= NULL always fails because NULL compares unknown. The only correct test is IS NULL (or IS NOT NULL for the opposite).',
    es: '= NULL siempre falla porque NULL compara como desconocido. La única prueba correcta es IS NULL (o IS NOT NULL para lo contrario).',
  },
  options: [
    { en: "WHERE cause_of_death = NULL", es: "WHERE cause_of_death = NULL" },
    { en: "WHERE cause_of_death IS NULL", es: "WHERE cause_of_death IS NULL" },
    { en: "WHERE cause_of_death == NULL", es: "WHERE cause_of_death == NULL" },
    { en: "WHERE cause_of_death LIKE NULL", es: "WHERE cause_of_death LIKE NULL" },
  ],
  answerIndex: 1,
}

const p9: Puzzle = {
  id: 'l1-s1-p9',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'Initials in the Fog', es: 'Iniciales en la niebla' },
  story: {
    en: 'A dying witness scratches one letter on the wall: M. The Coroner tilts his lantern. "Every soul whose name begins with M. Bring them in for questioning."',
    es: 'Un testigo moribundo rasca una letra en el muro: M. El Forense inclina su farol. "Todo alma cuyo nombre empiece con M. Tráelos a declarar".',
  },
  prompt: {
    en: 'Return every column of victims whose name starts with the letter M (use LIKE).',
    es: 'Devuelve todas las columnas de las víctimas cuyo nombre empiece con M (usa LIKE).',
  },
  solution: "SELECT * FROM victims WHERE name LIKE 'M%'",
  hint: { en: '% matches any tail; anchor the M at the start.', es: '% coincide con cualquier cola; ancla la M al inicio.' },
  explain: {
    en: 'LIKE does pattern matching: % stands for any sequence of characters. M% means first letter M followed by anything.',
    es: 'LIKE hace coincidencia de patrones: % representa cualquier secuencia de caracteres. M% significa primera letra M seguida de lo que sea.',
  },
  tables: [VICTIMS_TABLE],
}

const p10: Puzzle = {
  id: 'l1-s1-p10',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'Two Alleys, One List', es: 'Dos callejones, una lista' },
  story: {
    en: 'The hunt narrows to two alleys. The Scribe offers a shortcut before your hand cramps writing OR over and over.',
    es: 'La cacería se estrecha a dos callejones. La Escribana ofrece un atajo antes de que tu mano se acalore escribiendo OR una y otra vez.',
  },
  prompt: {
    en: 'Which clause cleanly tests membership in a list: alley equals Tallow Lane OR Gallows Row?',
    es: '¿Qué cláusula prueba pertenencia a una lista de forma limpia: alley igual a Tallow Lane o Gallows Row?',
  },
  hint: { en: 'Think of it as checking if a value is IN a list.', es: 'Piénsalo como verificar si un valor está EN una lista.' },
  explain: {
    en: "WHERE alley IN ('Tallow Lane','Gallows Row') is exactly equivalent to two OR comparisons, but shorter and easier to read.",
    es: "WHERE alley IN ('Tallow Lane','Gallows Row') equivale exactamente a dos comparaciones OR, pero más corto y legible.",
  },
  options: [
    { en: "alley CONTAINS ('Tallow Lane','Gallows Row')", es: "alley CONTAINS ('Tallow Lane','Gallows Row')" },
    { en: "alley IN ('Tallow Lane','Gallows Row')", es: "alley IN ('Tallow Lane','Gallows Row')" },
    { en: "alley OF ('Tallow Lane','Gallows Row')", es: "alley OF ('Tallow Lane','Gallows Row')" },
    { en: "alley LIST ('Tallow Lane','Gallows Row')", es: "alley LIST ('Tallow Lane','Gallows Row')" },
  ],
  answerIndex: 1,
}

export const S1_NODE: MapNode = {
  id: 'l1-s1',
  name: { en: 'I · Avenida SELECT', es: 'I · Avenida SELECT' },
  subtitle: {
    en: 'Ten lessons in reading the dead: SELECT, WHERE, sorting and patterns.',
    es: 'Diez lecciones para leer a los muertos: SELECT, WHERE, orden y patrones.',
  },
  scene: 'street',
  npc: 'coroner',
  isBoss: false,
  learn: [
    { en: 'Read rows with SELECT and filter them with WHERE', es: 'Lee filas con SELECT y filtralas con WHERE' },
    { en: 'Sort and cap results: ORDER BY, DESC, LIMIT', es: 'Ordena y limita resultados: ORDER BY, DESC, LIMIT' },
    { en: 'Patterns and lists: LIKE, IN and IS NULL', es: 'Patrones y listas: LIKE, IN e IS NULL' },
    { en: 'Projection: choosing exactly which columns survive', es: 'Proyección: elegir exactamente qué columnas sobreviven' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
