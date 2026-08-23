import type { MapNode, Puzzle } from '../types'

const p1: Puzzle = {
  id: 'l1-s2-p1',
  kind: 'mystery',
  engine: 'sql',
  xp: 400,
  title: { en: 'The Quesera of the Corner (Jan 2, 2 AM)', es: 'La Quesera de la Esquina (2 de enero, 2 AM)' },
  story: {
    en: 'At 2 AM on January 2nd the owner of the corner cheese shop was murdered and dismembered. The walls still keep the scream. Three tables remember what the street saw: a scarred left hand, whey on fleeing boots, and the blade the Watch found.',
    es: 'A las 2 AM del 2 de enero la dueña de la quesería fue asesinada y descuartizada. Las paredes aún guardan el grito. Tres tablas recuerdan lo que vio la calle: una mano izquierda cicatrizada, suero en las botas que huyeron y el cuchillo que encontró la Guardia.',
  },
  prompt: {
    en: 'Join persons to roles to tools. Find who owns the murder weapon, confirm their trade worked nights, and match the witness description. Name the killer.',
    es: 'Une persons con roles y tools. Encuentra al dueño del arma, confirma que su oficio trabajaba de noche y coteja la descripción. Nombra al asesino.',
  },
  hint: { en: 'The tool table points at an owner_id; check that person job shift and their trait in persons.', es: 'La tabla tools apunta a un owner_id; revisa el turno de ese oficio y su rasgo en persons.' },
  explain: {
    en: 'Follow the foreign keys: tools says the cleaver belongs to owner_id 1; roles confirms person 1 is a night-shift butcher; persons shows Aldous Vex has the burn scar the witness saw.',
    es: 'Sigue las claves foráneas: tools dice que el cuchillo pertenece al owner_id 1; roles confirma que la persona 1 es carnicero nocturno; persons muestra que Aldous Vex tiene la cicatriz que vio el testigo.',
  },
  tables: [
    {
      name: 'persons',
      columns: ['id', 'name', 'trait'],
      rows: [
        ['1', 'Aldous Vex', 'burn scar, left hand'],
        ['2', 'Mother Grey', 'smells of lye'],
        ['3', 'Tobias Crumb', 'whistles off-key'],
        ['4', 'Silas Marsh', 'limps on right leg'],
      ],
    },
    {
      name: 'roles',
      columns: ['person_id', 'job', 'shift'],
      rows: [
        ['1', 'butcher', 'night'],
        ['2', 'laundress', 'day'],
        ['3', 'rat catcher', 'night'],
        ['4', 'grave digger', 'dusk'],
      ],
    },
    {
      name: 'tools',
      columns: ['owner_id', 'tool', 'residue'],
      rows: [
        ['1', 'cleaver', 'whey + blood type O'],
        ['2', 'washboard', 'lye'],
        ['3', 'iron cage', 'rat fur'],
        ['4', 'shovel', 'grave soil'],
      ],
    },
  ],
  options: [
    { en: 'Mother Grey', es: 'Mother Grey' },
    { en: 'Aldous Vex', es: 'Aldous Vex' },
    { en: 'Tobias Crumb', es: 'Tobias Crumb' },
    { en: 'Silas Marsh', es: 'Silas Marsh' },
  ],
  answerIndex: 1,
}

const p2: Puzzle = {
  id: 'l1-s2-p2',
  kind: 'query',
  engine: 'sql',
  xp: 300,
  title: { en: 'Write the Incantation', es: 'Escribe el conjuro' },
  story: {
    en: 'The Coroner wants proof, not hunches. Show the query that would have caught the butcher, and the court burns him by dawn.',
    es: 'El Forense quiere pruebas, no corazonadas. Muestra la consulta que habría atrapado al carnicero y la corte lo quema al amanecer.',
  },
  prompt: {
    en: 'Tables: persons(id, name), roles(person_id, job, shift). Return the name column of every person whose job is butcher and whose shift is night. Join both tables on the relation.',
    es: 'Tablas: persons(id, name), roles(person_id, job, shift). Devuelve la columna name de cada persona cuyo job sea butcher y cuyo shift sea night. Une ambas tablas por la relación.',
  },
  solution:
    "SELECT p.name FROM persons p JOIN roles r ON p.id = r.person_id WHERE r.job = 'butcher' AND r.shift = 'night'",
  accept: [
    "SELECT persons.name FROM persons JOIN roles ON persons.id = roles.person_id WHERE roles.job = 'butcher' AND roles.shift = 'night'",
    "select p.name from persons p inner join roles r on r.person_id = p.id where r.job = 'butcher' and r.shift = 'night'",
    "select p.name from roles r join persons p on p.id = r.person_id where r.job = 'butcher' and r.shift = 'night'",
    "select p.name from roles r inner join persons p on r.person_id = p.id where r.job = 'butcher' and r.shift = 'night'",
  ],
  hint: { en: 'JOIN ... ON p.id = r.person_id, then two conditions in WHERE.', es: 'JOIN ... ON p.id = r.person_id, luego dos condiciones en WHERE.' },
  explain: {
    en: 'JOIN pairs each person with their role row using the shared key. WHERE then keeps only butcher-night combinations.',
    es: 'JOIN empareja cada persona con su fila de rol usando la clave compartida. WHERE conserva solo las combinaciones carnicero-noche.',
  },
}

const p3: Puzzle = {
  id: 'l1-s2-p3',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'The Bone That Names the Body', es: 'El hueso que nombra al cuerpo' },
  story: {
    en: 'In the morgue every corpse gets a tag number. Two bodies never share one tag - otherwise the Scribe buries the wrong man twice a week.',
    es: 'En la morgue cada cadáver recibe un número de etiqueta. Dos cuerpos nunca comparten etiqueta - si no, la Escribana entierra al hombre equivocado dos veces por semana.',
  },
  prompt: {
    en: 'Which key uniquely identifies each row of a table and can never repeat or be null?',
    es: '¿Qué clave identifica de forma única cada fila de una tabla y nunca puede repetirse ni ser nula?',
  },
  hint: { en: 'It is THE identity of the row.', es: 'Es LA identidad de la fila.' },
  explain: {
    en: 'The PRIMARY KEY (usually id) uniquely identifies each row. It is unique and NOT NULL by definition, and other tables reference it.',
    es: 'La LLAVE PRIMARIA (normalmente id) identifica únicamente cada fila. Por definición es única y NOT NULL, y otras tablas la referencian.',
  },
  options: [
    { en: 'Foreign key', es: 'Clave foránea' },
    { en: 'Primary key', es: 'Llave primaria' },
    { en: 'Composite index', es: 'Índice compuesto' },
    { en: 'Unique constraint', es: 'Restricción única' },
  ],
  answerIndex: 1,
}

const p4: Puzzle = {
  id: 'l1-s2-p4',
  kind: 'trivia',
  engine: 'sql',
  xp: 200,
  title: { en: 'Threads Between Tables', es: 'Hilos entre tablas' },
  story: {
    en: 'The Scribe pulls a red thread from the cleaver tag to a name card in her cabinet. "This thread," she says, "is how tables hold hands."',
    es: 'La Escribana jala un hilo rojo desde la etiqueta del cuchillo hasta una ficha de su gabinete. "Este hilo", dice, "es como las tablas se dan la mano".',
  },
  prompt: {
    en: 'roles.person_id stores values of persons.id. What is that column called?',
    es: 'roles.person_id guarda valores de persons.id. ¿Cómo se llama esa columna?',
  },
  hint: { en: 'It points at a primary key living in ANOTHER table.', es: 'Apunta a una llave primaria que vive en OTRA tabla.' },
  explain: {
    en: 'A FOREIGN KEY is a column referencing another table primary key. It creates the relationship that JOIN walks across.',
    es: 'Una CLAVE FORÁNEA es una columna que referencia la llave primaria de otra tabla. Crea la relación que JOIN cruza.',
  },
  options: [
    { en: 'Foreign key', es: 'Clave foránea' },
    { en: 'Primary key', es: 'Llave primaria' },
    { en: 'Candidate key', es: 'Clave candidata' },
    { en: 'Super key', es: 'Superclave' },
  ],
  answerIndex: 0,
}

const p5: Puzzle = {
  id: 'l1-s2-p5',
  kind: 'trivia',
  engine: 'sql',
  xp: 250,
  title: { en: 'Souls Without a Role', es: 'Almas sin rol' },
  story: {
    en: 'Newborns and drifters have no trade registered. The Scribe refuses to erase them from the census just because roles has nothing to say about them.',
    es: 'Los recién llegados y vagabundos no tienen oficio registrado. La Escribana se niega a borrarlos del censo solo porque roles no dice nada de ellos.',
  },
  prompt: {
    en: 'You need EVERY person, even those with no matching role row. Which JOIN keeps unmatched left-table rows?',
    es: 'Necesitas TODAS las personas, incluso sin fila de rol. ¿Qué JOIN conserva las filas sin coincidir de la tabla izquierda?',
  },
  hint: { en: 'Its name names the side it protects.', es: 'Su nombre menciona al lado que protege.' },
  explain: {
    en: 'LEFT JOIN returns all left-table rows plus matches; missing right side becomes NULL. INNER JOIN would silently drop the roleless.',
    es: 'LEFT JOIN devuelve todas las filas de la izquierda más sus coincidencias; lo faltante del lado derecho queda NULL. INNER JOIN descartaría en silencio a los sin rol.',
  },
  options: [
    { en: 'INNER JOIN', es: 'INNER JOIN' },
    { en: 'LEFT JOIN', es: 'LEFT JOIN' },
    { en: 'CROSS JOIN', es: 'CROSS JOIN' },
    { en: 'SELF JOIN', es: 'SELF JOIN' },
  ],
  answerIndex: 1,
}

const p6: Puzzle = {
  id: 'l1-s2-p6',
  kind: 'query',
  engine: 'sql',
  xp: 350,
  title: { en: 'Name Every Blade Owner', es: 'Nombra a cada dueño de hoja' },
  story: {
    en: 'Confiscation day. The Watch stacks cleavers, cages and shovels on the table, each tagged with its owner. The ledger wants both columns: who, and what.',
    es: 'Día de decomisos. La Guardia apila cuchillos, jaulas y palas sobre la mesa, cada una etiquetada con su dueño. El registro quiere ambas columnas: quién y qué.',
  },
  prompt: {
    en: 'Tables: persons(id, name), tools(owner_id, tool). Return TWO columns - person name and their tool - for tools whose residue contains whey.',
    es: 'Tablas: persons(id, name), tools(owner_id, tool). Devuelve DOS columnas - nombre de la persona y su herramienta - para herramientas cuyo residuo contenga suero (whey).',
  },
  solution: "SELECT p.name, t.tool FROM persons p JOIN tools t ON t.owner_id = p.id WHERE t.residue LIKE '%whey%'",
  accept: [
    "SELECT p.name, t.tool FROM persons p JOIN tools t ON t.owner_id = p.id WHERE t.residue LIKE '%whey%'",
    'select p.name, t.tool from persons p join tools t on p.id = t.owner_id where t.residue like "%whey%"',
  ],
  hint: { en: 'Two columns after SELECT, one JOIN, one LIKE.', es: 'Dos columnas tras SELECT, un JOIN, un LIKE.' },
  explain: {
    en: 'Multi-column projection lists both fields comma-separated. The JOIN resolves owner_id into a readable name while LIKE filters sticky evidence.',
    es: 'La proyección multicolumen lista ambos campos separados por coma. El JOIN resuelve owner_id en un nombre legible mientras LIKE filtra la evidencia pegajosa.',
  },
}

const p7: Puzzle = {
  id: 'l1-s2-p7',
  kind: 'mystery',
  engine: 'sql',
  xp: 400,
  title: { en: 'The Rattling Cage', es: 'La jaula que traquetea' },
  story: {
    en: 'Down the lane a cage rattles with no rat inside. Whoever owns it was out here long past curfew. Match the tag to the census and name them.',
    es: 'Abajo en el callejón una jaula traquetea sin rata adentro. Su dueño estuvo aquí mucho después del toque de queda. Empareja la etiqueta con el censo y nómbralo.',
  },
  prompt: {
    en: 'Use both tables. The iron cage carries residue of rat fur. Who owns it?',
    es: 'Usa ambas tablas. La jaula de hierro carga residuo de pelaje de rata. ¿Quién es el dueño?',
  },
  hint: { en: 'Find the tool first, then walk its owner_id back to a name.', es: 'Encuentra la herramienta primero, luego camina su owner_id hasta un nombre.' },
  explain: {
    en: 'tools shows iron cage with owner_id 3; persons maps id 3 to Tobias Crumb. Foreign keys are one-way doors: tool first, then person.',
    es: 'tools muestra jaula de hierro con owner_id 3; persons traduce el id 3 a Tobias Crumb. Las claves foráneas son puertas de un sentido: primero la herramienta, luego la persona.',
  },
  tables: [
    {
      name: 'persons',
      columns: ['id', 'name'],
      rows: [
        ['1', 'Aldous Vex'],
        ['2', 'Mother Grey'],
        ['3', 'Tobias Crumb'],
        ['4', 'Silas Marsh'],
      ],
    },
    {
      name: 'tools',
      columns: ['owner_id', 'tool', 'residue'],
      rows: [
        ['1', 'cleaver', 'whey'],
        ['2', 'washboard', 'lye'],
        ['3', 'iron cage', 'rat fur'],
        ['4', 'shovel', 'grave soil'],
      ],
    },
  ],
  options: [
    { en: 'Mother Grey', es: 'Mother Grey' },
    { en: 'Tobias Crumb', es: 'Tobias Crumb' },
    { en: 'Aldous Vex', es: 'Aldous Vex' },
    { en: 'Silas Marsh', es: 'Silas Marsh' },
  ],
  answerIndex: 1,
}

const p8: Puzzle = {
  id: 'l1-s2-p8',
  kind: 'trivia',
  engine: 'sql',
  xp: 150,
  title: { en: 'Nicknames for Tables', es: 'Apodos para tablas' },
  story: {
    en: 'Writing PERSONS over and over cramps the hand. The Scribe permits short names in queries - as long as you introduce them properly.',
    es: 'Escribir PERSONS una y otra vez acalamabra la mano. La Escribana permite nombres cortos en las consultas - mientras los introduzcas correctamente.',
  },
  prompt: {
    en: 'In FROM persons p, what does the p do?',
    es: 'En FROM persons p, ¿qué hace la p?',
  },
  hint: { en: 'It is short for alias.', es: 'Es diminutivo de alias.' },
  explain: {
    en: 'p is an ALIAS: a temporary nickname for the table inside this query. Then p.name means the name column of persons.',
    es: 'p es un ALIAS: apodo temporal de la tabla dentro de esta consulta. Entonces p.name significa la columna name de persons.',
  },
  options: [
    { en: 'A placeholder for NULL', es: 'Un marcador para NULL' },
    { en: 'A table alias', es: 'Un alias de tabla' },
    { en: 'A password', es: 'Una contraseña' },
    { en: 'The schema name', es: 'El nombre del esquema' },
  ],
  answerIndex: 1,
}

const p9: Puzzle = {
  id: 'l1-s2-p9',
  kind: 'query',
  engine: 'sql',
  xp: 400,
  title: { en: 'Arsenal per Head', es: 'Arsenal por cabeza' },
  story: {
    en: 'The magistrate asks an ugly question: how many tools does each soul own? The Scribe smiles - counting is her love language.',
    es: 'El magistrado hace una pregunta fea: cuántas herramientas posee cada alma. La Escribana sonríe - contar es su idioma del amor.',
  },
  prompt: {
    en: 'Join persons to tools and return each person name with how many tools they own (column total). One row per person.',
    es: 'Une persons con tools y devuelve cada nombre con cuántas herramientas posee (columna total). Una fila por persona.',
  },
  solution: 'SELECT p.name, COUNT(*) AS total FROM persons p JOIN tools t ON t.owner_id = p.id GROUP BY p.name',
  hint: { en: 'JOIN glues, GROUP BY buckets, COUNT tallies, AS renames.', es: 'JOIN une, GROUP BY agrupa, COUNT cuenta, AS renombra.' },
  explain: {
    en: 'After the JOIN, GROUP BY p.name makes one bucket per person and COUNT(*) counts rows inside each bucket - their arsenal size.',
    es: 'Tras el JOIN, GROUP BY p.name crea un grupo por persona y COUNT(*) cuenta las filas dentro de cada grupo - el tamaño de su arsenal.',
  },
}

const p10: Puzzle = {
  id: 'l1-s2-p10',
  kind: 'trivia',
  engine: 'sql',
  xp: 250,
  title: { en: 'Many Hands, Many Tools', es: 'Muchas manos, muchas herramientas' },
  story: {
    en: 'Witnesses saw many suspects; suspects own many tools. A single line between two tables cannot hold that tangle - the Scribe adds a THIRD table between them.',
    es: 'Los testigos vieron muchos sospechosos; los sospechosos poseen muchas herramientas. Una sola línea entre dos tablas no soporta ese enredo - la Escribana agrega una TERCERA tabla entre ellas.',
  },
  prompt: {
    en: 'For a many-to-many relationship (many suspects, many tools), which structure stores the links?',
    es: 'Para una relación muchos-a-muchos (muchos sospechosos, muchas herramientas), ¿qué estructura guarda los vínculos?',
  },
  hint: { en: 'It holds two foreign keys and nothing else, usually.', es: 'Guarda dos claves foráneas y nada más, normalmente.' },
  explain: {
    en: 'A JUNCTION (bridge) table holds one foreign key per side: suspect_id + tool_id per link. Two one-to-many relationships build one many-to-many.',
    es: 'Una tabla JUNTORA (puente) guarda una clave foránea por lado: suspect_id + tool_id por vínculo. Dos relaciones uno-a-muchos construyen una muchos-a-muchos.',
  },
  options: [
    { en: 'A junction table holding both foreign keys', es: 'Una tabla junctora con ambas claves foráneas' },
    { en: 'Duplicate the name column everywhere', es: 'Duplicar la columna nombre en todas partes' },
    { en: 'Store a comma list inside one cell', es: 'Guardar una lista con comas en una celda' },
    { en: 'One giant table with every column', es: 'Una tabla gigante con todas las columnas' },
  ],
  answerIndex: 0,
}

export const S2_NODE: MapNode = {
  id: 'l1-s2',
  name: { en: 'II · La Quesera', es: 'II · La Quesera' },
  subtitle: {
    en: 'Ten lessons in relationships: keys, JOINs and the anatomy of a murder.',
    es: 'Diez lecciones de relaciones: llaves, JOINs y la anatomía de un asesinato.',
  },
  scene: 'cheeseShop',
  npc: 'butcher',
  isBoss: false,
  learn: [
    { en: 'Primary keys vs foreign keys - the threads between tables', es: 'Llaves primarias vs foráneas - los hilos entre tablas' },
    { en: 'INNER JOIN and LEFT JOIN (and when each one lies to you)', es: 'INNER JOIN y LEFT JOIN (y cuándo cada uno te miente)' },
    { en: 'Junction tables: many-to-many without chaos', es: 'Tablas junctoras: muchos-a-muchos sin caos' },
    { en: 'JOIN + GROUP BY + COUNT in one incantation', es: 'JOIN + GROUP BY + COUNT en un solo conjuro' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
