# Data Visualizer — Implementation Plan

## Vision

Convertir resultados de consultas SQL en gráficos interactivos con detección automática de tipo de gráfico, selección de columnas y personalización visual.

---

## Alcance

| Funcionalidad | Prioridad |
|---|---|
| Gráficos: Bar, Line, Pie, Area, Scatter, Doughnut | P0 |
| Auto-detección de columnas numéricas vs categóricas | P0 |
| Selector de columnas (X, Y, Agrupar) | P0 |
| Vista previa en tiempo real al cambiar columnas | P0 |
| Integración con tema claro/oscuro del cliente | P1 |
| Exportar gráfico como PNG | P1 |
| Múltiples series Y (varias columnas numéricas) | P1 |
| Heatmap y Tabla pivotante | P2 |
| Stacked Bar / Grouped Bar | P1 |
| Personalización de colores por serie | P2 |
| Zoom, tooltip, leyenda interactiva (ECharts nativo) | P0 |

---

## Stack técnico

| Capa | Decisión | Justificación |
|---|---|---|
| Librería | **Apache ECharts** (`echarts` + `echarts-for-react`) | Madura, performante, tipos TS nativos, tema dinámico, export PNG |
| Store | **Zustand** (`visualizerStore.ts`) | Consistente con el resto del proyecto |
| Chart wrapper | Componente `ChartRenderer` reutilizable | Separación de lógica de renderizado vs UI de controles |
| Feature gate | `FeatureGate` + perk `data_visualizer` (nivel 15) | Ya existe, solo actualizar `requiredLevel` |

---

## Arquitectura

```
components/query/panels/
├── VisualizePanel.tsx              # Orquestador (usa subcomponentes de visualize/)
└── visualize/                      # Sub-módulo autocontenido
    ├── ChartRenderer.tsx           # Renderiza ECharts
    ├── ChartTypeSelector.tsx       # Bar / Line / Pie / Area / Scatter
    ├── ColumnPicker.tsx            # Selectores de eje X, Y, Group
    ├── ChartControls.tsx           # Orientación, stacked, título
    └── ChartEmptyState.tsx         # Sin datos o columnas no graficables

store/
└── visualizerStore.ts              # ChartConfig por tabId (store del módulo)

lib/
├── chart-types.ts                  # Constantes + config de tipos de gráfico
└── column-detection.ts             # Clasificación de columnas
```

### Data flow

```
QueryTab.results (columns + rows)
        │
        ▼
VisualizePanel
        │
        ├── column-detection.ts → clasifica columnas
        │     (numeric / categorical / temporal / id)
        │
        ├── ChartTypeSelector → sugiere tipo según datos
        │
        ├── ColumnPicker → selecciona columnas X, Y, grupo
        │
        └── ChartRenderer
              │
              ├── Construye option de ECharts
              ├── Tema: dark/light según contexto
              └── <ReactECharts option={...} />
```

---

## Fases

### Fase 1: Instalación y Store

**Instalar dependencias:**
- `echarts` (core)
- `echarts-for-react` (wrapper React, o usar ref directa)

**Crear `visualizerStore.ts`:**
```ts
interface ChartConfig {
  chartType: ChartType
  xColumn: string | null
  yColumns: string[]          // múltiples series
  groupColumn: string | null
  orientation: 'vertical' | 'horizontal'
  stacked: boolean
  title: string
}
```

Estado por tab de query:
```ts
interface VisualizerState {
  configs: Record<string, ChartConfig>  // key = tabId
  suggestions: Record<string, ChartType>
  setConfig: (tabId: string, config: Partial<ChartConfig>) => void
  resetConfig: (tabId: string) => void
}
```

**Resultado:** Store funcional y conectada.

---

### Fase 2: Column Detection Engine

**`column-detection.ts`:**
```ts
type ColumnRole = 'numeric' | 'categorical' | 'temporal' | 'id'

interface ColumnProfile {
  name: string
  role: ColumnRole
  uniqueValues: number
  min?: number
  max?: number
}

function detectColumns(columns: string[], rows: DbRow[]): ColumnProfile[]
```

Heurísticas:
- `numeric`: valores son `number`, o strings parseables a número
- `temporal`: nombre contiene `date`, `time`, `year`, `month`, o valores parseables a Date
- `id`: nombre contiene `id`, `code`, `key` (se excluye de ejes por defecto)
- `categorical`: todo lo demás (strings con pocos valores únicos)

**Sugerencia automática de chart type:**
```
1 col numérica + 1 cat → Bar
2+ col numéricas + 1 cat → Bar (agrupado)
1 col numérica + 1 temporal → Line
1 col numérica + 0 cat → Pie (usa índice como label)
```

**Resultado:** El sistema clasifica columnas y sugiere un gráfico inicial.

---

### Fase 3: Chart Renderer

**`ChartRenderer.tsx`:**

```tsx
interface ChartRendererProps {
  rows: DbRow[]
  columns: string[]
  config: ChartConfig
  theme: 'dark' | 'light'
}
```

Construye el objeto `option` de ECharts:
```ts
const option = {
  tooltip: { trigger: 'axis' },
  legend: { /* yColumns como series */ },
  xAxis: { type: 'category', data: categorialValues },
  yAxis: { type: 'value' },
  series: yColumns.map(col => ({
    name: col,
    type: config.chartType, // 'bar' | 'line' | 'pie' | etc
    data: numericValues,
    stack: config.stacked ? 'total' : undefined,
  }))
}
```

Casos especiales:
- **Pie**: usa X como labels y primer Y como valores
- **Scatter**: X numérica, Y numérica
- **Area**: igual que Line con `areaStyle: {}`

**Tema:**
- Usar `echarts.init(dom, 'dark')` o `'light'` según el tema actual
- Colores de la serie desde la paleta de ECharts

**Resultado:** Los gráficos se renderizan correctamente.

---

### Fase 4: UI Controls

**VisualizePanel.tsx** (refactorizar el placeholder actual):

Layout:
```
┌─────────────────────────────────┐
│ [ChartTypeSelector] [Export PNG] │
│ [X: ▼]  [Y: ▼]  [Group: ▼]     │
├─────────────────────────────────┤
│                                 │
│         ECharts Canvas          │
│                                 │
└─────────────────────────────────┘
```

**ChartTypeSelector.tsx:**
- Botones con iconos: Bar, Line, Pie, Area, Scatter, Doughnut
- Highlight del tipo activo
- Sugerencia automática destacada con badge "Suggested"

**ColumnPicker.tsx:**
- Tres dropdowns: X Axis, Y Axis(s), Group by
- X: muestra columnas categóricas + temporales
- Y: muestra columnas numéricas (multi-select con checkboxes)
- Group: muestra columnas categóricas con pocos valores únicos

**ChartControls.tsx:**
- Toggle: Vertical / Horizontal
- Toggle: Stacked (solo para Bar, Area)
- Input: Chart Title

**Resultado:** UI completa e interactiva.

---

### Fase 5: Integración y Export

**Integración con resultados existentes:**
- `VisualizePanel` ya recibe `sortedRows` — funciona
- Extraer `columns` del `activeTab.results.columns`
- Inicializar `ChartConfig` con detección automática al cambiar a modo visualize

**Exportar PNG:**
```ts
const canvas = chartRendererRef.current?.getEchartsInstance().getDom()
const url = canvas?.querySelector('canvas')?.toDataURL('image/png')
// Usar invoke Tauri para guardar archivo
```

**Update perk level:**
- Cambiar `requiredLevel: 1` → `requiredLevel: 15` en `unlocks.ts`

**Resultado:** Visualizador completamente integrado.

---

### Fase 6: Polish

- Integración con tema del sistema (claro/oscuro automático)
- Animación de entrada (ECharts `animationDuration: 800`)
- Empty state mejorado cuando no hay columnas numéricas
- Loading skeleton mientras se procesan los datos
- Responsive resize (ECharts `ResizeObserver` nativo)
- Toolbar minimizable en pantallas pequeñas

---

## Estado actual vs deseado

| Hoy | Meta |
|---|---|
| Placeholder con 3 cards mock | Gráficos funcionales con datos reales |
| Sin librería de gráficos | ECharts integrado |
| Sin detección de columnas | Auto-detección + sugerencia |
| Sin selección de ejes | Column picker completo |
| Sin export | Export PNG via Tauri |
| Perk en nivel 1 | Perk en nivel 15 |

---

## Dependencias

| Paquete | Versión | Tamaño aprox |
|---|---|---|
| `echarts` | ^5.6 | ~800KB (gzip ~250KB) |
| `echarts-for-react` | ^3.0 | ~5KB |

> Nota: ECharts soporta tree-shaking parcial si se importan componentes individuales. Para este proyecto basta con import completo.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Rendimiento con 10k+ filas | ECharts maneja datasets grandes nativamente con `dataset` + `encode`; limitar a 5000 pts por serie |
| Memoria con múltiples tabs | Store guarda solo config, no datos; datos viven en `QueryTab.results` |
| Compatibilidad de tipos | `DbValue = string \| number \| boolean \| null` — castear a número en detección |
