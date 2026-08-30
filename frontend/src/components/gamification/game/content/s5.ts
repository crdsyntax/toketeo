import type { MapNode, Puzzle } from '../types'

const p1: Puzzle = {
  id: 'l1-s5-p1',
  kind: 'trivia',
  engine: 'redis',
  xp: 250,
  title: { en: 'The Cursed Warehouse Ledger', es: 'El registro del almacén maldito' },
  story: {
    en: 'The ghost of the Quesera drifts between iron shelves. Keys hang like lanterns, each holding one small value. The Watch counts suspects on a board - highest score first.',
    es: 'El fantasma de la Quesera flota entre estantes de hierro. Las llaves cuelgan como faroles, cada una con un pequeño valor. La Guardia cuenta sospechosos en un tablero - mayor puntaje primero.',
  },
  prompt: {
    en: 'In Redis, which data structure keeps members sorted by score - ideal for leaderboards?',
    es: 'En Redis, ¿qué estructura mantiene miembros ordenados por puntaje - ideal para rankings?',
  },
  hint: { en: 'Its write command starts with Z.', es: 'Su comando de escritura empieza con Z.' },
  explain: {
    en: 'A SORTED SET stores unique members with a score and keeps them ordered at all times. ZADD writes; ZRANGE reads by rank or score range.',
    es: 'Un SORTED SET guarda miembros únicos con puntaje y los mantiene ordenados siempre. ZADD escribe; ZRANGE lee por rango o puntaje.',
  },
  options: [
    { en: 'LIST', es: 'LIST' },
    { en: 'SET', es: 'SET' },
    { en: 'SORTED SET', es: 'SORTED SET' },
    { en: 'HASH', es: 'HASH' },
  ],
  answerIndex: 2,
}

const p2: Puzzle = {
  id: 'l1-s5-p2',
  kind: 'query',
  engine: 'redis',
  xp: 250,
  title: { en: 'Seal the Evidence', es: 'Sella la evidencia' },
  story: {
    en: '"Evidence decays," the ghost warns. Store the sealed knife under key evidence:knife - and let it expire before dawn, 60 seconds. No more, no less.',
    es: '"La evidencia se pudre", advierte el fantasma. Guarda el cuchillo sellado bajo la clave evidence:knife - y deja que expire antes del amanecer, 60 segundos. Ni más ni menos.',
  },
  prompt: {
    en: 'Write the single Redis command that stores the string value "sealed-cleaver" under key evidence:knife with a 60 second expiry.',
    es: 'Escribe el comando Redis único que guarda el valor de texto "sealed-cleaver" bajo la clave evidence:knife con expiración de 60 segundos.',
  },
  solution: 'SETEX evidence:knife 60 sealed-cleaver',
  accept: [
    'set evidence:knife sealed-cleaver ex 60',
    'set evidence:knife "sealed-cleaver" EX 60',
  ],
  hint: { en: 'SETEX key seconds value - or SET with an EX option.', es: 'SETEX clave segundos valor - o SET con opción EX.' },
  explain: {
    en: 'SETEX sets a value WITH its time-to-live atomically. After 60 seconds Redis deletes the key on its own - no cleanup job needed.',
    es: 'SETEX fija un valor CON su tiempo de vida de forma atómica. Tras 60 segundos Redis borra la clave por sí solo - sin tarea de limpieza.',
  },
}

const p3: Puzzle = {
  id: 'l1-s5-p3',
  kind: 'trivia',
  engine: 'redis',
  xp: 200,
  title: { en: 'One Key, One Value', es: 'Una llave, un valor' },
  story: {
    en: 'No tables, no queries, no joins. Just names on hooks: lift the key, read what hangs beneath it. That is the whole philosophy of this floor.',
    es: 'Sin tablas, sin consultas, sin joins. Solo nombres en ganchos: levanta la llave, lee lo que cuelga debajo. Esa es toda la filosofía de este piso.',
  },
  prompt: {
    en: 'What kind of database is Redis at heart?',
    es: '¿Qué tipo de base de datos es Redis en esencia?',
  },
  hint: { en: 'It pairs exactly two things per entry.', es: 'Empareja exactamente dos cosas por entrada.' },
  explain: {
    en: 'Redis is an in-memory KEY-VALUE store: every datum lives under a unique string key, making reads extremely fast.',
    es: 'Redis es un almacén LLAVE-VALOR en memoria: cada dato vive bajo una clave de texto única, haciendo las lecturas extremadamente rápidas.',
  },
  options: [
    { en: 'A relational database', es: 'Una base relacional' },
    { en: 'A document database', es: 'Una base de documentos' },
    { en: 'A key-value store', es: 'Un almacén llave-valor' },
    { en: 'A graph database', es: 'Una base de grafos' },
  ],
  answerIndex: 2,
}

const p4: Puzzle = {
  id: 'l1-s5-p4',
  kind: 'query',
  engine: 'redis',
  xp: 200,
  title: { en: 'Read What Hangs Beneath', es: 'Lee lo que cuelga debajo' },
  story: {
    en: 'The ghost points a translucent finger. "The knife you sealed yesterday - read me its state before the Watch claims it."',
    es: 'El fantasma señala con un dedo translúcido. "El cuchillo que sellaste ayer - léeme su estado antes de que la Guardia lo reclame".',
  },
  prompt: {
    en: 'Write the Redis command that READS the value stored under key evidence:knife.',
    es: 'Escribe el comando Redis que LEE el valor guardado bajo la clave evidence:knife.',
  },
  solution: 'GET evidence:knife',
  accept: ['get "evidence:knife"', 'get evidence:knife;'],
  hint: { en: 'Two letters. One key.', es: 'Dos letras. Una clave.' },
  explain: {
    en: 'GET key returns the string stored under that key, or nil if the key does not exist (expired keys vanish silently).',
    es: 'GET clave devuelve el texto guardado bajo esa clave, o nil si no existe (las claves expiradas desaparecen en silencio).',
  },
}

const p5: Puzzle = {
  id: 'l1-s5-p5',
  kind: 'trivia',
  engine: 'redis',
  xp: 250,
  title: { en: 'A Card With Many Fields', es: 'Una ficha con muchos campos' },
  story: {
    en: 'The suspect card holds name, trade and last sighting - separate values under ONE hook. Not four keys; one card.',
    es: 'La ficha del sospechoso tiene nombre, oficio y último avistamiento - valores separados bajo UN gancho. No cuatro llaves; una ficha.',
  },
  prompt: {
    en: 'Which Redis structure groups several field-value pairs under one key - like a record?',
    es: '¿Qué estructura de Redis agrupa varios pares campo-valor bajo una sola clave - como un registro?',
  },
  hint: { en: 'Its write command starts with H.', es: 'Su comando de escritura empieza con H.' },
  explain: {
    en: 'A HASH stores field-value pairs inside one key: HSET suspect:1 name "aldous" job "butcher", then HGET suspect:1 name reads one field.',
    es: 'Un HASH guarda pares campo-valor dentro de una clave: HSET suspect:1 name "aldous" job "butcher", y HGET suspect:1 name lee un campo.',
  },
  options: [
    { en: 'LIST', es: 'LIST' },
    { en: 'STRING', es: 'STRING' },
    { en: 'HASH', es: 'HASH' },
    { en: 'STREAM', es: 'STREAM' },
  ],
  answerIndex: 2,
}

const p6: Puzzle = {
  id: 'l1-s5-p6',
  kind: 'query',
  engine: 'redis',
  xp: 300,
  title: { en: 'Tally of the Damned Door', es: 'Conteo de la puerta maldita' },
  story: {
    en: 'Every visitor who pushed the quesera door left a mark. The counter must grow by one each time - atomic, no race, no mercy.',
    es: 'Cada visitante que empujó la puerta de la quesería dejó marca. El contador debe crecer en uno cada vez - atómico, sin carreras, sin piedad.',
  },
  prompt: {
    en: 'Write the command that increases the numeric value of key shop:visits by exactly one.',
    es: 'Escribe el comando que incrementa en exactamente uno el valor numérico de la clave shop:visits.',
  },
  solution: 'INCR shop:visits',
  accept: ['incr "shop:visits"', 'incrby shop:visits 1'],
  hint: { en: 'Four letters: it increments.', es: 'Cuatro letras: incrementa.' },
  explain: {
    en: 'INCR adds 1 to the integer under a key and returns the new total. It is ATOMIC - concurrent clients never lose a count.',
    es: 'INCR suma 1 al entero bajo la clave y devuelve el nuevo total. Es ATÓMICO - clientes concurrentes nunca pierden conteo.',
  },
}

const p7: Puzzle = {
  id: 'l1-s5-p7',
  kind: 'trivia',
  engine: 'redis',
  xp: 200,
  title: { en: 'How Long Until It Rots', es: 'Cuánto falta para que pudra' },
  story: {
    en: 'Evidence sealed last night still hangs there... or does it? The ghost asks how much life remains in the key before dawn takes it.',
    es: 'La evidencia sellada anoche aún cuelga ahí... ¿o no? El fantasma pregunta cuánta vida le queda a la clave antes de que el amanecer la lleve.',
  },
  prompt: {
    en: 'Which command returns the remaining seconds of life for a key?',
    es: '¿Qué comando devuelve los segundos de vida restantes de una clave?',
  },
  hint: { en: 'Same word as time-to-live abbreviation.', es: 'La misma palabra que la abreviación de tiempo-de-vida.' },
  explain: {
    en: 'TTL key returns remaining seconds until expiry (-1 means no expiry set, -2 means the key is already gone).',
    es: 'TTL clave devuelve los segundos restantes hasta expirar (-1 significa sin expiración, -2 que la clave ya no existe).',
  },
  options: [
    { en: 'LIFE evidence:knife', es: 'LIFE evidence:knife' },
    { en: 'REMAIN evidence:knife', es: 'REMAIN evidence:knife' },
    { en: 'TTL evidence:knife', es: 'TTL evidence:knife' },
    { en: 'EXPIRES evidence:knife', es: 'EXPIRES evidence:knife' },
  ],
  answerIndex: 2,
}

const p8: Puzzle = {
  id: 'l1-s5-p8',
  kind: 'query',
  engine: 'redis',
  xp: 250,
  title: { en: 'Burn the False Trail', es: 'Quema la pista falsa' },
  story: {
    en: 'Someone planted a fake key pointing at Mother Grey. The Scribe wants it erased from existence - not expired, erased. Now.',
    es: 'Alguien plantó una clave falsa acusando a Mother Grey. La Escribana quiere que deje de existir - no expirada, borrada. Ya.',
  },
  prompt: {
    en: 'Write the command that DELETES the key frame:gross entirely.',
    es: 'Escribe el comando que ELIMINA por completo la clave frame:gross.',
  },
  solution: 'DEL frame:gross',
  accept: ['del "frame:gross"', 'unlink frame:gross'],
  hint: { en: 'Three letters. Deletion.', es: 'Tres letras. Borrado.' },
  explain: {
    en: 'DEL removes the key immediately regardless of type. UNLINK is its asynchronous sibling that frees memory in background.',
    es: 'DEL elimina la clave de inmediato sin importar su tipo. UNLINK es su hermano asíncrono que libera memoria en segundo plano.',
  },
}

const p9: Puzzle = {
  id: 'l1-s5-p9',
  kind: 'trivia',
  engine: 'redis',
  xp: 250,
  title: { en: 'No Name Twice on the Wall', es: 'Ningún nombre dos veces en el muro' },
  story: {
    en: 'Suspects are chalked onto the cell wall. Write a name twice and the wall refuses - one line per soul, ever.',
    es: 'Los sospechosos se escriben con tiza en la pared de la celda. Escribe un nombre dos veces y el muro se niega - una línea por alma, siempre.',
  },
  prompt: {
    en: 'Which structure guarantees NO duplicates among members?',
    es: '¿Qué estructura garantiza SIN duplicados entre sus miembros?',
  },
  hint: { en: 'LIST allows repeats; its cousin does not.', es: 'LIST permite repetidos; su prima no.' },
  explain: {
    en: 'A SET holds unique members: SADD ignores a member already present. LISTs keep order and allow duplicates instead.',
    es: 'Un SET contiene miembros únicos: SADD ignora uno ya presente. Las LISTas conservan orden y permiten duplicados.',
  },
  options: [
    { en: 'LIST', es: 'LIST' },
    { en: 'SET', es: 'SET' },
    { en: 'STRING', es: 'STRING' },
    { en: 'HASH', es: 'HASH' },
  ],
  answerIndex: 1,
}

const p10: Puzzle = {
  id: 'l1-s5-p10',
  kind: 'query',
  engine: 'redis',
  xp: 300,
  title: { en: 'Chalk the Prime Suspect', es: 'Tiza al sospechoso principal' },
  story: {
    en: 'Five hundred silver marks on his head. Add Aldous Vex to the suspects board with his bounty as score.',
    es: 'Quinientas marcas de plata sobre su cabeza. Agrega a Aldous Vex al tablero de sospechosos con su recompensa como puntaje.',
  },
  prompt: {
    en: 'Write the command adding member aldous_vex with score 500 to the sorted set named suspects.',
    es: 'Escribe el comando que agrega el miembro aldous_vex con puntaje 500 al sorted set llamado suspects.',
  },
  solution: 'ZADD suspects 500 aldous_vex',
  accept: ['zadd "suspects" 500 "aldous_vex"', 'zadd suspects 500.0 aldous_vex'],
  hint: { en: 'ZADD key score member.', es: 'ZADD clave puntaje miembro.' },
  explain: {
    en: 'ZADD inserts (or updates) a member with its score; the sorted set re-orders itself instantly so leaderboards stay live.',
    es: 'ZADD inserta (o actualiza) un miembro con su puntaje; el sorted set se reordena al instante manteniendo vivos los rankings.',
  },
}

export const S5_NODE: MapNode = {
  id: 'l1-s5',
  name: { en: 'V · Almacén Maldito', es: 'V · Almacén Maldito' },
  subtitle: {
    en: 'Ten lessons with ghosts: GET, INCR, hashes, sets and expiring keys.',
    es: 'Diez lecciones con fantasmas: GET, INCR, hashes, sets y claves que expiran.',
  },
  scene: 'graveyard',
  npc: 'ghost',
  isBoss: false,
  learn: [
    { en: 'The key-value philosophy of Redis', es: 'La filosofía llave-valor de Redis' },
    { en: 'GET, DEL and INCR: read, erase, count', es: 'GET, DEL e INCR: leer, borrar, contar' },
    { en: 'Hashes and sets - cards and walls without duplicates', es: 'Hashes y sets - fichas y muros sin duplicados' },
    { en: 'Expiring keys: SETEX, TTL and evidence that rots', es: 'Claves que expiran: SETEX, TTL y evidencia que se pudre' },
  ],
  puzzles: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10],
}
