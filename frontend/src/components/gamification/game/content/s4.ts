import type { MapNode, Puzzle } from '../types'

const RESIDENTS_TABLE = {
  name: 'residents (collection)',
  columns: ['name', 'role', 'shift', 'age', 'alley'],
  rows: [
    ['Aldous Vex', 'butcher', 'night', '38', 'Tallow Lane'],
    ['Mother Grey', 'laundress', 'day', '57', 'Ash Court'],
    ['Tobias Crumb', 'rat catcher', 'night', '44', 'Gallows Row'],
    ['Silas Marsh', 'grave digger', 'dusk', '29', 'Gallows Row'],
    ['Edik Swan', 'butcher', 'day', '52', 'Ash Court'],
    ['Nula Sart', 'laundress', 'night', '63', 'Tallow Lane'],
  ],
}

const p1: Puzzle = {
  id: 'l1-s4-p1',
  kind: 'trivia',
  engine: 'mongo',
  xp: 250,
  title: { en: 'The Collection Without Names', es: 'La colección sin nombres' },
  story: {
    en: 'Past the graveyard the warehouse hums. Documents float in jars - not rows, not tables. The Keeper turns one toward you: JSON suspended in formaldehyde.',
    es: 'Más allá del cementerio el almacén zumba. Documentos flotan en frascos - ni filas ni tablas. El Guardián voltea uno hacia ti: JSON suspendido en formol.',
  },
  prompt: {
    en: 'In MongoDB, which method reads documents from a collection matching a filter?',
    es: 'En MongoDB, ¿qué método lee documentos de una colección que coinciden con un filtro?',
  },
  hint: { en: 'It starts with f and takes a query document.', es: 'Empieza con f y recibe un documento de consulta.' },
  explain: {
    en: 'db.residents.find({ ... }) scans the collection and returns every document whose fields match the filter object.',
    es: 'db.residents.find({ ... }) recorre la colección y devuelve cada documento cuyos campos coinciden con el filtro.',
  },
  options: [
    { en: 'db.residents.getAll()', es: 'db.residents.getAll()' },
    { en: 'db.residents.find({ ... })', es: 'db.residents.find({ ... })' },
    { en: 'SELECT * FROM residents', es: 'SELECT * FROM residents' },
    { en: 'db.residents.scan()', es: 'db.residents.scan()' },
  ],
  answerIndex: 1,
}

const p2: Puzzle = {
  id: 'l1-s4-p2',
  kind: 'query',
  engine: 'mongo',
  xp: 300,
  title: { en: 'Interrogate the Jars', es: 'Interroga los frascos' },
  story: {
    en: 'The butcher fled into our collection. Night workers only. Bring me their documents - all fields.',
    es: 'El carnicero huyó dentro de nuestra colección. Solo trabajadores nocturnos. Tráeme sus documentos - todos los campos.',
  },
  prompt: {
    en: 'Collection: residents (fields: role, shift). Write the find() call returning every resident with role equal to "butcher" AND shift equal to "night".',
    es: 'Colección: residents (campos: role, shift). Escribe la llamada find() que devuelve cada residente con role igual a "butcher" Y shift igual a "night".',
  },
  solution: 'db.residents.find({ role: "butcher", shift: "night" })',
  accept: ["db.residents.find({ role: 'butcher', shift: 'night' })"],
  hint: { en: 'Commas inside the filter document mean AND.', es: 'Las comas dentro del documento filtro significan AND.' },
  explain: {
    en: 'Several fields inside one filter document imply logical AND automatically - no operator needed for simple cases.',
    es: 'Varios campos dentro de un documento filtro implican AND lógico automáticamente - sin operador para casos simples.',
  },
  tables: [RESIDENTS_TABLE],
}

const p3: Puzzle = {
  id: 'l1-s4-p3',
  kind: 'trivia',
  engine: 'mongo',
  xp: 200,
  title: { en: 'Jars Without a Label Standard', es: 'Frascos sin estándar de etiqueta' },
  story: {
    en: 'One jar holds five fields; its neighbor holds three and a secret sixth. The Keeper shrugs: nothing here is forced to match.',
    es: 'Un frasco guarda cinco campos; su vecino tres y un sexto secreto. El Guardián se encoge: aquí nada está obligado a coincidir.',
  },
  prompt: {
    en: 'What makes MongoDB documents different from SQL rows?',
    es: '¿Qué diferencia a los documentos de MongoDB de las filas SQL?',
  },
  hint: { en: 'SQL forces every row to share the same columns; Mongo does not.', es: 'SQL obliga a toda fila a compartir las mismas columnas; Mongo no.' },
  explain: {
    en: 'Documents are SCHEMA-FLEXIBLE: each can have different fields. SQL tables force every row into the same fixed columns.',
    es: 'Los documentos son de ESQUEMA FLEXIBLE: cada uno puede tener campos distintos. Las tablas SQL obligan a toda fila a las mismas columnas fijas.',
  },
  options: [
    { en: 'Documents cannot store numbers', es: 'Los documentos no pueden guardar números' },
    { en: 'Documents are schema-flexible per document', es: 'Los documentos tienen esquema flexible por documento' },
    { en: 'Documents must all be identical', es: 'Todos los documentos deben ser idénticos' },
    { en: 'Collections only hold text', es: 'Las colecciones solo guardan texto' },
  ],
  answerIndex: 1,
}

const p4: Puzzle = {
  id: 'l1-s4-p4',
  kind: 'query',
  engine: 'mongo',
  xp: 300,
  title: { en: 'Names Only, Keep the Secret', es: 'Solo nombres, guarda el secreto' },
  story: {
    en: 'The magistrate wants names of day workers - nothing else, not even the ledger numbers. Projection is discretion.',
    es: 'El magistrado quiere nombres de los trabajadores diurnos - nada más, ni siquiera los números del registro. Proyectar es discreción.',
  },
  prompt: {
    en: 'Return ONLY the name field (and exclude _id) of residents whose shift is "day": use the second argument of find() for projection.',
    es: 'Devuelve SOLO el campo name (y excluye _id) de los residentes con shift "day": usa el segundo argumento de find() para la proyección.',
  },
  solution: 'db.residents.find({ shift: "day" }, { name: 1, _id: 0 })',
  accept: ["db.residents.find({ shift: 'day' }, { name: 1, _id: 0 })"],
  hint: { en: 'find(filter, projection): 1 means show, 0 means hide.', es: 'find(filtro, proyección): 1 significa mostrar, 0 ocultar.' },
  explain: {
    en: 'The second find() argument is the PROJECTION: { name: 1 } keeps name, { _id: 0 } suppresses the automatic id that otherwise always shows.',
    es: 'El segundo argumento de find() es la PROYECCIÓN: { name: 1 } conserva name, { _id: 0 } suprime el id automático que si no siempre aparece.',
  },
  tables: [RESIDENTS_TABLE],
}

const p5: Puzzle = {
  id: 'l1-s4-p5',
  kind: 'trivia',
  engine: 'mongo',
  xp: 200,
  title: { en: 'The Number Nobody Chose', es: 'El número que nadie eligió' },
  story: {
    en: 'Every jar bears a serial etched by no human hand. The Keeper calls it the price of admission to his warehouse.',
    es: 'Cada frasco lleva un serial grabado por mano ajena. El Guardián lo llama el precio de entrada a su almacén.',
  },
  prompt: {
    en: 'If you do not provide one, what field does MongoDB add automatically to every inserted document?',
    es: 'Si no provees uno, ¿qué campo agrega MongoDB automáticamente a cada documento insertado?',
  },
  hint: { en: 'It is an underscore away.', es: 'Está a un guion bajo de distancia.' },
  explain: {
    en: '_id is the automatic unique identifier (usually an ObjectId). It acts as each document primary key within the collection.',
    es: '_id es el identificador único automático (normalmente un ObjectId). Actúa como llave primaria de cada documento en la colección.',
  },
  options: [
    { en: 'id', es: 'id' },
    { en: '_id', es: '_id' },
    { en: 'key', es: 'key' },
    { en: 'uuid', es: 'uuid' },
  ],
  answerIndex: 1,
}

const p6: Puzzle = {
  id: 'l1-s4-p6',
  kind: 'query',
  engine: 'mongo',
  xp: 350,
  title: { en: 'Old Enough to Know Better', es: 'Suficientemente viejo para saberlo' },
  story: {
    en: 'The Keeper distrusts youth. "Show me everyone forty and older," he growls. "They remember who buried whom."',
    es: 'El Guardián desconfía de la juventud. "Muéstrame a los cuarenta y más", gruñe. "Ellos recuerdan quién enterró a quién".',
  },
  prompt: {
    en: 'Write find() returning residents with age GREATER OR EQUAL to 40 using the $gte operator.',
    es: 'Escribe find() que devuelva residentes con edad MAYOR O IGUAL a 40 usando el operador $gte.',
  },
  solution: 'db.residents.find({ age: { $gte: 40 } })',
  hint: { en: 'Comparison operators live inside braces around the value.', es: 'Los operadores de comparación viven entre llaves alrededor del valor.' },
  explain: {
    en: '{ age: { $gte: 40 } } applies the comparison operator to the field value. Siblings: $gt greater, $lt less, $lte less-or-equal, $ne different.',
    es: '{ age: { $gte: 40 } } aplica el operador de comparación al valor del campo. Hermanos: $gt mayor, $lt menor, $lte menor-o-igual, $ne distinto.',
  },
  tables: [RESIDENTS_TABLE],
}

const p7: Puzzle = {
  id: 'l1-s4-p7',
  kind: 'trivia',
  engine: 'mongo',
  xp: 250,
  title: { en: 'Any of Two Trades', es: 'Cualquiera de dos oficios' },
  story: {
    en: 'Butchers or gravediggers - either trade has seen enough blood to talk. One filter should catch both flocks.',
    es: 'Carniceros o sepultureros - cualquier oficio ha visto suficiente sangre como para hablar. Un filtro debe atrapar ambos rebaños.',
  },
  prompt: {
    en: 'Which operator matches a field against a LIST of possible values?',
    es: '¿Qué operador hace coincidir un campo contra una LISTA de valores posibles?',
  },
  hint: { en: 'Dollar sign plus the word in.', es: 'Signo de dólar más la palabra in.' },
  explain: {
    en: '$in matches if the field equals ANY value in the array: db.residents.find({ role: { $in: ["butcher","grave digger"] } }).',
    es: '$in coincide si el campo es IGUAL a cualquier valor del arreglo: db.residents.find({ role: { $in: ["butcher","grave digger"] } }).',
  },
  options: [
    { en: '$or', es: '$or' },
    { en: '$match', es: '$match' },
    { en: '$in', es: '$in' },
    { en: '$any', es: '$any' },
  ],
  answerIndex: 2,
}

const p8: Puzzle = {
  id: 'l1-s4-p8',
  kind: 'query',
  engine: 'mongo',
  xp: 350,
  title: { en: 'Either Trade Will Talk', es: 'Cualquier oficio hablará' },
  story: {
    en: 'Two trades saw the body pass by at midnight. Summon butchers and gravediggers in a single incantation.',
    es: 'Dos oficios vieron pasar el cuerpo a medianoche. Convoca a carniceros y sepultureros en un solo conjuro.',
  },
  prompt: {
    en: 'Write find() returning residents whose role is "butcher" OR "grave digger" (use $in).',
    es: 'Escribe find() que devuelva residentes cuyo role sea "butcher" O "grave digger" (usa $in).',
  },
  solution: 'db.residents.find({ role: { $in: ["butcher", "grave digger"] } })',
  accept: ["db.residents.find({role: {$in: [\"butcher\", \"grave digger\"]}})", "db.residents.find({ role: { $in: ['butcher', 'grave digger'] } })"],
  hint: { en: 'Field first, then braces with $in, then the array.', es: 'Campo primero, luego llaves con $in, luego el arreglo.' },
  explain: {
    en: '{ role: { $in: [...] } } reads: role equals any element of the list. It replaces two OR branches with one compact filter.',
    es: '{ role: { $in: [...] } } se lee: role es igual a cualquier elemento de la lista. Reemplaza dos ramas OR con un filtro compacto.',
  },
}

const p9: Puzzle = {
  id: 'l1-s4-p9',
  kind: 'trivia',
  engine: 'mongo',
  xp: 250,
  title: { en: 'Rewriting a Jar Label', es: 'Reescribiendo una etiqueta' },
  story: {
    en: 'Mother Grey changed trades overnight - laundry by day, worse by night. Her document must follow, but only ONE field may move.',
    es: 'Mother Grey cambió de oficio de la noche a la mañana - lavandería de día, algo peor de noche. Su documento debe seguirirla, pero solo UN campo puede moverse.',
  },
  prompt: {
    en: 'Which pair updates exactly one matching document changing only given fields?',
    es: '¿Qué par actualiza exactamente un documento coincidente cambiando solo los campos dados?',
  },
  hint: { en: 'First word says how many; second starts with dollar-set.', es: 'La primera palabra dice cuántos; la segunda empieza con dollar-set.' },
  explain: {
    en: 'updateOne(filter, { $set: { field: value } }) changes just the listed fields of the FIRST match. Without $set you would REPLACE the whole document.',
    es: 'updateOne(filtro, { $set: { campo: valor } }) cambia solo los campos listados de la PRIMERA coincidencia. Sin $set reemplazarías el documento completo.',
  },
  options: [
    { en: 'updateOne(filter, { $set: { shift: "night" } })', es: 'updateOne(filter, { $set: { shift: "night" } })' },
    { en: 'updateOne(filter, { shift: "night" })', es: 'updateOne(filter, { shift: "night" })' },
    { en: 'setField(filter, "shift")', es: 'setField(filter, "shift")' },
    { en: 'patch.all(filter, shift)', es: 'patch.all(filter, shift)' },
  ],
  answerIndex: 0,
}

const p10: Puzzle = {
  id: 'l1-s4-p10',
  kind: 'trivia',
  engine: 'mongo',
  xp: 250,
  title: { en: 'Marriage Between Collections', es: 'Matrimonio entre colecciones' },
  story: {
    en: 'Residents here, crimes there. The Keeper wants both jars poured into one glass without losing a drop. There is an operator that marries collections.',
    es: 'Residentes aquí, crímenes allá. El Guardián quiere ambos frascos vertidos en un vaso sin perder una gota. Existe un operador que casa colecciones.',
  },
  prompt: {
    en: 'In the aggregation pipeline, which stage works like SQL JOIN between collections?',
    es: 'En el pipeline de agregación, ¿qué etapa funciona como el JOIN de SQL entre colecciones?',
  },
  hint: { en: 'Its name means looking something up.', es: 'Su nombre significa buscar algo.' },
  explain: {
    en: '$lookup joins documents from another collection into the current ones by matching fields - the Mongo equivalent of relational JOIN.',
    es: '$lookup une documentos de otra colección a los actuales haciendo coincidir campos - el equivalente Mongo del JOIN relacional.',
  },
  options: [
    { en: '$merge', es: '$merge' },
    { en: '$union', es: '$union' },
    { en: '$lookup', es: '$lookup' },
    { en: '$join', es: '$join' },
  ],
  answerIndex: 2,
}

export const S4_NODE: MapNode = {
  id: 'l1-s4',
  name: { en: 'IV · Colección Sin Nombre', es: 'IV · Colección Sin Nombre' },
  subtitle: {
    en: 'Ten lessons among jars: filters, projections, operators and $lookup.',
    es: 'Diez lecciones entre frascos: filtros, proyecciones, operadores y $lookup.',
  },
  scene: 'warehouse',
  npc: 'keeper',
  isBoss: false,
  learn: [
    { en: 'Documents, collections and flexible schemas', es: 'Documentos, colecciones y esquemas flexibles' },
    { en: 'Filters with comparison operators: $gte, $in', es: 'Filtros con operadores de comparación: $gte, $in' },
    { en: 'Projections and the automatic _id', es: 'Proyecciones y el _id automático' },
    { en: '$lookup - the MongoDB way of saying JOIN', es: '$lookup - la forma MongoDB de decir JOIN' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
