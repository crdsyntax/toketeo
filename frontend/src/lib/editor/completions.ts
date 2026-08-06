import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { schemaService } from '@/services/schema.service';
import { useAppStore } from '@/store/useAppStore';
import { useAssistantStore } from '@/store/assistantStore';
import { MONGO_METHODS, MONGO_OPERATORS } from './mongoShellLanguage';

const schemaCache = new Map<string, { tables: string[]; columns: Record<string, { name: string; type: string; isNullable: boolean; isPrimaryKey: boolean }[]> }>();

const SQL_KEYWORDS: { label: string; insertText: string; doc: string; kind: number }[] = [
  { label: 'SELECT', insertText: 'SELECT ', doc: 'Retrieve rows from a table', kind: 13 },
  { label: 'FROM', insertText: 'FROM ', doc: 'Specify the source table', kind: 13 },
  { label: 'WHERE', insertText: 'WHERE ', doc: 'Filter results', kind: 13 },
  { label: 'AND', insertText: 'AND ', doc: 'Combine conditions', kind: 13 },
  { label: 'OR', insertText: 'OR ', doc: 'Alternative condition', kind: 13 },
  { label: 'IN', insertText: 'IN ', doc: 'Check value membership', kind: 13 },
  { label: 'NOT', insertText: 'NOT ', doc: 'Negate a condition', kind: 13 },
  { label: 'NULL', insertText: 'NULL', doc: 'Represents no value', kind: 13 },
  { label: 'IS', insertText: 'IS ', doc: 'Compare with NULL or TRUE/FALSE', kind: 13 },
  { label: 'BETWEEN', insertText: 'BETWEEN ', doc: 'Range check', kind: 13 },
  { label: 'LIKE', insertText: 'LIKE ', doc: 'Pattern matching', kind: 13 },
  { label: 'ORDER BY', insertText: 'ORDER BY ', doc: 'Sort results', kind: 13 },
  { label: 'GROUP BY', insertText: 'GROUP BY ', doc: 'Group rows for aggregation', kind: 13 },
  { label: 'HAVING', insertText: 'HAVING ', doc: 'Filter groups', kind: 13 },
  { label: 'LIMIT', insertText: 'LIMIT ', doc: 'Limit number of rows', kind: 13 },
  { label: 'OFFSET', insertText: 'OFFSET ', doc: 'Skip rows', kind: 13 },
  { label: 'JOIN', insertText: 'JOIN ', doc: 'Join tables', kind: 13 },
  { label: 'INNER JOIN', insertText: 'INNER JOIN ', doc: 'Inner join', kind: 13 },
  { label: 'LEFT JOIN', insertText: 'LEFT JOIN ', doc: 'Left outer join', kind: 13 },
  { label: 'RIGHT JOIN', insertText: 'RIGHT JOIN ', doc: 'Right outer join', kind: 13 },
  { label: 'CROSS JOIN', insertText: 'CROSS JOIN ', doc: 'Cross join', kind: 13 },
  { label: 'ON', insertText: 'ON ', doc: 'Join condition', kind: 13 },
  { label: 'AS', insertText: 'AS ', doc: 'Alias', kind: 13 },
  { label: 'DISTINCT', insertText: 'DISTINCT ', doc: 'Remove duplicates', kind: 13 },
  { label: 'UNION', insertText: 'UNION ', doc: 'Combine result sets', kind: 13 },
  { label: 'ALL', insertText: 'ALL ', doc: 'Include duplicates', kind: 13 },
  { label: 'CASE', insertText: 'CASE WHEN ${1:condition} THEN ${2:result} END', doc: 'Conditional expression', kind: 17 },
  { label: 'INSERT INTO', insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values});', doc: 'Insert rows', kind: 17 },
  { label: 'UPDATE', insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition};', doc: 'Update rows', kind: 17 },
  { label: 'DELETE FROM', insertText: 'DELETE FROM ${1:table} WHERE ${2:condition};', doc: 'Delete rows', kind: 17 },
  { label: 'CREATE TABLE', insertText: 'CREATE TABLE ${1:name} (\n  ${2:column} ${3:type}\n);', doc: 'Create a new table', kind: 17 },
  { label: 'ALTER TABLE', insertText: 'ALTER TABLE ${1:table} ', doc: 'Modify a table', kind: 17 },
  { label: 'DROP TABLE', insertText: 'DROP TABLE IF EXISTS ${1:table};', doc: 'Drop a table', kind: 17 },
  { label: 'CREATE INDEX', insertText: 'CREATE INDEX ${1:idx_name} ON ${2:table} (${3:column});', doc: 'Create an index', kind: 17 },
  { label: 'CREATE VIEW', insertText: 'CREATE VIEW ${1:view_name} AS ${2:SELECT ...};', doc: 'Create a view', kind: 17 },
  { label: 'CREATE PROCEDURE', insertText: 'CREATE PROCEDURE ${1:name}()\nBEGIN\n  ${2:body}\nEND;', doc: 'Create a stored procedure', kind: 17 },
  { label: 'CREATE FUNCTION', insertText: 'CREATE FUNCTION ${1:name}() RETURNS ${2:type}\nBEGIN\n  ${3:body}\nEND;', doc: 'Create a function', kind: 17 },
  { label: 'CREATE TRIGGER', insertText: 'CREATE TRIGGER ${1:name} ${2:BEFORE|AFTER} ${3:INSERT|UPDATE|DELETE} ON ${4:table}\nFOR EACH ROW\nBEGIN\n  ${5:body}\nEND;', doc: 'Create a trigger', kind: 17 },
  { label: 'EXISTS', insertText: 'EXISTS ', doc: 'Check existence in subquery', kind: 13 },
  { label: 'ANY', insertText: 'ANY ', doc: 'Compare with any subquery value', kind: 13 },
  { label: 'SOME', insertText: 'SOME ', doc: 'Synonym for ANY', kind: 13 },
  { label: 'WITH', insertText: 'WITH ', doc: 'Common Table Expression', kind: 13 },
  { label: 'RECURSIVE', insertText: 'RECURSIVE ', doc: 'Recursive CTE', kind: 13 },
  { label: 'EXPLAIN', insertText: 'EXPLAIN ', doc: 'Show query execution plan', kind: 13 },
  { label: 'DESCRIBE', insertText: 'DESCRIBE ', doc: 'Show table structure', kind: 13 },
];

const SQL_FUNCTIONS: { label: string; insertText: string; doc: string }[] = [
  { label: 'COUNT', insertText: 'COUNT(${1:*})', doc: 'Count rows' },
  { label: 'SUM', insertText: 'SUM(${1:column})', doc: 'Sum values' },
  { label: 'AVG', insertText: 'AVG(${1:column})', doc: 'Average value' },
  { label: 'MIN', insertText: 'MIN(${1:column})', doc: 'Minimum value' },
  { label: 'MAX', insertText: 'MAX(${1:column})', doc: 'Maximum value' },
  { label: 'COALESCE', insertText: 'COALESCE(${1:column}, ${2:default})', doc: 'First non-null value' },
  { label: 'IFNULL', insertText: 'IFNULL(${1:column}, ${2:default})', doc: 'Replace null with default' },
  { label: 'NULLIF', insertText: 'NULLIF(${1:a}, ${2:b})', doc: 'Null if equal' },
  { label: 'CAST', insertText: 'CAST(${1:value} AS ${2:type})', doc: 'Convert data type' },
  { label: 'CONVERT', insertText: 'CONVERT(${1:value}, ${2:type})', doc: 'Convert data type' },
  { label: 'CONCAT', insertText: 'CONCAT(${1:a}, ${2:b})', doc: 'Concatenate strings' },
  { label: 'SUBSTRING', insertText: 'SUBSTRING(${1:str}, ${2:pos}, ${3:len})', doc: 'Extract substring' },
  { label: 'LENGTH', insertText: 'LENGTH(${1:str})', doc: 'String length' },
  { label: 'TRIM', insertText: 'TRIM(${1:str})', doc: 'Remove whitespace' },
  { label: 'UPPER', insertText: 'UPPER(${1:str})', doc: 'Uppercase' },
  { label: 'LOWER', insertText: 'LOWER(${1:str})', doc: 'Lowercase' },
  { label: 'NOW', insertText: 'NOW()', doc: 'Current timestamp' },
  { label: 'CURDATE', insertText: 'CURDATE()', doc: 'Current date' },
  { label: 'DATE_FORMAT', insertText: 'DATE_FORMAT(${1:date}, \'${2:%Y-%m-%d}\')', doc: 'Format date' },
  { label: 'DATEDIFF', insertText: 'DATEDIFF(${1:a}, ${2:b})', doc: 'Date difference' },
  { label: 'EXTRACT', insertText: 'EXTRACT(${1:YEAR} FROM ${2:date})', doc: 'Extract date part' },
  { label: 'ROUND', insertText: 'ROUND(${1:num}, ${2:decimals})', doc: 'Round number' },
  { label: 'ABS', insertText: 'ABS(${1:num})', doc: 'Absolute value' },
];

async function loadSchemaIfNeeded(): Promise<{ tables: string[]; columns: Record<string, { name: string; type: string; isNullable: boolean; isPrimaryKey: boolean }[]> }> {
  const appState = useAppStore.getState();
  const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  const connId = activeTab?.connectionId;
  if (!connId) return { tables: [], columns: {} };
  const db = appState.activeConnection?.database;
  if (schemaCache.has(connId)) {
    return schemaCache.get(connId)!;
  }
  try {
    const tbls = await schemaService.getTables(connId, db);
    const tables = tbls.map((t) => t.name);
    const columns: Record<string, { name: string; type: string; isNullable: boolean; isPrimaryKey: boolean }[]> = {};
    await Promise.all(
      tables.map(async (n) => {
        try {
          columns[n] = (await schemaService.getColumns(connId, n, db)).map((c) => ({
            name: c.name,
            type: c.type,
            isNullable: c.isNullable,
            isPrimaryKey: c.isPrimaryKey,
          }));
        } catch {
          // skip
        }
      }),
    );
    schemaCache.set(connId, { tables, columns });
    return { tables, columns };
  } catch {
    return { tables: [], columns: {} };
  }
}

export function sqlCompletionSource(context: CompletionContext): Promise<CompletionResult | null> | CompletionResult | null {
  const before = context.matchBefore(/\w*$/);
  if (!before) return null;
  const word = before.text;
  const line = context.state.doc.lineAt(context.pos);
  const textBeforeCursor = line.text.slice(0, context.pos - line.from);

  const cached = useAssistantStore.getState().schemaCache;
  let tables = cached.tables.map((t) => t.name);
  let columns = cached.columns as Record<string, { name: string; type: string; isNullable: boolean; isPrimaryKey: boolean }[]>;

  const from = before.from;

  const afterDotMatch = textBeforeCursor.match(/(\w+)\.\s*$/);

  if (afterDotMatch) {
    const colList = (columns[afterDotMatch[1]] || []).filter((c) => c.name.toLowerCase().includes(word.toLowerCase()));
    return {
      from,
      options: colList.map((col) => ({
        label: col.name,
        type: 'property',
        detail: col.type,
        info: `${col.name} (${col.type})${col.isPrimaryKey ? ' PK' : ''}${col.isNullable ? '' : ' NOT NULL'}`,
      })),
    };
  }

  return loadSchemaIfNeeded().then((schema) => {
    if (schema.tables.length > 0) {
      tables = schema.tables;
      columns = schema.columns;
    }

    const options: Completion[] = [];

    for (const tbl of tables.filter((t) => t.toLowerCase().includes(word.toLowerCase()))) {
      const colList = columns[tbl] || [];
      options.push({
        label: tbl,
        type: 'class',
        detail: 'TABLE',
        info: `Table: ${tbl}${colList.length > 0 ? ` (${colList.length} columns)` : ''}`,
      });
    }

    for (const cols of Object.values(columns)) {
      for (const col of cols) {
        if (!col.name.toLowerCase().includes(word.toLowerCase())) continue;
        options.push({
          label: col.name,
          type: 'property',
          detail: col.type,
          info: `Column: ${col.name} (${col.type})${col.isPrimaryKey ? ' PK' : ''}`,
        });
      }
    }

    for (const kw of SQL_KEYWORDS) {
      if (!kw.label.toLowerCase().includes(word.toLowerCase())) continue;
      options.push({
        label: kw.label,
        type: kw.kind === 17 ? 'text' : 'keyword',
        detail: kw.doc,
        apply: kw.insertText,
        boost: kw.kind === 17 ? 0.9 : 0.8,
      });
    }

    for (const fn of SQL_FUNCTIONS) {
      if (!fn.label.toLowerCase().includes(word.toLowerCase())) continue;
      options.push({
        label: fn.label,
        type: 'function',
        detail: fn.doc,
        apply: fn.insertText,
      });
    }

    return { from, options };
  });
}

export const sqlAutocomplete = autocompletion({ override: [sqlCompletionSource] });

export function mongoShellCompletionSource(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/\w*\.?\w*$/);
  if (!before) return null;
  const word = before.text;
  const line = context.state.doc.lineAt(context.pos);
  const textBeforeCursor = line.text.slice(0, context.pos - line.from);
  const from = before.from;

  const options: Completion[] = [];

  const startsDollar = textBeforeCursor.trimEnd().endsWith('$') || word.startsWith('$');
  if (startsDollar) {
    for (const op of MONGO_OPERATORS) {
      options.push({
        label: op,
        type: 'constant',
        apply: op,
        info: `MongoDB operator: ${op}`,
      });
    }
  }

  if (textBeforeCursor.endsWith('.') && word.endsWith('.')) {
    for (const method of MONGO_METHODS) {
      options.push({
        label: method,
        type: 'function',
        apply: `${method}($1)`,
        info: `db.collection.${method}(...)`,
      });
    }
  }

  const isStart = /^\s*$/.test(textBeforeCursor) || textBeforeCursor.trim().startsWith('db.');
  if (isStart) {
    options.push(
      { label: 'db.collection.find', type: 'function', apply: 'db.${1:collection}.find({ ${2} })', info: 'Find documents in a collection' },
      { label: 'db.collection.findOne', type: 'function', apply: 'db.${1:collection}.findOne({ ${2} })', info: 'Find a single document' },
      { label: 'db.collection.aggregate', type: 'function', apply: 'db.${1:collection}.aggregate([\n  { \\$match: { ${2} } },\n  { \\$group: { _id: "\\$${3:field}", count: { \\$sum: 1 } } }\n])', info: 'Aggregation pipeline' },
      { label: 'db.collection.insertOne', type: 'function', apply: 'db.${1:collection}.insertOne({ ${2} })', info: 'Insert a document' },
      { label: 'db.collection.updateOne', type: 'function', apply: 'db.${1:collection}.updateOne({ ${2} }, { \\$set: { ${3} } })', info: 'Update a single document' },
      { label: 'db.collection.deleteOne', type: 'function', apply: 'db.${1:collection}.deleteOne({ ${2} })', info: 'Delete a single document' },
      { label: 'db.collection.countDocuments', type: 'function', apply: 'db.${1:collection}.countDocuments({ ${2} })', info: 'Count documents' },
    );
  }

  return { from, options };
}

export const mongoShellAutocomplete = autocompletion({ override: [mongoShellCompletionSource] });
