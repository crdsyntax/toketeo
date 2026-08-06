# Plan de migración: editor de consultas propio (sin dependencias)

> Rol: Tech Leader (frontend). Estado: **borrador para aprobación**.
> Propietario: equipo frontend. Objetivo: eliminar CodeMirror y sus dependencias
> (`@uiw/react-codemirror`, `@codemirror/*`, `@lezer/*`) reemplazándolo por un
> editor propio mantenible, testeable y sin dependencias de terceros.

---

## 1. Contexto y motivación

Hoy el editor de SQL/Mongo del Query Editor es CodeMirror 6 vía `@uiw/react-codemirror`.
La migración elimina 10 dependencias directas/transitivas y nos da control total del
comportamiento, el estilo y el rendimiento.

### 1.1 Dependencias a eliminar

| Paquete | Uso actual |
| --- | --- |
| `@uiw/react-codemirror` | Wrapper React del editor |
| `@codemirror/state` | Modelo de documento, selección, transacciones |
| `@codemirror/view` | Renderizado, DOM, keymap, lineWrapping |
| `@codemirror/commands` | `defaultKeymap`, `historyKeymap`, undo/redo |
| `@codemirror/language` | `StreamLanguage`, `bracketMatching`, `HighlightStyle` |
| `@codemirror/lang-sql` | Gramática SQL (dialectos genérico, PostgreSQL, MSSQL) |
| `@codemirror/lang-json` | Gramática JSON |
| `@codemirror/autocomplete` | Autocompletado SQL/Mongo |
| `@codemirror/theme-one-dark` | Tema "VS Dark" para SQL/JSON |
| `@lezer/highlight` | Tags de sintaxis (transitiva) |

### 1.2 Superficie afectada (archivos)

- `frontend/src/components/editor/SqlCodeEditor.tsx` — wrapper React (punto único de entrada).
- `frontend/src/lib/editor/mongoShellLanguage.ts` — tokenizador Mongo (se **porta**, no se descarta).
- `frontend/src/lib/editor/themes.ts` — temas y estilos (se porta a tokens CSS).
- `frontend/src/lib/editor/completions.ts` — lógica de autocompletado (se porta).
- `frontend/src/components/query/panels/SqlEditorPanel.tsx` — estado de vista por pestaña, keymap, paste, status bar.
- `frontend/src/hooks/useQueryEditor.ts` — usa el handle del editor (`editorRef`) para ejecutar/salvar.
- `frontend/src/components/explorer/CreateObjectModal.tsx` y `frontend/src/components/explorer/tabs/DdlTab.tsx` — consumidores secundarios (sin `extensions`).

### 1.3 Normas de arquitectura (frontend)

- El **core es lógica pura sin DOM** y 100% testeable en vitest.
- Frontend es capa de render de metadatos: **cero inferencia de dominio** fuera del core.
- La **fuente de verdad del texto y de la selección vive en el core**, no en el DOM.
- Módulos autocontenidos: `components/editor/` (React+DOM) y `lib/editor/` (núcleo puro).
- Un cambio por PR, con hitos verificables (fases 2-7).

---

## 2. Arquitectura objetivo

```
frontend/src/
├── lib/editor/
│   ├── core/                  # Lógica pura, sin DOM, testeable
│   │   ├── doc.ts             # Modelo de documento (texto + índices de línea)
│   │   ├── position.ts        # Cálculo de posiciones (lineAt, offsets, UTF-16)
│   │   ├── state.ts           # EditorState { doc, selection, tabSize } + reducer
│   │   ├── selection.ts       # Rango selección { anchor, head }
│   │   ├── transaction.ts     # Aplicación de cambios → nuevo estado
│   │   ├── history.ts         # Undo/redo por transacción (merge de tipeo)
│   │   ├── keymap.ts          # Definición declarativa de bindings → comandos
│   │   ├── brackets.ts        # Coincidencia de pares () [] {} (puro)
│   │   ├── wordwrap.ts        # Corte de líneas visuales (puro)
│   │   ├── folding.ts         # Plegado por indentación/llaves (heurístico)
│   │   ├── syntax/
│   │   │   ├── sql.ts         # Tokenizador SQL (genérico + dialectos)
│   │   │   ├── json.ts        # Tokenizador JSON
│   │   │   └── mongosh.ts     # Port del tokenizador actual (mongoShellLanguage.ts)
│   │   ├── highlight.ts       # token → clase/token de tema
│   │   └── completion/
│   │       ├── sql.ts         # Palabras clave, funciones, tablas/columnas (schema)
│   │       └── mongosh.ts     # $operadores, métodos, snippets db.collection
│   └── themes.ts              # Tokens de tema (mongo-shell, vs-dark) → CSS vars
├── components/editor/
│   ├── SqlCodeEditor.tsx      # Wrapper React controlado (misma API de props)
│   ├── CodeEditorView.ts      # Clase "View": DOM, caret, selección, input, scroll
│   ├── render.ts              # Render de líneas visibles (virtualizado) + highlight
│   ├── autocomplete.tsx       # Popover de autocompletado (React puro)
│   ├── gutters.tsx            # Line numbers, fold gutter, active line
│   └── editor.css             # Estilos base (theme-agnostic) + vars por tema
└── store/useAppStore.ts       # EditorViewState se mantiene (sin cambios)
```

Principio rector: **el DOM es una proyección del estado**. Cada interacción del usuario
produce un evento que el core reduce a una transacción; la View redibuja lo mínimo.

---

## 3. Contrato de API (lo que los consumidores deben conservar)

`SqlCodeEditor` conserva las mismas props para no romper `DdlTab` y `CreateObjectModal`:

```ts
interface SqlEditorOptions {
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
  language?: 'sql' | 'pgsql' | 'tsql' | 'json' | 'mongodb-shell';
  height?: string | number;
  options?: SqlEditorOptions;
  onMount?: (handle: CodeEditorHandle) => void;
  keybindings?: Record<'Mod-Enter' | 'F5', () => void>;   // NUEVO: reemplaza `extensions`
}
```

El handle `CodeEditorHandle` reproduce exactamente lo que hoy usa el código:

```ts
interface CodeEditorHandle {
  state: { doc: string; lineAt(pos): { number; from; to; text }; selection: SelectionRange };
  sliceDoc(from: number, to: number): string;
  dispatch(change: { from; to; insert } | { selection: { anchor; head } }): void;
  scrollDOM: HTMLElement;       // expone scrollTop + eventos scroll
  dom: HTMLElement;             // para listeners paste / keyup / click
  focus(): void;
}
```

### Puntos de integración a mantener (código actual)

| Necesidad | Dónde se usa hoy | Impacto |
| --- | --- | --- |
| `state.doc.toString()` | `useQueryEditor.ts` (ejecutar todo, guardar script) | Handle nuevo |
| `state.doc.lineAt(pos)` | `useQueryEditor.ts` + `SqlEditorPanel.tsx` (Ln/Col) | Handle nuevo |
| `state.selection.main` + `sliceDoc()` | `useQueryEditor.ts` (ejecutar sentencia actual) | Handle nuevo |
| `dispatch({changes, selection})` | paste handler, restore state | Handle nuevo |
| `scrollDOM.scrollTop` (get/set + evento) | persistir/restaurar estado por pestaña | Handle nuevo |
| `dom.addEventListener('paste'/'keyup'/'click')` | paste clipboard + status bar | Handle nuevo |
| `extensions` con `keymap.of([Mod-Enter, F5])` | `SqlEditorPanel.tsx` | **se reemplaza** por prop `keybindings` |

Refactor auxiliar (para testear sin DOM): extraer la extracción de sentencia actual
de `handleExecuteCurrent` a una función pura `extractStatementAtCursor(text, pos)`
en `lib/editor/core/statement.ts` con tests unitarios.

---

## 4. Lista de paridad funcional (checklist contra CodeMirror actual)

Comportamiento observado en `SqlCodeEditor.tsx` + `basicSetup` + opciones:

1. Líneas numeradas + gutter + resaltado de línea activa y gutter activo.
2. Selección múltiple no requerida (solo selección única `main`); caret, selección por click/drag/Shift.
3. Undo/redo (`Ctrl/Cmd-Z`, `Ctrl/Cmd-Y`, `Ctrl/Cmd-Shift-Z`) con merge de tipeo.
4. `wordWrap: 'on'` con corte visual por palabras.
5. `tabSize` configurable (completar con tab expandido al escribir Tab).
6. `readonly` (modo solo lectura).
7. Keybindings: `Mod-Enter` (ejecutar sentencia), `F5` (ejecutar todo) + set base de edición
   (flechas, Home/End, PageUp/Down, Delete/Backspace, Enter, Tab, Ctrl+A/C/X/V/Z/Y).
8. Resaltado de sintaxis: SQL (dialecto genérico, PostgreSQL, MSSQL), JSON, MongoDB shell.
9. Bracket matching: resaltar par coincidente y par no coincidente.
10. Fold gutter (plegado por indentación/llaves — heurístico).
11. `highlightSelectionMatches` (resaltar ocurrencias de la selección).
12. Autocompletado:
    - SQL: palabras clave (lista actual en `completions.ts`), funciones, tablas/columnas del schema (async, cacheado), columnas tras `alias.`.
    - Mongo: operadores `$...`, métodos, snippets `db.collection.*`.
13. Temas: `mongoShell` (colores actuales) y `vsDark`/oneDark para SQL/JSON.
14. Persistencia por pestaña de `{ scrollTop, selection: { anchor, head } }`.
15. Status bar: Ln/Col (via `keyup`) y conteo de chars.
16. Paste especial: si `clipboardData` viene vacío, leer `navigator.clipboard.readText()` e insertar.
17. Opciones de fuente/tamaño/line-height/padding-top desde el store.

Fuera de alcance (no se usa hoy): edición de múltiples cursores, autocompletado disparado por
tab, minimap, modos vi/emacs, find/replace integrado del editor, snippets con `$1` anidados
(se aceptan como texto plano insertado tal cual se insertan hoy).

---

## 5. Fases de implementación

### Fase 1 — Núcleo puro y contrato (sin DOM)
Entregable: `lib/editor/core/` con `doc`, `position`, `state`, `selection`, `transaction`.
- Documento inmutable, índices de línea, `lineAt` en O(log n).
- Reducer puro: `applyTransaction(state, change) → newState` + `sliceDoc`.
- `extractStatementAtCursor(text, pos)` portada desde `useQueryEditor.ts`.
- Tests unitarios (vitest) para todos los módulos.

Verificación: `npm run test` (nuevos specs en `src/lib/editor/core/*.test.ts`), `tsc -b`, `npm run lint`.

### Fase 2 — View mínima (drop-in básico) tras feature flag
Entregable: `CodeEditorView.ts` + `SqlCodeEditor.tsx` con flag `useCustomEditor` (store o env),
default **off**.
- Render de líneas visibles (virtualizado), caret y selección (span overlay), line numbers,
  active line, scroll.
- Input: `beforeinput`/`input`/`keydown` → transacciones; `dispatch`; focus.
- Paste handler actual portado; `keyup`/`click` para capturar estado y Ln/Col.
- Props `value`/`onChange` controladas (ciclo React → core → View).
- En `SqlEditorPanel.tsx`: cambiar `extensions` por prop `keybindings`.

Verificación: manual en dev con flag ON en una pestaña SQL simple (tipeo, scroll, Ln/Col, Ctrl+Enter/F5).

### Fase 3 — Historia, keymap y estado por pestaña
- `history.ts`: undo/redo con merge de ráfagas de tipeo (ventana ~500ms / espacio o saltos de línea).
- `keymap.ts` declarativo + bindings base de edición + `Mod-Enter`/`F5`.
- Persistencia/restauración de `{ scrollTop, selection }` por tab (misma semántica que hoy).

Verificación: tests de merge de historia; manual (undo tras escribir, cambiar pestaña y volver con
scroll/selección intactos).

### Fase 4 — Resaltado de sintaxis y temas
- Portar tokenizador Mongo (`mongoShellLanguage.ts`) a `core/syntax/mongosh.ts` (tokenizador
  por línea que ya es un StreamParser — port directo).
- Tokenizadores SQL y JSON propios (reglas léxicas: palabras clave, cadenas, comentarios,
  números, identificadores, operadores; sin parser completo — solo resaltado).
- `highlight.ts` (token → clase) + `themes.ts` como CSS variables (mongo-shell y vs-dark).
- Bracket matching puro + indicadores visuales.

Verificación: comparación visual frente a CodeMirror actual en los 5 lenguajes + golden tests
por token por lenguaje (array de `(input, token)`).

### Fase 5 — Autocompletado y plegado
- `completion/sql.ts`: portar listas estáticas (`SQL_KEYWORDS`, `SQL_FUNCTIONS`) y el flujo
  async de schema (`schemaService.getTables/getColumns` con el mismo caché por connection).
- `completion/mongosh.ts`: portar `$operators`, métodos, snippets.
- Popover React (`autocomplete.tsx`): navegación con flechas, Enter/Tab acepta, Esc cierra;
  `matchBefore(\w*)` y lógica tras `alias.`.
- `folding.ts` heurístico + fold gutter.

Verificación: tests de las fuentes de completado (puras, con schema fake inyectado); manual
(tipear `SEL`, `alias.`, `$`, `db.`).

### Fase 6 — Cambio completo y limpieza
- Quitar flag `useCustomEditor`, eliminar CodeMirror del bundle.
- `npm uninstall @codemirror/* @uiw/react-codemirror` y eliminar `@lezer` residuales.
- Migrar/revisar `DdlTab.tsx` y `CreateObjectModal.tsx` (no usan `extensions`; solo ajustar
  tipos si aplica).
- Revisar `tauri.conf.json`: el `dangerousDisableAssetCspModification: ["style-src"]` pasa a
  ser **innecesario** (ya no inyectamos `<style>` runtime); mantenerlo no rompe nada, pero
  evaluar revertirlo en un cambio aparte.

Verificación: `npm run build`, `npm run lint`, `npm test`, smoke completo.

---

## 6. Criterios de aceptación (Definition of Done)

1. `SqlCodeEditor` acepta las mismas props y `onMount` devuelve un handle con el contrato de la sección 3.
2. Todos los ítems de la sección 4 cumplidos y verificados en los 3 consumidores.
3. Sin dependencias `@codemirror/*`, `@uiw/*` ni `@lezer/*` en `package.json` ni en el bundle
   (`grep` del lockfile + `vite build` sin esos paquetes).
4. Core (`lib/editor/core/`) con cobertura de tests para: doc/position, transaction, history,
   statement extraction, tokenizadores (golden), brackets, completion.
5. No hay regresiones conocidas en ejecutar selección/sentencia, guardar script, persistencia
   de scroll/selección entre pestañas ni en el paste especial.
6. `tsc -b`, `npm run lint` y `npm test` en verde.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Perf con documentos grandes (p. ej. DDL largos) | Virtualización de líneas visibles; recalc de highlight por línea con cache. |
| IME / composición (acentos, CJK) | Manejar `compositionstart/end`; no aplicar transacciones a medio carácter. |
| Undo/redo "raro" respecto a CodeMirror | Merge de tipeo por ráfaga; tests de secuencias típicas (tipeo, pegado, borrado, deshacer). |
| Regresión en `Ctrl+Enter` tras refactor | `extractStatementAtCursor` testado de forma aislada (mismos casos: multi-sentencia misma línea, cursor tras `;` en blanco). |
| Regresión visual de temas | Golden tokens + comparación visual en los 5 lenguajes en Fase 4. |
| Pérdida de estado por pestaña | API de persistencia idéntica (`EditorViewState` del store); tests de restaurar selección fuera de rango (truncar). |
| Alcance: plegado/heuristic folding imperfecto | Aceptado como deuda consciente; el folding actual de CodeMirror tampoco se usa para ejecutar, solo visual. |
| CSP/build | Al no haber más `<style>` runtime de terceros, el ajuste `style-src` se puede revertir (cambio separado, verificado en build). |

## 8. Métricas de éxito

- Bundle JS de frontend más pequeño (dependencias eliminadas ~10 paquetes).
- `npm install` sin los paquetes de editor.
- Tiempo de primer teclado en editor sin cambios perceptibles.
- Cero deps nuevas de terceros: **todo lo del editor es código propio**.

---

## 9. Tareas propuestas (orden sugerido de PRs)

1. **PR 1**: extraer `extractStatementAtCursor` + tests (refactor puro, sin cambio de UI).
2. **PR 2**: core `lib/editor/core/` (doc, position, state, selection, transaction) + tests.
3. **PR 3**: `CodeEditorView` mínima + `SqlCodeEditor` con flag off-on + `keybindings` prop.
4. **PR 4**: history + keymap completo + persistencia de estado por pestaña.
5. **PR 5**: tokenizadores + temas + bracket matching (golden tests).
6. **PR 6**: autocompletado + popover + folding.
7. **PR 7**: flag a ON por defecto, borrado de dependencias, QA final, revert `style-src` si procede.

Cada PR respeta la regla de **un cambio lógico, con verificación** (`tsc -b`, `lint`, tests).
