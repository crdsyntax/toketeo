# Frontend Component Architecture

## Core Principle

Cada feature del frontend debe organizarse como un **módulo autocontenido** con su propia jerarquía de carpetas, separación de responsabilidades y componentes reutilizables.

---

## Module Folder Structure

Todo módulo de UI sigue esta estructura:

```
components/<modulo>/
├── <Modulo>Main.tsx           # Componente principal (orquestador)
├── <Modulo>Panel.tsx          # Layout / contenedor
├── panels/                    # Sub-paneles del módulo
│   ├── <SubPanel1>.tsx
│   └── <SubPanel2>.tsx
├── charts/                    # Sub-módulo específico (ej: gráficos)
│   ├── ChartRenderer.tsx
│   ├── ChartTypeSelector.tsx
│   └── ChartEmptyState.tsx
├── shared/                    # Componentes compartidos DENTRO del módulo
│   ├── ColumnPicker.tsx
│   └── ChartControls.tsx
├── modals/                    # Modales del módulo
│   └── <Modal>.tsx
└── index.ts                   # Barrel export (opcional)
```

Reglas:
- **Un nivel de subcarpeta por responsabilidad**
- `shared/` = componentes reutilizables **dentro del módulo**, no globales
- Si un componente se necesita **fuera** del módulo → mover a `components/ui/`
- `index.ts` exporta solo lo que el exterior necesita

---

## Separation of Dependencies

### Reglas

1. **Un módulo no importa de otro módulo de feature** directamente.
   - ✅ Correcto: `import { Button } from '@/components/ui'`
   - ❌ Incorrecto: `import { QueryPanel } from '@/components/query/QueryPanel'`

2. **Store por módulo**: Cada feature con estado complejo tiene su propio archivo en `store/`.
   - `store/queryStore.ts` → para el módulo query
   - `store/visualizerStore.ts` → para data visualizer
   - `store/explorerStore.ts` → para explorer

3. **Lib por módulo**: Lógica de negocio/detección va en `lib/` con prefijo del módulo.
   - `lib/chart-types.ts`
   - `lib/column-detection.ts`
   - No mezclar lógica de distintos módulos en un mismo archivo.

4. **Tipos por módulo**: Tipos específicos van junto al módulo o en `types/` si son compartidos.
   - Preferir tipos locales cerca del componente que los usa
   - Mover a `types/` solo cuando 3+ módulos los consumen

---

## Reusable Components

### Jerarquía

```
components/
├── ui/              # Primitivas reutilizables (Button, Input, Dropdown, Modal, Tooltip)
│   └── index.ts     # Barrel export de todas las UI primitives
├── layout/          # Componentes de layout global (AppBootstrap, MainLayout, OnboardingTour)
│   └── index.ts
├── query/           # Módulo Query Editor
│   ├── panels/
│   │   ├── visualize/    # Sub-módulo Data Visualizer
│   │   │   └── ...
│   │   └── results/
│   └── shared/
├── assistant/       # Módulo Smart Assistant
│   └── panels/
├── gamification/    # Módulo Gamificación
├── explorer/        # Módulo Explorer
├── connections/     # Módulo Conexiones
├── scheduler/       # Módulo Scheduler
└── sync/            # Módulo Cross-DB Sync
```

### Criterios para `components/ui/`

Un componente va en `ui/` si cumple **al menos uno** de:
- Lo usan 2+ módulos distintos
- Es un control genérico (botón, input, dropdown, modal, tooltip, badge)
- Es un patrón de layout reutilizable (split panel, resize handle, tab bar)

### Criterios para `components/<modulo>/shared/`

Un componente va en `shared/` del módulo si:
- Lo usan 2+ sub-componentes dentro del mismo módulo
- NO lo usa ningún componente fuera del módulo

---

## Naming Conventions

| Tipo | Convención | Ejemplo |
|---|---|---|
| Componente principal | `ModuleName.tsx` | `VisualizePanel.tsx` |
| Sub-componente | `NombreSignificativo.tsx` | `ChartTypeSelector.tsx` |
| Store | `camelCaseStore.ts` | `visualizerStore.ts` |
| Lib | `kebab-case.ts` | `column-detection.ts` |
| Tipos | `kebab-case.ts` | `chart-types.ts` |
| Índice | `index.ts` | barrel export |

---

## Ejemplo: Data Visualizer

```
components/query/panels/
├── VisualizePanel.tsx              # Orquestador: monta controles + chart
├── visualize/                       # Sub-carpeta del visualizador
│   ├── ChartRenderer.tsx            # Renderiza ECharts
│   ├── ChartTypeSelector.tsx        # Botones: Bar, Line, Pie...
│   ├── ColumnPicker.tsx             # Selectores X, Y, Group
│   ├── ChartControls.tsx            # Orientación, stacked, título
│   └── ChartEmptyState.tsx          # Sin datos / no graficable
```

```
store/
└── visualizerStore.ts               # Estado del visualizador
```

```
lib/
├── chart-types.ts                    # Constantes + config de tipos
└── column-detection.ts               # Clasificación de columnas
```

---

## Anti-Patterns

| Anti-pattern | Problema | Solución |
|---|---|---|
| `components/VisualizePanel.tsx` + `components/ChartRenderer.tsx` sueltos | Contaminación del directorio raíz | Agrupar en `query/panels/visualize/` |
| Un store gigante para toda la app | Acoplamiento, re-renders | Store por módulo |
| Importar stores de otro módulo | Dependencia oculta | Comunicar por props o eventos |
| Lógica de detección inline en el componente | No testeable, no reutilizable | Extraer a `lib/` |
| Tipos compartidos en `types/` que solo usa 1 módulo | Ruido | Tipos locales primero |
