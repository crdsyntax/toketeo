import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';

export const mongoShellHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#C792EA', fontWeight: 'bold' },
  { tag: t.function(t.variableName), color: '#82AAFF' },
  { tag: t.typeName, color: '#FF5370', fontWeight: 'bold' },
  { tag: t.className, color: '#FFCB6B' },
  { tag: t.bool, color: '#F78C6C' },
  { tag: t.null, color: '#F78C6C' },
  { tag: t.number, color: '#F78C6C' },
  { tag: t.string, color: '#C3E88D' },
  { tag: t.string, color: '#C3E88D' },
  { tag: t.escape, color: '#FFCB6B' },
  { tag: t.comment, color: '#546E7A', fontStyle: 'italic' },
  { tag: t.propertyName, color: '#B2CCD6' },
  { tag: t.punctuation, color: '#89DDFF' },
  { tag: t.bracket, color: '#89DDFF' },
  { tag: t.name, color: '#EEFFFF' },
]);

const mongoShellEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0a0a0a',
      color: '#EEFFFF',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: '#EEFFFF',
      fontFamily: 'var(--font-mono, Consolas, monospace)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#EEFFFF',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#264F78',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
    '.cm-gutters': {
      backgroundColor: '#0a0a0a',
      color: '#676E95',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
  },
  { dark: true },
);

export const mongoShellTheme = [mongoShellEditorTheme, syntaxHighlighting(mongoShellHighlightStyle)];

export const vsDarkTheme = oneDark;

export const bracketMatchingTheme = EditorView.theme({
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(137, 221, 255, 0.2)',
    outline: '1px solid #89DDFF',
  },
  '.cm-nonmatchingBracket': {
    backgroundColor: 'rgba(255, 83, 112, 0.2)',
  },
});
