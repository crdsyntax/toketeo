/**
 * Monaco language definition for MongoDB Shell syntax.
 *
 * Registers:
 *  - A custom "mongodb-shell" language with syntax highlighting
 *  - Autocomplete provider for db.<collection>.<method>() patterns
 */
import type * as monaco from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';

export const MONGO_SHELL_LANGUAGE_ID = 'mongodb-shell';

const MONGO_KEYWORDS = [
  'db', 'use', 'show', 'help', 'exit', 'quit',
];

const MONGO_METHODS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'insertOne', 'insertMany',
  'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany',
  'countDocuments', 'estimatedDocumentCount', 'count',
  'aggregate',
  'distinct',
  'drop', 'dropIndex', 'dropIndexes',
  'createIndex', 'createIndexes',
  'getIndexes', 'listIndexes',
  'bulkWrite',
  'sort', 'limit', 'skip', 'project', 'projection',
  'pretty', 'toArray', 'forEach',
  'explain',
];

const MONGO_OPERATORS = [
  // Comparison
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
  // Logical
  '$and', '$or', '$not', '$nor',
  // Element
  '$exists', '$type',
  // Array
  '$all', '$elemMatch', '$size',
  // Regex
  '$regex', '$options',
  // Update operators
  '$set', '$unset', '$push', '$pull', '$addToSet', '$inc', '$mul',
  '$rename', '$min', '$max', '$currentDate', '$pop',
  // Aggregation
  '$match', '$group', '$sort', '$project', '$limit', '$skip',
  '$unwind', '$lookup', '$addFields', '$replaceRoot', '$count',
  '$sum', '$avg', '$first', '$last', '$push', '$addToSet',
];

/**
 * Register the MongoDB shell language with Monaco.
 * Safe to call multiple times (guards against double registration).
 */
export function registerMongoShellLanguage(monacoInstance: Monaco): void {
  const languages = monacoInstance.languages as typeof monacoInstance.languages & {
    mongoShellRegistered?: boolean;
  };
  if (languages.mongoShellRegistered) return;
  languages.mongoShellRegistered = true;

  // Register language
  monacoInstance.languages.register({ id: MONGO_SHELL_LANGUAGE_ID });

  // Monarch tokenizer for syntax highlighting
  monacoInstance.languages.setMonarchTokensProvider(MONGO_SHELL_LANGUAGE_ID, {
    keywords: MONGO_KEYWORDS,
    methods: MONGO_METHODS,
    operators: MONGO_OPERATORS,

    tokenizer: {
      root: [
        // db.collection.method() — highlight "db" keyword
        [/\bdb\b/, 'keyword'],

        // Method names after dot
        [/(?<=\.)\b(find|findOne|aggregate|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|count|countDocuments|distinct|drop|createIndex|sort|limit|skip|project|projection)\b/, 'support.function'],

        // MongoDB operators
        [/\$[a-zA-Z]+/, 'support.type'],

        // Numbers
        [/-?\d+(\.\d+)?/, 'number'],

        // Booleans / null
        [/\b(true|false|null|undefined)\b/, 'constant.language'],

        // ObjectId, ISODate, etc.
        [/\b(ObjectId|ISODate|NumberLong|NumberDecimal|BinData|Timestamp|UUID)\b/, 'support.class'],

        // Double-quoted strings
        [/"/, { token: 'string.quote', next: '@string_double' }],
        // Single-quoted strings
        [/'/, { token: 'string.quote', next: '@string_single' }],

        // Line comments
        [/\/\/.*$/, 'comment'],
        // Block comments
        [/\/\*/, { token: 'comment', next: '@block_comment' }],

        // Brackets
        [/[{}()[\]]/, 'delimiter.bracket'],

        // Property keys (before colon)
        [/[A-Za-z_$][A-Za-z0-9_$]*(?=\s*:)/, 'key'],

        // Identifiers
        [/[A-Za-z_$][A-Za-z0-9_$.]*/, 'identifier'],

        // Punctuation
        [/[,:]/, 'delimiter'],
      ],

      string_double: [
        [/[^"\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],

      string_single: [
        [/[^'\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, { token: 'string.quote', next: '@pop' }],
      ],

      block_comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, { token: 'comment', next: '@pop' }],
        [/[/*]/, 'comment'],
      ],
    },
  });

  // Language configuration (brackets, auto-closing pairs, etc.)
  monacoInstance.languages.setLanguageConfiguration(MONGO_SHELL_LANGUAGE_ID, {
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    indentationRules: {
      increaseIndentPattern: /^.*[{([]\s*$/,
      decreaseIndentPattern: /^\s*[})\]]/,
    },
  });

  // Autocomplete provider
  monacoInstance.languages.registerCompletionItemProvider(MONGO_SHELL_LANGUAGE_ID, {
    triggerCharacters: ['.', '$', '"'],
    provideCompletionItems: (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Suggest db.collection.method() snippets
      const isStart = /^\s*$/.test(lineContent.slice(0, position.column - 1));
      if (isStart || lineContent.trim().startsWith('db.')) {
        suggestions.push(
          {
            label: 'db.collection.find',
            kind: 27, // Function
            insertText: 'db.${1:collection}.find({ ${2} })',
            insertTextRules: 4,
            documentation: 'Find documents in a collection',
            range,
          },
          {
            label: 'db.collection.find+sort+limit',
            kind: 27,
            insertText: 'db.${1:collection}.find({ ${2} }).sort({ ${3:_id}: -1 }).limit(${4:20})',
            insertTextRules: 4,
            documentation: 'Find documents with sort and limit',
            range,
          },
          {
            label: 'db.collection.findOne',
            kind: 27,
            insertText: 'db.${1:collection}.findOne({ ${2} })',
            insertTextRules: 4,
            documentation: 'Find a single document',
            range,
          },
          {
            label: 'db.collection.aggregate',
            kind: 27,
            insertText: [
              'db.${1:collection}.aggregate([',
              '  { \\$match: { ${2} } },',
              '  { \\$group: { _id: "\\$${3:field}", count: { \\$sum: 1 } } },',
              '  { \\$sort: { count: -1 } }',
              '])',
            ].join('\n'),
            insertTextRules: 4,
            documentation: 'Aggregation pipeline',
            range,
          },
          {
            label: 'db.collection.insertOne',
            kind: 27,
            insertText: 'db.${1:collection}.insertOne({ ${2} })',
            insertTextRules: 4,
            documentation: 'Insert a document',
            range,
          },
          {
            label: 'db.collection.updateOne',
            kind: 27,
            insertText: 'db.${1:collection}.updateOne({ ${2} }, { \\$set: { ${3} } })',
            insertTextRules: 4,
            documentation: 'Update a single document',
            range,
          },
          {
            label: 'db.collection.deleteOne',
            kind: 27,
            insertText: 'db.${1:collection}.deleteOne({ ${2} })',
            insertTextRules: 4,
            documentation: 'Delete a single document',
            range,
          },
          {
            label: 'db.collection.countDocuments',
            kind: 27,
            insertText: 'db.${1:collection}.countDocuments({ ${2} })',
            insertTextRules: 4,
            documentation: 'Count documents',
            range,
          },
        );
      }

      // Suggest $operators
      const beforeCursor = lineContent.slice(0, position.column - 1);
      if (beforeCursor.trimEnd().endsWith('$') || word.word.startsWith('$')) {
        for (const op of MONGO_OPERATORS) {
          suggestions.push({
            label: op,
            kind: 21, // Value
            insertText: op.slice(1), // without $, Monaco will prefix it
            documentation: `MongoDB operator: ${op}`,
            range,
          });
        }
      }

      // Chain methods after .
      if (beforeCursor.endsWith('.')) {
        for (const method of MONGO_METHODS) {
          suggestions.push({
            label: method,
            kind: 27,
            insertText: `${method}($1)`,
            insertTextRules: 4,
            documentation: `db.collection.${method}(...)`,
            range,
          });
        }
      }

      return { suggestions };
    },
  });
}

/**
 * Define a custom dark theme for MongoDB shell language.
 * Call once before the editor mounts.
 */
export function defineMongoTheme(monacoInstance: Monaco): void {
  monacoInstance.editor.defineTheme('mongo-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C792EA', fontStyle: 'bold' },
      { token: 'support.function', foreground: '82AAFF' },
      { token: 'support.type', foreground: 'FF5370', fontStyle: 'bold' },
      { token: 'support.class', foreground: 'FFCB6B' },
      { token: 'constant.language', foreground: 'F78C6C' },
      { token: 'number', foreground: 'F78C6C' },
      { token: 'string', foreground: 'C3E88D' },
      { token: 'string.quote', foreground: 'C3E88D' },
      { token: 'string.escape', foreground: 'FFCB6B' },
      { token: 'comment', foreground: '546E7A', fontStyle: 'italic' },
      { token: 'key', foreground: 'B2CCD6' },
      { token: 'delimiter.bracket', foreground: '89DDFF' },
      { token: 'delimiter', foreground: '89DDFF' },
      { token: 'identifier', foreground: 'EEFFFF' },
    ],
    colors: {},
  });
}
