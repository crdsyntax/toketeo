# Plan: Export de Diagramas a Mermaid (`erDiagram`)

> Estado: propuesta pendiente de aprobación
> Alcance: frontend (React/TypeScript) — sin cambios de backend ni de la BD

## 1. Objetivo

Exportar el diagrama actual (React Flow) como sintaxis **Mermaid `erDiagram`**: copiar el código al portapapeles o descargar un archivo `.mmd`, para compartir/incrustar en docs. **No se migra el editor** — React Flow se mantiene intacto.

## 2. Decisiones

- **Sin dependencia nueva** (Fase A): solo generación de texto + copiar + descargar. La vista previa renderizada (Fase B, opcional) requeriría agregar el paquete `mermaid`.
- **Views**: se representan como entidades vacías `VIEW_NAME {}` (mermaid lo soporta); sus relaciones se exportan normal.
- **Cardinalidad** mapeada a símbolos ER de mermaid.
- La función generadora es **pura y testeable** (vitest ya existe en el repo).

## 3. Generación (`src/diagram/lib/toMermaid.ts` — nuevo)

```
erDiagram
    USERS {
        INT id PK
        VARCHAR(255) name
    }
    ORDERS {
        INT id PK
    }
    USERS ||--o{ ORDERS : "user_id → id"
```

Reglas:
1. **Entidades** desde nodos `type === 'table'`: nombre normalizado (UPPERCASE, no-alfanuméricos → `_`); si hay colisión o caracteres raros, se usa `["nombre original"]` (sintaxis v10+).
2. **Atributos** desde `data.columns`: `TYPE name [PK]` — `PK` si `isPrimaryKey`; `FK` si la columna aparece en `data.foreignKeys`.
3. **Views** (`type === 'view'`): entidad vacía `NAME {}` + comentario `%% VIEW`.
4. **Relaciones** desde edges `type === 'cardinality'`:
   | cardinality | símbolo |
   |---|---|
   | `1:1` | `||--\|\|` |
   | `1:N` | `\|\|--o{` |
   | `N:M` | `}o--o{` |
   - Dirección: `source` = lado "uno", `target` = lado "muchos".
   - Si `edge.label` existe → `: "label"`; si no → sin label.
5. **Nombres de entidad/atributos** escapados: comillas dobles cuando contengan espacios/guiones/etc.

## 4. UI (`DiagramToolbar.tsx` — modificar)

Botón **Mermaid** con dropdown:
- **Copy code** → `navigator.clipboard.writeText(code)` + toast
- **Download .mmd** → blob + `<a download="<diagram>.mmd">` (mismo patrón que el export `.tokdiagram` existente)

`DiagramPage` pasa al toolbar: `nodes`, `edges` (ya disponibles) + nombre del diagrama.

## 5. Tests (`src/diagram/lib/toMermaid.test.ts` — nuevo)

- Tabla con PK y FK → atributos correctos
- Views → entidad vacía + comentario
- Cardinalidades 1:1 / 1:N / N:M → símbolos correctos
- Labels de relación
- Escaping de nombres con espacios/guiones

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/diagram/lib/toMermaid.ts` | **NUEVO** — generador puro |
| `src/diagram/lib/toMermaid.test.ts` | **NUEVO** — tests vitest |
| `src/diagram/components/DiagramToolbar.tsx` | botón/dropdown Mermaid (copy/download) |
| `src/diagram/DiagramPage.tsx` | pasar nodes/edges/nombre al toolbar |

## 7. Criterios de salida

- [x] `npm test` verde (tests del generador) — 7 tests
- [x] Copiar al portapapeles y descargar `.mmd` funcionan
- [x] El código generado es válido en mermaid.live (verificación manual)
- [x] `npm run build` + ESLint sin errores
- [x] Sin cambios en backend ni en el esquema de datos existente

## 8. Estado (implementado)

- `src/diagram/lib/toMermaid.ts` — generador puro (entidades con atributos tipados y PK/FK, views como entidades vacías con `%% VIEW`, cardinalidades `1:1→||--||`, `1:N→||--o{`, `N:M→}o--o{`, labels, escaping y unicidad de nombres)
- `src/diagram/lib/toMermaid.test.ts` — 7 tests vitest verdes
- `DiagramToolbar` — botón **Mermaid** con dropdown: *Copy code* (portapapeles con fallback) y *Download .mmd*
- `DiagramPage` — `mermaidCode` calculado en vivo con `useMemo` sobre nodes/edges
