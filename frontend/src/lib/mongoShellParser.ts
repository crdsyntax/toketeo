



export interface MongoShellProtocol {
  collection?: string;
  operation?: string;
  find?: Record<string, unknown>;
  project?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  pipeline?: unknown[];
  document?: Record<string, unknown>;
  documents?: Record<string, unknown>[];
  update?: Record<string, unknown>;
  options?: Record<string, unknown>;
  field?: string;
  keys?: Record<string, unknown>;
}

export interface ParseResult {
  success: true;
  protocol: MongoShellProtocol;
  rawJson: string;
}

export interface ParseError {
  success: false;
  error: string;
}

export type MongoParseResult = ParseResult | ParseError;



const MONGO_SHELL_PATTERN = /^\s*db\s*\.\s*\w+\s*\.\s*\w+\s*\(/m;
const MONGO_SHELL_HELP_PATTERN = /^\s*(show\s+\w+|use\s+\w+)/im;
const MONGO_SHELL_ADMIN_PATTERN = /^\s*db\s*\.\s*[a-z][A-Za-z0-9_]*\s*\(/m;



export function isMongoShellSyntax(query: string): boolean {
  return MONGO_SHELL_PATTERN.test(query) || MONGO_SHELL_HELP_PATTERN.test(query) || MONGO_SHELL_ADMIN_PATTERN.test(query);
}





function extractBalanced(
  src: string,
  open = '(',
  close = ')',
): { inner: string; rest: string } | null {
  let depth = 0;
  let i = 0;
  let inString: string | null = null;

  while (i < src.length) {
    const ch = src[i];


    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === open) {
      depth++;
      if (depth === 1) {

        i++;
        depth = 0;
        break;
      }
    }
    if (ch === close && depth === 0) break;
    i++;
  }

  const start = i;
  while (i < src.length) {
    const ch = src[i];
    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth < 0) {
        return { inner: src.slice(start, i), rest: src.slice(i + 1) };
      }
    }
    i++;
  }
  return null;
}



function parseJsValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;


  try {
    return JSON.parse(trimmed);
  } catch {

  }


  const jsonLike = trimmed

    .replace(/'/g, '"')

    .replace(/\bundefined\b/g, 'null')

    .replace(/\bObjectId\s*\(\s*"([^"]+)"\s*\)/g, '"$1"')

    .replace(/\bISODate\s*\(\s*"([^"]+)"\s*\)/g, '"$1"')

    .replace(/\bnew\s+Date\s*\(\s*"([^"]+)"\s*\)/g, '"$1"')

    .replace(/\bNumberLong\s*\(\s*(\d+)\s*\)/g, '$1')

    .replace(/,\s*([\]}])/g, '$1')

    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');

  try {
    return JSON.parse(jsonLike);
  } catch {

    return trimmed;
  }
}



interface MethodCall {
  method: string;
  args: unknown[];
}



function parseChain(chain: string): MethodCall[] {
  const calls: MethodCall[] = [];
  let rest = chain.trim();

  while (rest.startsWith('.')) {

    const dotMatch = rest.match(/^\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!dotMatch) break;
    const method = dotMatch[1];
    const afterMethodName = rest.slice(dotMatch[0].length - 1);

    const balanced = extractBalanced(afterMethodName);
    if (!balanced) break;

    const args: unknown[] = balanced.inner.trim()
      ? [parseJsValue(balanced.inner)]
      : [];

    calls.push({ method, args });
    rest = balanced.rest.trim();
  }

  return calls;
}





function parseStatement(statement: string): MongoShellProtocol | null {

  const headMatch = statement.match(
    /^\s*db\s*\.\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  );
  if (!headMatch) return null;

  const collection = headMatch[1];
  const operation = headMatch[2];


  const afterHead = statement.slice(headMatch[0].length - 1);
  const balanced = extractBalanced(afterHead);
  if (!balanced) return null;

  const rawArgs = balanced.inner.trim();
  const chain = parseChain(balanced.rest.trim());


  const proto: MongoShellProtocol = {
    collection,
    operation: 'find',
  };

  switch (operation) {
    case 'find':
    case 'findOne': {
      proto.operation = operation;
      if (operation === 'findOne') proto.limit = 1;

      const filterStr = rawArgs;
      if (filterStr) proto.find = parseJsValue(filterStr) as Record<string, unknown> ?? {};

      break;
    }
    case 'count':
    case 'countDocuments':
    case 'estimatedDocumentCount': {
      proto.operation = 'count';
      if (rawArgs) proto.find = parseJsValue(rawArgs) as Record<string, unknown> ?? {};
      break;
    }
    case 'aggregate': {
      proto.operation = 'aggregate';
      if (rawArgs) proto.pipeline = parseJsValue(rawArgs) as unknown[];
      break;
    }
    case 'insertOne': {
      proto.operation = 'insertOne';
      if (rawArgs) proto.document = parseJsValue(rawArgs) as Record<string, unknown>;
      break;
    }
    case 'insertMany': {
      proto.operation = 'insertMany';
      if (rawArgs) proto.documents = parseJsValue(rawArgs) as Record<string, unknown>[];
      break;
    }
    case 'updateOne':
    case 'updateMany': {
      proto.operation = operation;

      const updateParsed = parseJsValue(`[${rawArgs}]`) as unknown[];
      if (Array.isArray(updateParsed)) {
        proto.find = (updateParsed[0] as Record<string, unknown>) ?? {};
        proto.update = (updateParsed[1] as Record<string, unknown>) ?? {};
        if (updateParsed[2]) proto.options = updateParsed[2] as Record<string, unknown>;
      }
      break;
    }
    case 'deleteOne':
    case 'deleteMany': {
      proto.operation = operation;
      if (rawArgs) proto.find = parseJsValue(rawArgs) as Record<string, unknown>;
      break;
    }
    case 'drop': {
      proto.operation = 'drop';
      break;
    }
    case 'createIndex': {
      proto.operation = 'createIndex';
      const idxParsed = parseJsValue(`[${rawArgs}]`) as unknown[];
      if (Array.isArray(idxParsed)) {
        proto.keys = (idxParsed[0] as Record<string, unknown>) ?? {};
        if (idxParsed[1]) proto.options = idxParsed[1] as Record<string, unknown>;
      }
      break;
    }
    case 'distinct': {
      proto.operation = 'distinct';
      const distParsed = parseJsValue(`[${rawArgs}]`) as unknown[];
      if (Array.isArray(distParsed)) {
        proto.field = distParsed[0] as string;
        if (distParsed[1]) proto.find = distParsed[1] as Record<string, unknown>;
      }
      break;
    }
    default:

      proto.operation = 'find';
      if (rawArgs) proto.find = parseJsValue(rawArgs) as Record<string, unknown>;
  }


  for (const { method, args } of chain) {
    switch (method) {
      case 'sort':
        proto.sort = args[0] as Record<string, unknown>;
        break;
      case 'project':
      case 'projection':
        proto.project = args[0] as Record<string, unknown>;
        break;
      case 'limit':
        proto.limit = Number(args[0]);
        break;
      case 'skip':
        proto.skip = Number(args[0]);
        break;
      case 'count':
        proto.operation = 'count';
        break;
      case 'pretty':
      case 'toArray':
      case 'forEach':

        break;
    }
  }

  return proto;
}





function splitStatements(src: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === '\\') { buf += ch + src[++i]; continue; }
      if (ch === inString) inString = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; buf += ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ';' && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) stmts.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const trimmed = buf.trim();
  if (trimmed) stmts.push(trimmed);
  return stmts;
}





export function parseMongoShell(query: string): MongoParseResult {
  if (!isMongoShellSyntax(query)) {
    return { success: false, error: 'Not MongoDB shell syntax' };
  }

  const cleaned = query.trim().replace(/;\s*$/, '');


  const showMatch = cleaned.match(/^\s*show\s+(collections|dbs|databases)\s*$/im);
  if (showMatch) {
    const what = showMatch[1].toLowerCase();
    const command: Record<string, unknown> =
      what === 'collections' ? { listCollections: 1 } : { listDatabases: 1 };
    return { success: true, protocol: command as unknown as MongoShellProtocol, rawJson: JSON.stringify(command, null, 2) };
  }


  const useMatch = cleaned.match(/^\s*use\s+(\S+)\s*$/im);
  if (useMatch) {
    const dbName = useMatch[1];
    const command: Record<string, unknown> = { use: dbName };
    return { success: true, protocol: command as unknown as MongoShellProtocol, rawJson: JSON.stringify(command, null, 2) };
  }


  const adminMatch = cleaned.match(/^\s*db\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  if (adminMatch) {
    const method = adminMatch[1];
    const afterMethod = cleaned.slice(adminMatch[0].length - 1);
    const balanced = extractBalanced(afterMethod);
    const rawArgs = balanced ? balanced.inner.trim() : '';

    const buildCommand = (): Record<string, unknown> => {
      switch (method) {
        case 'createCollection': {
          const name = rawArgs.replace(/^["']|["']$/g, '').split(',')[0].trim().replace(/^["']|["']$/g, '');
          return { create: name };
        }
        case 'dropDatabase':
          return { dropDatabase: 1 };
        case 'runCommand': {
          try {
            return JSON.parse(rawArgs) as Record<string, unknown>;
          } catch {
            throw new Error(`Invalid JSON argument for db.runCommand(): ${rawArgs}`);
          }
        }
        default:
          throw new Error(`Unsupported db.${method}() command`);
      }
    };

    try {
      const command = buildCommand();
      const rawJson = JSON.stringify(command, null, 2);
      return { success: true, protocol: command as unknown as MongoShellProtocol, rawJson };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const statements = splitStatements(query);
  const mongoStatements = statements.filter((s) => /^\s*db\s*\./.test(s));

  if (mongoStatements.length === 0) {
    return { success: false, error: 'No valid db.collection.method() statement found' };
  }


  const stmt = mongoStatements[0];
  const proto = parseStatement(stmt);

  if (!proto) {
    return { success: false, error: `Could not parse statement: ${stmt}` };
  }

  try {
    const rawJson = JSON.stringify(proto, null, 2);
    return { success: true, protocol: proto, rawJson };
  } catch (e) {
    return { success: false, error: `Serialization error: ${String(e)}` };
  }
}



export function protocolToWireJson(proto: MongoShellProtocol): string {
  return JSON.stringify(proto);
}
