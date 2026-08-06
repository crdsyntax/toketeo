import { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL, MSSQL } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { bracketMatching } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { mongoShellLanguage, MONGO_SHELL_LANGUAGE_ID } from '@/lib/editor/mongoShellLanguage';
import { mongoShellTheme, vsDarkTheme, bracketMatchingTheme } from '@/lib/editor/themes';
import { sqlAutocomplete, mongoShellAutocomplete } from '@/lib/editor/completions';

export interface SqlEditorOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  tabSize?: number;
  wordWrap?: 'on' | 'off';
  paddingTop?: number;
  readonly?: boolean;
}

interface SqlCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  height?: string | number;
  options?: SqlEditorOptions;
  onMount?: (view: EditorView) => void;
  extensions?: Extension[];
}

export function SqlCodeEditor({ value, onChange, language, height, options = {}, onMount, extensions = [] }: SqlCodeEditorProps) {
  const exts = useMemo(() => {
    const list: Extension[] = [history(), keymap.of(defaultKeymap), keymap.of(historyKeymap)];
    const lang = language ?? 'sql';
    if (lang === MONGO_SHELL_LANGUAGE_ID) {
      list.push(mongoShellLanguage, mongoShellTheme, bracketMatching(), bracketMatchingTheme);
    } else if (lang === 'json') {
      list.push(json(), vsDarkTheme, bracketMatching(), bracketMatchingTheme);
    } else if (lang === 'pgsql') {
      list.push(sql({ dialect: PostgreSQL }), vsDarkTheme, bracketMatching(), bracketMatchingTheme);
    } else if (lang === 'tsql') {
      list.push(sql({ dialect: MSSQL }), vsDarkTheme, bracketMatching(), bracketMatchingTheme);
    } else {
      list.push(sql(), vsDarkTheme, bracketMatching(), bracketMatchingTheme);
    }

    if (lang === MONGO_SHELL_LANGUAGE_ID) {
      list.push(mongoShellAutocomplete);
    } else if (lang === 'sql' || lang === 'pgsql' || lang === 'tsql') {
      list.push(sqlAutocomplete);
    }

    if (options.tabSize) list.push(EditorState.tabSize.of(options.tabSize));
    if (options.wordWrap === 'on') list.push(EditorView.lineWrapping);
    if (options.readonly) list.push(EditorState.readOnly.of(true));

    list.push(
      EditorView.theme({
        '&': {
          fontSize: `${options.fontSize ?? 13}px`,
          height: '100%',
          minHeight: '0',
          backgroundColor: 'transparent',
        },
        '.cm-editor': {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: '0',
        },
        '.cm-scroller': {
          overflow: 'auto !important',
          minHeight: '0',
          flex: '1 1 auto',
          position: 'relative',
          overscrollBehavior: 'contain',
          fontFamily: options.fontFamily || 'var(--font-mono, Consolas, monospace)',
          lineHeight: options.lineHeight ? `${options.lineHeight}` : '1.6',
        },
        '.cm-content': {
          minHeight: '100%',
          paddingTop: options.paddingTop ? `${options.paddingTop}px` : '0px',
        },
      }),
    );

    if (extensions.length > 0) list.push(...extensions);

    return list;
  }, [language, options.fontSize, options.fontFamily, options.lineHeight, options.tabSize, options.wordWrap, options.paddingTop, options.readonly, extensions]);

  const handleChange = useCallback(
    (val: string) => {
      onChange?.(val);
    },
    [onChange],
  );

  const handleCreate = useCallback(
    (view: EditorView) => {
      onMount?.(view);
    },
    [onMount],
  );

  return (
    <div className="h-full w-full min-h-0 overflow-hidden">
      <CodeMirror
        value={value}
        height={String(height ?? '100%')}
        extensions={exts}
        onChange={handleChange}
        onCreateEditor={handleCreate}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          autocompletion: false,
          highlightSelectionMatches: true,
        }}
        theme="none"
      />
    </div>
  );
}
