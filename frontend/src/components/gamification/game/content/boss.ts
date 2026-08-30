import type { MapNode, Puzzle } from '../types'

const p1: Puzzle = {
  id: 'l1-boss-p1',
  kind: 'trivia',
  engine: 'sql',
  xp: 400,
  title: { en: 'The Deadlock King Awakens', es: 'El Rey del Deadlock despierta' },
  story: {
    en: 'On the bone chair sits the thing wearing the Quesera crown: the Deadlock King, two transactions gripping his throat forever. He laughs and the candles die.',
    es: 'En el trono de huesos está la cosa que usa la corona de la Quesera: el Rey del Deadlock, dos transacciones aferradas a su garganta por siempre. Ríe y las velas mueren.',
  },
  prompt: {
    en: 'Two sessions hold locks on each other rows and wait forever. What is this condition called?',
    es: 'Dos sesiones retienen candados sobre las filas de la otra y esperan para siempre. ¿Cómo se llama esta condición?',
  },
  hint: { en: 'Dead plus the thing that blocks.', es: 'Dead más lo que bloquea.' },
  explain: {
    en: 'A DEADLOCK is a circular wait: each transaction holds a lock the other needs. The engine detects it and aborts one side to break the cycle.',
    es: 'Un DEADLOCK es una espera circular: cada transacción retiene un candado que la otra necesita. El motor lo detecta y cancela a una para romper el ciclo.',
  },
  options: [
    { en: 'Race condition', es: 'Race condition' },
    { en: 'Deadlock', es: 'Deadlock' },
    { en: 'Dirty read', es: 'Dirty read' },
    { en: 'Lock escalation', es: 'Lock escalation' },
  ],
  answerIndex: 1,
}

const p2: Puzzle = {
  id: 'l1-boss-p2',
  kind: 'query',
  engine: 'sql',
  xp: 500,
  title: { en: 'Chain of Three Tables', es: 'Cadena de tres tablas' },
  story: {
    en: 'The King extends a hand of chained keys. Three tables. One name. Speak the full incantation or be normalized into dust.',
    es: 'El Rey extiende una mano de llaves encadenadas. Tres tablas. Un nombre. Pronuncia el conjuro completo o sé normalizado en polvo.',
  },
  prompt: {
    en: 'Tables: persons(id, name), roles(person_id, job), tools(owner_id, residue). Return the name of every person whose job is butcher and whose tools leave residue containing whey (LIKE). Join all relations.',
    es: 'Tablas: persons(id, name), roles(person_id, job), tools(owner_id, residue). Devuelve el name de cada persona cuyo job sea butcher y cuyas herramientas dejen residuo que contenga whey (LIKE). Une todas las relaciones.',
  },
  solution:
    "SELECT p.name FROM persons p JOIN roles r ON p.id = r.person_id JOIN tools t ON t.owner_id = p.id WHERE r.job = 'butcher' AND t.residue LIKE '%whey%'",
  accept: [
    "select p.name from persons p join roles r on r.person_id = p.id join tools t on t.owner_id = p.id where r.job = 'butcher' and t.residue like '%whey%'",
    "SELECT persons.name FROM persons JOIN roles ON persons.id = roles.person_id JOIN tools ON tools.owner_id = persons.id WHERE roles.job = 'butcher' AND tools.residue LIKE '%whey%'",
    "select p.name from persons p join tools t on t.owner_id = p.id join roles r on r.person_id = p.id where r.job = 'butcher' and t.residue like '%whey%'",
  ],
  hint: { en: 'Two JOINs chained: persons-roles and persons-tools, then WHERE + LIKE.', es: 'Dos JOIN encadenados: persons-roles y persons-tools, luego WHERE + LIKE.' },
  explain: {
    en: 'Each JOIN chains one relation through its foreign key; LIKE %whey% matches any residue containing whey. Multi-table joins are just this pattern repeated.',
    es: 'Cada JOIN encadena una relación vía su clave foránea; LIKE %whey% coincide con cualquier residuo que contenga suero. Los joins multi-tabla repiten este patrón.',
  },
}

const p3: Puzzle = {
  id: 'l1-boss-p3',
  kind: 'mystery',
  engine: 'sql',
  xp: 600,
  title: { en: 'Verdict of the Bone Court', es: 'Veredicto de la Corte de Huesos' },
  story: {
    en: 'The King kneels, dissolving into ledgers. Read the final record, he whispers as he crumbles. Cross-reference weapon, night of the crime, and testimony - then pass sentence.',
    es: 'El Rey se arrodilla, disolviéndose en registros. Lee el expediente final, susurra mientras se deshace. Cruza arma, noche del crimen y testimonio - dicta sentencia.',
  },
  prompt: {
    en: 'Use all three tables. Only one suspect owns the murder weapon, worked the night of Jan 2, and matches the surviving witness account.',
    es: 'Usa las tres tablas. Solo un sospechoso posee el arma, trabajó la noche del 2 de enero y coincide con el relato de la testigo sobreviviente.',
  },
  hint: { en: 'weapon_owner_id names the culprit directly; verify with shifts and testimony.', es: 'weapon_owner_id nombra al culpable directo; verifica con shifts y testimony.' },
  explain: {
    en: 'Weapon W1 (cleaver, whey) points at owner 1; person 1 worked the night of Jan 2; the apprentice saw a cleaver, not a saw. Person 1: Aldous Vex.',
    es: 'El arma W1 (cuchillo, suero) apunta al dueño 1; la persona 1 trabajó la noche del 2 de enero; el aprendiz vio un cuchillo, no una sierra. Persona 1: Aldous Vex.',
  },
  tables: [
    {
      name: 'weapons',
      columns: ['id', 'kind', 'residue', 'weapon_owner_id'],
      rows: [
        ['W1', 'cleaver', 'whey', '1'],
        ['W2', 'bone saw', 'formaldehyde', '2'],
        ['W3', 'iron cage', 'fur', '3'],
      ],
    },
    {
      name: 'shifts',
      columns: ['person_id', 'worked_night_jan2'],
      rows: [
        ['1', 'true'],
        ['2', 'false'],
        ['3', 'true'],
      ],
    },
    {
      name: 'testimony',
      columns: ['witness', 'account'],
      rows: [
        ['the apprentice', 'I saw a cleaver, not a saw'],
        ['the rat catcher', 'I was caging rats by the canal'],
      ],
    },
  ],
  options: [
    { en: 'Mother Grey', es: 'Mother Grey' },
    { en: 'Tobias Crumb', es: 'Tobias Crumb' },
    { en: 'Aldous Vex', es: 'Aldous Vex' },
    { en: 'Silas Marsh', es: 'Silas Marsh' },
  ],
  answerIndex: 2,
}

const p4: Puzzle = {
  id: 'l1-boss-p4',
  kind: 'trivia',
  engine: 'sql',
  xp: 350,
  title: { en: 'The Four Sacred Letters', es: 'Las cuatro letras sagradas' },
  story: {
    en: 'Before the court accepts your verdict, recite the oath every ledger swears by: four properties, one word each, carved above the throne.',
    es: 'Antes de aceptar tu veredicto, la corte exige el juramento que todo registro jura: cuatro propiedades, una palabra cada una, talladas sobre el trono.',
  },
  prompt: {
    en: 'What does ACID stand for in databases?',
    es: '¿Qué significa ACID en bases de datos?',
  },
  hint: { en: 'Atomicity, Consistency... only two remain.', es: 'Atomicidad, Consistencia... solo faltan dos.' },
  explain: {
    en: 'ACID: Atomicity (all or nothing), Consistency (rules always hold), Isolation (concurrent transactions do not trample), Durability (committed data survives crashes).',
    es: 'ACID: Atomicidad (todo o nada), Consistencia (las reglas siempre valen), Aislamiento (transacciones concurrentes no se pisotean), Durabilidad (lo confirmado sobrevive caídas).',
  },
  options: [
    { en: 'Atomicity, Consistency, Isolation, Durability', es: 'Atomicidad, Consistencia, Aislamiento, Durabilidad' },
    { en: 'Access, Create, Index, Delete', es: 'Access, Create, Index, Delete' },
    { en: 'Aggregate, Commit, Insert, Drop', es: 'Aggregate, Commit, Insert, Drop' },
    { en: 'Accuracy, Cache, Integrity, Data', es: 'Accuracy, Cache, Integrity, Data' },
  ],
  answerIndex: 0,
}

const p5: Puzzle = {
  id: 'l1-boss-p5',
  kind: 'trivia',
  engine: 'sql',
  xp: 300,
  title: { en: 'Seal or Shatter', es: 'Sellar o quebrar' },
  story: {
    en: 'The clerk of the Bone Court holds two stamps over your confession: one makes it eternal, the other erases every word as if never spoken.',
    es: 'El escribano de la Corte sostiene dos sellos sobre tu confesión: uno la hace eterna, el otro borra cada palabra como si nunca se hubiera dicho.',
  },
  prompt: {
    en: 'Which pair of commands ends a transaction - making changes permanent or discarding them completely?',
    es: '¿Qué par de comandos termina una transacción - volviendo permanentes los cambios o descartándolos completamente?',
  },
  hint: { en: 'One commits to the deed; the other rolls it back.', es: 'Uno confirma el hecho; el otro lo revierte.' },
  explain: {
    en: 'COMMIT makes every change of the transaction permanent; ROLLBACK undoes them entirely. Between BEGIN and either stamp, changes stay private to you.',
    es: 'COMMIT vuelve permanentes todos los cambios de la transacción; ROLLBACK los deshace por completo. Entre BEGIN y cualquiera de los dos sellos, tus cambios son privados.',
  },
  options: [
    { en: 'SAVE / EXIT', es: 'SAVE / EXIT' },
    { en: 'PUSH / PULL', es: 'PUSH / PULL' },
    { en: 'COMMIT / ROLLBACK', es: 'COMMIT / ROLLBACK' },
    { en: 'FREEZE / MELT', es: 'FREEZE / MELT' },
  ],
  answerIndex: 2,
}

const p6: Puzzle = {
  id: 'l1-boss-p6',
  kind: 'trivia',
  engine: 'sql',
  xp: 300,
  title: { en: 'The Ledger With Tabs', es: 'El registro con pestañas' },
  story: {
    en: 'Ten thousand bodies and the Scribe finds any one of them in a blink. Her secret: alphabet tabs glued to the ledger edge. She never reads page one to reach page nine thousand.',
    es: 'Diez mil cuerpos y la Escribana encuentra cualquiera en un parpadeo. Su secreto: pestañas alfabéticas pegadas al canto del registro. Nunca lee desde la página uno para llegar a la nueve mil.',
  },
  prompt: {
    en: 'Which database structure makes searching a column dramatically faster, like tabs on a ledger?',
    es: '¿Qué estructura de base de datos hace la búsqueda por columna drásticamente más rápida, como pestañas en un registro?',
  },
  hint: { en: 'Same word as the thing at the back of a book.', es: 'La misma palabra que lo que va al final de un libro.' },
  explain: {
    en: 'An INDEX is a sorted lookup structure (usually a B-tree) on one or more columns: lookups jump straight to matching rows instead of scanning everything.',
    es: 'Un ÍNDICE es una estructura ordenada de búsqueda (normalmente B-tree) sobre una o más columnas: las búsquedas saltan directo a las filas coincidentes sin escanear todo.',
  },
  options: [
    { en: 'A VIEW', es: 'Un VIEW' },
    { en: 'An INDEX', es: 'Un INDEX' },
    { en: 'A TRIGGER', es: 'Un TRIGGER' },
    { en: 'A CURSOR', es: 'Un CURSOR' },
  ],
  answerIndex: 1,
}

const p7: Puzzle = {
  id: 'l1-boss-p7',
  kind: 'trivia',
  engine: 'sql',
  xp: 300,
  title: { en: 'No Cell Holds Two Souls', es: 'Ninguna celda guarda dos almas' },
  story: {
    en: 'A novice wrote three witness names inside ONE cell, comma-separated. The Scribe burns that page on sight. Every cell speaks exactly one atomic value.',
    es: 'Un novato escribió tres nombres de testigos dentro de UNA celda, separados por comas. La Escribana quema esa página a la vista. Cada celda dice exactamente un valor atómico.',
  },
  prompt: {
    en: 'Splitting repeating groups into their own rows/tables so every cell holds one atomic value is which normalization step?',
    es: 'Separar grupos repetidos a sus propias filas/tablas para que cada celda tenga un valor atómico es qué paso de normalización?',
  },
  hint: { en: 'It is the FIRST normal form.', es: 'Es la PRIMERA forma normal.' },
  explain: {
    en: 'First Normal Form (1NF) demands atomic cells: no lists crammed into one field. Higher forms chase partial and transitive dependencies next.',
    es: 'La Primera Forma Normal (1NF) exige celdas atómicas: nada de listas metidas en un campo. Las formas superiores persiguen dependencias parciales y transitivas después.',
  },
  options: [
    { en: 'Third normal form (3NF)', es: 'Tercera forma normal (3NF)' },
    { en: 'Second normal form (2NF)', es: 'Segunda forma normal (2NF)' },
    { en: 'First normal form (1NF)', es: 'Primera forma normal (1NF)' },
    { en: 'Boyce-Codd normal form', es: 'Forma normal de Boyce-Codd' },
  ],
  answerIndex: 2,
}

const p8: Puzzle = {
  id: 'l1-boss-p8',
  kind: 'query',
  engine: 'sql',
  xp: 450,
  title: { en: 'Close the File Forever', es: 'Cierra el expediente para siempre' },
  story: {
    en: 'Verdict rendered. The case file of Ivo Renn must read CLOSED before dawn - but change ONLY his row. Touch another and the Court adds you to it.',
    es: 'Veredicto dictado. El expediente de Ivo Renn debe leer CERRADO antes del amanecer - pero cambia SOLO su fila. Toca otra y la Corte te agrega a él.',
  },
  prompt: {
    en: 'Table: victims(id, ..., status). Write the statement setting status to "closed" for the victim whose id equals 5. Change nothing else.',
    es: 'Tabla: victims(id, ..., status). Escribe la sentencia que fija status a "closed" para la víctima cuyo id sea 5. No cambies nada más.',
  },
  solution: "UPDATE victims SET status = 'closed' WHERE id = 5",
  accept: ["update victims set status='closed' where id=5", "UPDATE victims SET status = \"closed\" WHERE id = 5"],
  hint: { en: 'UPDATE table SET column = value WHERE key = x. Never skip the WHERE.', es: 'UPDATE tabla SET columna = valor WHERE clave = x. Jamás omitas el WHERE.' },
  explain: {
    en: 'UPDATE rewrites existing rows: SET names the new values and WHERE picks the victims. UPDATE without WHERE would close EVERY file in the morgue.',
    es: 'UPDATE reescribe filas existentes: SET nombra los nuevos valores y WHERE elige a las víctimas. UPDATE sin WHERE cerraría TODOS los expedientes de la morgue.',
  },
}

const p9: Puzzle = {
  id: 'l1-boss-p9',
  kind: 'trivia',
  engine: 'redis',
  xp: 300,
  title: { en: 'Every Kingdom Its Weapon', es: 'Cada reino su arma' },
  story: {
    en: 'The dying King offers one last lesson between coughs of dust: choose the wrong store for the wrong job and your kingdom falls in production.',
    es: 'El Rey moribundo da su última lección entre tos de polvo: elegir el almacén equivocado para el trabajo equivocado hunde tu reino en producción.',
  },
  prompt: {
    en: 'You need a session cache with expiring keys AND a live leaderboard. Which pairing fits best?',
    es: 'Necesitas caché de sesiones con claves que expiran Y un ranking en vivo. ¿Qué combinación encaja mejor?',
  },
  hint: { en: 'Expiring keys and sorted scores are both Redis specialties.', es: 'Claves que expiran y puntajes ordenados son especialidades de Redis.' },
  explain: {
    en: 'Redis shines at ephemeral caches (SETEX) and leaderboards (sorted sets). SQL owns relational integrity; Mongo owns flexible documents.',
    es: 'Redis brilla en cachés efímeros (SETEX) y rankings (sorted sets). SQL posee la integridad relacional; Mongo los documentos flexibles.',
  },
  options: [
    { en: 'SQL for cache, Mongo for leaderboard', es: 'SQL para caché, Mongo para ranking' },
    { en: 'Redis for cache, Redis sorted sets for leaderboard', es: 'Redis para caché, sorted sets de Redis para ranking' },
    { en: 'Mongo for both, always', es: 'Mongo para ambos, siempre' },
    { en: 'Flat files for both, like our ancestors', es: 'Archivos planos para ambos, como nuestros ancestros' },
  ],
  answerIndex: 1,
}

const p10: Puzzle = {
  id: 'l1-boss-p10',
  kind: 'mystery',
  engine: 'mongo',
  xp: 500,
  title: { en: 'The Last Jar Standing', es: 'El último frasco en pie' },
  story: {
    en: 'Dawn breaks over Nullville. One jar in the warehouse still glows: whoever owns the ledger key inherits the whole borough - and its debts.',
    es: 'Amanece sobre Nullville. Un frasco del almacén aún brilla: quien posea la clave del registro hereda todo el barrio - y sus deudas.',
  },
  prompt: {
    en: 'Cross-reference both sources. The Redis key ledger:owner points at a suspects _id. Which resident inherits?',
    es: 'Cruza ambas fuentes. La clave Redis ledger:owner apunta al _id de un sospechoso. ¿Quién hereda?',
  },
  hint: { en: 'Read the value under ledger:owner first, then match it against the _id column.', es: 'Lee primero el valor bajo ledger:owner, luego empáralo con la columna _id.' },
  explain: {
    en: 'ledger:owner stores 2; the suspects document with _id 2 is Nula Sart. Cross-store references are common: a key-value pointer resolving into richer records elsewhere.',
    es: 'ledger:owner guarda 2; el documento de sospechosos con _id 2 es Nula Sart. Las referencias entre almacenes son comunes: un puntero llave-valor resolviendo hacia registros más ricos.',
  },
  tables: [
    {
      name: 'redis_keys',
      columns: ['key', 'value'],
      rows: [
        ['session:last', '"vex"'],
        ['ledger:owner', '"2"'],
        ['debt:total', '"9999"'],
      ],
    },
    {
      name: 'suspects (collection)',
      columns: ['_id', 'name', 'trade'],
      rows: [
        ['1', 'Aldous Vex', 'butcher'],
        ['2', 'Nula Sart', 'laundress'],
        ['3', 'Edik Swan', 'butcher'],
      ],
    },
  ],
  options: [
    { en: 'Aldous Vex', es: 'Aldous Vex' },
    { en: 'Nula Sart', es: 'Nula Sart' },
    { en: 'Edik Swan', es: 'Edik Swan' },
    { en: 'Nobody - the debt eats all', es: 'Nadie - la deuda se lo come todo' },
  ],
  answerIndex: 1,
}

export const BOSS_NODE: MapNode = {
  id: 'l1-boss',
  name: { en: '☠ EL DEADLOCK', es: '☠ EL DEADLOCK' },
  subtitle: {
    en: 'Ten phases: joins, ACID, indexes, normal forms and the final verdict.',
    es: 'Diez fases: joins, ACID, índices, formas normales y el veredicto final.',
  },
  scene: 'throne',
  npc: 'boss',
  isBoss: true,
  learn: [
    { en: 'Multi-table JOIN chains across three tables', es: 'Cadenas de JOIN multi-tabla entre tres tablas' },
    { en: 'ACID, COMMIT and ROLLBACK', es: 'ACID, COMMIT y ROLLBACK' },
    { en: 'Indexes and First Normal Form', es: 'Índices y Primera Forma Normal' },
    { en: 'UPDATE with WHERE - closing files safely', es: 'UPDATE con WHERE - cerrar expedientes sin peligro' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
