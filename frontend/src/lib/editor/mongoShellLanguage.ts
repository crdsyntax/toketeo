import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const MONGO_SHELL_LANGUAGE_ID = 'mongodb-shell';

const MONGO_KEYWORDS = new Set([
  'db', 'use', 'show', 'help', 'exit', 'quit',
]);

const MONGO_METHODS = new Set([
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
]);

const MONGO_OPERATORS = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
  '$and', '$or', '$not', '$nor',
  '$exists', '$type',
  '$all', '$elemMatch', '$size',
  '$regex', '$options',
  '$set', '$unset', '$push', '$pull', '$addToSet', '$inc', '$mul',
  '$rename', '$min', '$max', '$currentDate', '$pop',
  '$match', '$group', '$sort', '$project', '$limit', '$skip',
  '$unwind', '$lookup', '$addFields', '$replaceRoot', '$count',
  '$sum', '$avg', '$first', '$last',
]);

const MONGO_METHOD_REGEX = new RegExp(
  `\\.\\s*(${Array.from(MONGO_METHODS).join('|')})\\b`,
);

const MONGO_BUILTINS = new Set([
  'ObjectId', 'ISODate', 'NumberLong', 'NumberDecimal', 'BinData', 'Timestamp', 'UUID',
]);

const mongoShellParser: StreamParser<{ inString: '"' | "'" | null; inBlockComment: boolean }> = {
  startState: () => ({ inString: null, inBlockComment: false }),

  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match(/\*\//)) {
        state.inBlockComment = false;
        return 'comment';
      }
      stream.next();
      return 'comment';
    }

    if (state.inString) {
      if (stream.match(/\\\\./)) return 'string.escape';
      if (stream.match(state.inString === '"' ? /"/ : /'/)) {
        state.inString = null;
        return 'string.quote';
      }
      stream.next();
      return 'string';
    }

    if (stream.sol()) stream.eatSpace();

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'comment';
    }
    if (stream.match('"')) {
      state.inString = '"';
      return 'string.quote';
    }
    if (stream.match("'")) {
      state.inString = "'";
      return 'string.quote';
    }
    if (stream.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)) {
      const word = stream.current();
      if (MONGO_KEYWORDS.has(word)) return 'keyword';
      if (MONGO_BUILTINS.has(word)) return 'support.class';
      stream.backUp(stream.current().length);
    }
    if (stream.match(/\$[A-Za-z]+/)) return 'support.type';
    if (stream.match(/-?\d+(\.\d+)?/)) return 'number';
    if (stream.match(/\b(true|false|null|undefined)\b/)) return 'constant.language';
    if (stream.match(MONGO_METHOD_REGEX)) return 'support.function';
    if (stream.match(/[A-Za-z_$][A-Za-z0-9_$]*(?=\s*:)/)) return 'key';
    if (stream.match(/[A-Za-z_$][A-Za-z0-9_$.]*/)) return 'identifier';
    if (stream.match(/[{}()[\].,:]/)) return 'delimiter';
    stream.next();
    return null;
  },
};

export const mongoShellLanguage = StreamLanguage.define({
  ...mongoShellParser,
  tokenTable: {
    keyword: t.keyword,
    'support.function': t.function(t.variableName),
    'support.type': t.typeName,
    'support.class': t.className,
    'constant.language': t.constant(t.bool),
    number: t.number,
    string: t.string,
    'string.quote': t.string,
    'string.escape': t.escape,
    comment: t.lineComment,
    key: t.propertyName,
    'delimiter.bracket': t.bracket,
    delimiter: t.punctuation,
    identifier: t.name,
  },
});

export { MONGO_METHODS, MONGO_OPERATORS };
