import type { MapNode, Puzzle } from '../types'

const BODIES_TABLE = {
  name: 'bodies',
  columns: ['id', 'alley', 'cause_of_death', 'coins'],
  rows: [
    ['1', 'Tallow Lane', 'strangulation', '50'],
    ['2', 'Gallows Row', 'stake', '20'],
    ['3', 'Ash Court', 'drowning', '35'],
    ['4', 'Tallow Lane', 'strangulation', '55'],
    ['5', 'Gallows Row', 'missing', '10'],
    ['6', 'Tallow Lane', 'strangulation', '60'],
    ['7', 'Ash Court', 'strangulation', '45'],
    ['8', 'Gallows Row', 'burning', '30'],
  ],
}

const p1: Puzzle = {
  id: 'l1-s3-p1',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'Count the Bodies per Alley', es: 'Cuenta los cuerpos por callejón' },
  story: {
    en: 'The Morgue of Aggregates stacks its dead by origin. The Scribe keeps tally with a quill dipped in something too dark for ink. Give her the count, alley by alley.',
    es: 'La Morgue de Agregados apila a sus muertos por origen. La Escribana lleva la cuenta con una pluma remojada en algo demasiado oscuro para ser tinta. Dale el conteo, callejón por callejón.',
  },
  prompt: {
    en: 'Table: bodies(id, alley, cause_of_death, coins). Return each alley with its number of rows (column total). Use GROUP BY.',
    es: 'Tabla: bodies(id, alley, cause_of_death, coins). Devuelve cada callejón con su número de filas (columna total). Usa GROUP BY.',
  },
  solution: 'SELECT alley, COUNT(*) AS total FROM bodies GROUP BY alley',
  accept: ['select alley, count(*) as total from victims group by alley'],
  hint: { en: 'COUNT(*) with GROUP BY alley; alias the count as total.', es: 'COUNT(*) con GROUP BY alley; dale el alias total al conteo.' },
  explain: {
    en: 'GROUP BY alley makes one bucket per alley and COUNT(*) counts the rows inside each bucket. AS total renames the count column.',
    es: 'GROUP BY alley crea un grupo por callejón y COUNT(*) cuenta las filas dentro de cada grupo. AS total renombra la columna del conteo.',
  },
  tables: [BODIES_TABLE],
}

const p2: Puzzle = {
  id: 'l1-s3-p2',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'The Gatekeeper Riddle', es: 'El acertijo del portero' },
  story: {
    en: 'The Scribe blocks the stairwell with her ledger. Answer, or join the archives. Her eyes are stitched shut; she reads anyway.',
    es: 'La Escribana bloquea la escalera con su registro. Responde, o únete al archivo. Tiene los ojos cosidos; lee de todos modos.',
  },
  prompt: { en: 'Which clause filters groups AFTER aggregation has already happened?', es: '¿Qué cláusula filtra grupos DESPUÉS de que la agregación ya ocurrió?' },
  hint: { en: 'One filters rows before grouping; the other filters groups after.', es: 'Una filtra filas antes de agrupar; la otra filtra grupos después.' },
  explain: {
    en: 'WHERE filters rows before grouping; HAVING filters whole groups after COUNT/SUM already ran.',
    es: 'WHERE filtra filas antes de agrupar; HAVING filtra grupos completos después de que COUNT/SUM ya se ejecutaron.',
  },
  options: [
    { en: 'WHERE', es: 'WHERE' },
    { en: 'HAVING', es: 'HAVING' },
    { en: 'ORDER BY', es: 'ORDER BY' },
    { en: 'LIMIT', es: 'LIMIT' },
  ],
  answerIndex: 1,
}

const p3: Puzzle = {
  id: 'l1-s3-p3',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'The Widow Pension Fund', es: 'El fondo de pensiones de las viudas' },
  story: {
    en: 'Each corpse carried coins for whoever mourns them. The city owes the widows exactly one number: everything, added up. The Scribe extends her palm.',
    es: 'Cada cadáver cargaba monedas para quien los llore. La ciudad les debe a las viudas exactamente un número: todo, sumado. La Escribana extiende la palma.',
  },
  prompt: {
    en: 'Table: bodies(id, alley, cause_of_death, coins). Return ONE value: the total of all coins added together.',
    es: 'Tabla: bodies(id, alley, cause_of_death, coins). Devuelve UN valor: el total de todas las monedas sumadas.',
  },
  solution: 'SELECT SUM(coins) FROM bodies',
  accept: ['select sum(coins) from victims'],
  hint: { en: 'SUM adds every value of one column.', es: 'SUM suma todos los valores de una columna.' },
  explain: {
    en: 'SUM(coins) collapses the whole column into a single total. Without GROUP BY it aggregates the entire table into one row.',
    es: 'SUM(coins) colapsa la columna completa en un solo total. Sin GROUP BY agrega toda la tabla en una fila.',
  },
  tables: [BODIES_TABLE],
}

const p4: Puzzle = {
  id: 'l1-s3-p4',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'The Average Corpse', es: 'El cadáver promedio' },
  story: {
    en: '"How old were they, on average?" asks the priest, doing mental arithmetic over open graves. The Scribe knows an aggregate for that.',
    es: '"¿Qué edad tenían, en promedio?", pregunta el sacerdote haciendo cálculos mentales sobre fosas abiertas. La Escribana conoce un agregado para eso.',
  },
  prompt: {
    en: 'Victims have an age column. Which aggregate returns the AVERAGE age?',
    es: 'Las víctimas tienen columna age. ¿Qué agregado devuelve la edad PROMEDIO?',
  },
  hint: { en: 'Three letters, starts with A.', es: 'Tres letras, empieza con A.' },
  explain: {
    en: 'AVG(age) sums all ages and divides by the count - the arithmetic mean of the column.',
    es: 'AVG(age) suma todas las edades y divide entre el conteo - la media aritmética de la columna.',
  },
  options: [
    { en: 'MEAN(age)', es: 'MEAN(age)' },
    { en: 'MED(age)', es: 'MED(age)' },
    { en: 'AVG(age)', es: 'AVG(age)' },
    { en: 'MID(age)', es: 'MID(age)' },
  ],
  answerIndex: 2,
}

const p5: Puzzle = {
  id: 'l1-s3-p5',
  kind: 'query',
  engine: 'sql',
  xp: 350,
  title: { en: 'Two Dimensions of Death', es: 'Dos dimensiones de la muerte' },
  story: {
    en: 'Not all alleys kill the same way. The Scribe wants the grid: how each alley pairs with each manner of dying, counted.',
    es: 'No todos los callejones matan igual. La Escribana quiere la cuadrícula: cómo se cruza cada callejón con cada forma de morir, contado.',
  },
  prompt: {
    en: 'Return alley, cause_of_death and the row count (column total) for every combination of both.',
    es: 'Devuelve alley, cause_of_death y el conteo de filas (columna total) para cada combinación de ambos.',
  },
  solution: 'SELECT alley, cause_of_death, COUNT(*) AS total FROM bodies GROUP BY alley, cause_of_death',
  hint: { en: 'GROUP BY accepts several columns separated by commas.', es: 'GROUP BY acepta varias columnas separadas por comas.' },
  explain: {
    en: 'Multiple columns in GROUP BY create one bucket per UNIQUE COMBINATION: Tallow Lane + strangulation is its own bucket, separate from Ash Court + strangulation.',
    es: 'Varias columnas en GROUP BY crean un grupo por COMBINACIÓN ÚNICA: Tallow Lane + estrangulamiento es su propio grupo, distinto de Ash Court + estrangulamiento.',
  },
  tables: [BODIES_TABLE],
}

const p6: Puzzle = {
  id: 'l1-s3-p6',
  kind: 'query',
  engine: 'sql',
  xp: 400,
  title: { en: 'Only the Killing Alleys', es: 'Solo los callejones asesinos' },
  story: {
    en: 'One body could be an accident. The Scribe only wants streets that crossed three corpses or more - the true killing grounds.',
    es: 'Un cuerpo podría ser un accidente. La Escribana solo quiere calles que cruzaron tres o más cadáveres - los verdaderos campos de muerte.',
  },
  prompt: {
    en: 'Return each alley with its total, keeping ONLY alleys whose count exceeds 3.',
    es: 'Devuelve cada callejón con su total, conservando SOLO los callejones cuyo conteo supere 3.',
  },
  solution: 'SELECT alley, COUNT(*) AS total FROM bodies GROUP BY alley HAVING COUNT(*) > 3',
  hint: { en: 'Filtering on an aggregate needs HAVING after GROUP BY.', es: 'Filtrar sobre un agregado requiere HAVING después de GROUP BY.' },
  explain: {
    en: 'HAVING runs after grouping and can reference aggregates like COUNT(*), unlike WHERE which only sees raw rows.',
    es: 'HAVING corre tras agrupar y puede referenciar agregados como COUNT(*), a diferencia de WHERE que solo ve filas crudas.',
  },
}

const p7: Puzzle = {
  id: 'l1-s3-p7',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'Youngest of the Dead', es: 'El más joven de los muertos' },
  story: {
    en: 'Nineteen years old, name still wet behind the ears. The priest wants to know: what function reveals the youngest age buried here?',
    es: 'Diecinueve años, nombre todavía con leche en los labios. El sacerdote quiere saber: ¿qué función revela la edad más joven enterrada aquí?',
  },
  prompt: {
    en: 'Victims have an age column. Which aggregate returns the SMALLEST value?',
    es: 'Las víctimas tienen columna age. ¿Qué agregado devuelve el valor MÁS PEQUEÑO?',
  },
  hint: { en: 'Minimum, three letters plus parenthesis.', es: 'Mínimo, tres letras más paréntesis.' },
  explain: {
    en: 'MIN(age) returns the smallest value; MAX returns the largest. Both ignore NULLs silently.',
    es: 'MIN(age) devuelve el valor más pequeño; MAX el mayor. Ambos ignoran los NULL en silencio.',
  },
  options: [
    { en: 'BOTTOM(age)', es: 'BOTTOM(age)' },
    { en: 'LEAST(age)', es: 'LEAST(age)' },
    { en: 'FIRST(age)', es: 'FIRST(age)' },
    { en: 'MIN(age)', es: 'MIN(age)' },
  ],
  answerIndex: 3,
}

const p8: Puzzle = {
  id: 'l1-s3-p8',
  kind: 'mystery',
  engine: 'sql',
  xp: 400,
  title: { en: 'Signature of the Killer', es: 'La firma del asesino' },
  story: {
    en: 'Serial patterns repeat. Read the morgue ledger by eye - no query needed - and tell the Coroner which cause of death appears MOST often. That repetition is a signature.',
    es: 'Los patrones en serie se repiten. Lee el registro de la morgue a ojo - sin consulta - y dile al Forense qué causa de muerte aparece MÁS veces. Esa repetición es una firma.',
  },
  prompt: {
    en: 'Count the rows per cause_of_death in the table below. Which cause dominates?',
    es: 'Cuenta las filas por cause_of_death en la tabla inferior. ¿Qué causa domina?',
  },
  hint: { en: 'Tally with your eyes: four rows share one cause.', es: 'Lleva el conteo a ojo: cuatro filas comparten una causa.' },
  explain: {
    en: 'Strangulation appears four times, more than any other cause - equivalent to SELECT cause_of_death, COUNT(*) ... GROUP BY cause_of_death ORDER BY COUNT(*) DESC LIMIT 1.',
    es: 'Estrangulamiento aparece cuatro veces, más que ninguna otra - equivale a SELECT cause_of_death, COUNT(*) ... GROUP BY cause_of_death ORDER BY COUNT(*) DESC LIMIT 1.',
  },
  tables: [
    {
      name: 'bodies',
      columns: ['id', 'cause_of_death'],
      rows: [
        ['1', 'strangulation'],
        ['2', 'stake'],
        ['3', 'drowning'],
        ['4', 'strangulation'],
        ['5', 'burning'],
        ['6', 'strangulation'],
        ['7', 'stake'],
        ['8', 'strangulation'],
      ],
    },
  ],
  options: [
    { en: 'burning', es: 'burning' },
    { en: 'strangulation', es: 'strangulation' },
    { en: 'stake', es: 'stake' },
    { en: 'drowning', es: 'drowning' },
  ],
  answerIndex: 1,
}

const p9: Puzzle = {
  id: 'l1-s3-p9',
  kind: 'query',
  engine: 'sql',
  xp: 450,
  title: { en: 'The Worst Street Wins', es: 'La peor calle gana' },
  story: {
    en: 'The gallows are being rebuilt on whichever street bleeds the most. One query decides where the next execution platform rises.',
    es: 'Reconstruyen la horca en la calle que más sangra. Una consulta decide dónde se alzará la próxima plataforma de ejecución.',
  },
  prompt: {
    en: 'Return the single alley with the highest body count: group, order by the count descending, keep only first place (columns: alley, total).',
    es: 'Devuelve el único callejón con más cuerpos: agrupa, ordena por conteo descendente, conserva solo el primer lugar (columnas: alley, total).',
  },
  solution: 'SELECT alley, COUNT(*) AS total FROM bodies GROUP BY alley ORDER BY total DESC LIMIT 1',
  hint: { en: 'Chain them: GROUP BY, then ORDER BY total DESC, then LIMIT 1.', es: 'Encadénalas: GROUP BY, luego ORDER BY total DESC, luego LIMIT 1.' },
  explain: {
    en: 'Pipelines compose left to right: buckets form, get sorted by their size, and LIMIT keeps the champion - the deadliest alley.',
    es: 'Los pipelines se componen en orden: se forman los grupos, se ordenan por tamaño y LIMIT conserva al campeón - el callejón más letal.',
  },
}

const p10: Puzzle = {
  id: 'l1-s3-p10',
  kind: 'trivia',
  engine: 'sql',
  xp: 250,
  title: { en: 'Order of Execution', es: 'Orden de ejecución' },
  story: {
    en: 'The Scribe draws a pipeline on the floor in chalk: gates, buckets, judges, labels, sorting. "SQL looks like it starts with SELECT," she says. "It lies."',
    es: 'La Escribana dibuja un pipeline en el piso con tiza: filtros, baldes, jueces, etiquetas, orden. "SQL parece empezar con SELECT", dice. "Miente".',
  },
  prompt: {
    en: 'Which is the correct logical execution order?',
    es: '¿Cuál es el orden lógico correcto de ejecución?',
  },
  hint: { en: 'Rows are filtered first, grouped second, groups judged third.', es: 'Primero se filtran filas, segundo se agrupan, tercero se juzgan grupos.' },
  explain: {
    en: 'Real order: FROM loads rows, WHERE filters them, GROUP BY buckets, HAVING judges buckets, SELECT projects, ORDER BY sorts, LIMIT cuts.',
    es: 'Orden real: FROM carga filas, WHERE filtra, GROUP BY agrupa, HAVING juzga grupos, SELECT proyecta, ORDER BY ordena, LIMIT corta.',
  },
  options: [
    { en: 'SELECT → FROM → WHERE → GROUP BY → HAVING', es: 'SELECT → FROM → WHERE → GROUP BY → HAVING' },
    { en: 'FROM → WHERE → GROUP BY → HAVING → SELECT', es: 'FROM → WHERE → GROUP BY → HAVING → SELECT' },
    { en: 'FROM → GROUP BY → WHERE → HAVING → SELECT', es: 'FROM → GROUP BY → WHERE → HAVING → SELECT' },
    { en: 'WHERE → FROM → HAVING → GROUP BY → SELECT', es: 'WHERE → FROM → HAVING → GROUP BY → SELECT' },
  ],
  answerIndex: 1,
}

export const S3_NODE: MapNode = {
  id: 'l1-s3',
  name: { en: 'III · Morgue de Agregados', es: 'III · Morgue de Agregados' },
  subtitle: {
    en: 'Ten lessons in counting the dead: SUM, AVG, MIN, GROUP BY, HAVING.',
    es: 'Diez lecciones contando muertos: SUM, AVG, MIN, GROUP BY, HAVING.',
  },
  scene: 'morgue',
  npc: 'scribe',
  isBoss: false,
  learn: [
    { en: 'COUNT, SUM, AVG, MIN and MAX over the dead', es: 'COUNT, SUM, AVG, MIN y MAX sobre los muertos' },
    { en: 'GROUP BY with one and several columns', es: 'GROUP BY con una y varias columnas' },
    { en: 'HAVING: judging groups after the tally', es: 'HAVING: juzgar grupos después del conteo' },
    { en: 'The real execution order of a SQL query', es: 'El orden real de ejecución de una consulta SQL' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
