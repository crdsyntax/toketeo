# Plan de Desarrollo — Toketeo Landing Page

## 1. Resumen

Sitio web promocional y de documentación para **Toketeo**, un cliente de base de datos cross-platform con gamificación RPG. El sitio debe reflejar la identidad visual oscura, los colores indigo/violet/cyan y la temática pixel-art del proyecto.

---

## 2. Stack Tecnológico

| Capa       | Tecnología               | Razón                                        |
|------------|--------------------------|----------------------------------------------|
| Framework  | React 19 + TypeScript    | Mismo stack del frontend del proyecto        |
| Bundler    | Vite 8                   | Mismo stack, rápido, soporte nativo TS       |
| CSS        | Tailwind CSS 4           | Mismo stack, utilidades consistentes         |
| Routing    | React Router 7           | Hash-based, SPA, múltiples secciones         |
| Icons      | Lucide React             | Mismo set de iconos del proyecto             |
| HTTP       | Axios                    | Capa de servicios preparada para futuro backend |
| Animación  | CSS keyframes + Framer Motion (opcional) | Consistente con splash screen actual |
| Contenido  | Markdown + JSON          | Docs en MD, features/data en JSON            |
| Despliegue | GitHub Pages / Vercel / Netlify | Static site (SSG) + backend-ready       |

---

## 3. Estructura de Directorios

El sitio vive en un directorio **separado** del proyecto principal:

```
toketeo-website/
├── public/
│   ├── favicon.ico
│   └── images/
│       ├── logo.svg                 # Logo principal (copia de principal.png)
│       ├── logo-original.svg
│       ├── hero-preview.png
│       ├── screenshots/
│       │   ├── query-editor.png
│       │   ├── object-explorer.png
│       │   ├── gamification.png
│       │   ├── scheduler.png
│       │   └── cross-db-sync.png
│       └── og-image.png
├── src/
│   ├── main.tsx                     # Entry point
│   ├── App.tsx                      # Router + Layout wrapper
│   ├── index.css                    # Tailwind + tema global
│   │
│   ├── assets/                      # Assets estáticos (SVGs inline, etc.)
│   │   └── wizard-pixel-art.ts      # Paletas y pixeles de wizards (copia del proyecto)
│   │
│   ├── components/                  # Componentes REUTILIZABLES
│   │   ├── ui/                      # UI atómicos
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── SectionTitle.tsx
│   │   │   ├── Divider.tsx
│   │   │   ├── GradientText.tsx
│   │   │   └── AnimatedRing.tsx     # Anillos decorativos (splash screen)
│   │   │
│   │   ├── layout/                  # Layout components
│   │   │   ├── Header.tsx           # Navbar + logo + mobile menu
│   │   │   ├── Footer.tsx           # Footer con links + copyright
│   │   │   ├── Layout.tsx           # Shell: Header + children + Footer
│   │   │   ├── Sidebar.tsx          # Sidebar para panel de documentación
│   │   │   └── MobileNav.tsx        # Menú hamburguesa mobile
│   │   │
│   │   ├── sections/                # Secciones de la Home (cada una es un componente)
│   │   │   ├── HeroSection.tsx      # Hero con logo + CTA + animated rings
│   │   │   ├── FeaturesSection.tsx   # Grid de features principales
│   │   │   ├── GamificationSection.tsx # RPG system + wizards pixel art
│   │   │   ├── ArchitectureSection.tsx  # Diagrama de arquitectura
│   │   │   ├── ScreenshotsSection.tsx   # Carrusel de capturas
│   │   │   ├── LevelsSection.tsx        # Tabla de rangos/niveles
│   │   │   ├── QuestsSection.tsx        # Sistema de misiones
│   │   │   └── CtaSection.tsx           # Call to action final (descarga)
│   │   │
│   │   ├── docs/                    # Componentes para el panel de documentación
│   │   │   ├── DocPage.tsx          # Página de documento (renderiza MD)
│   │   │   ├── DocSidebar.tsx       # Navegación lateral de docs
│   │   │   ├── DocSearch.tsx        # Búsqueda en documentación
│   │   │   └── DocBreadcrumb.tsx    # Breadcrumb de navegación
│   │   │
│   │   └── download/                # Componentes para descargas
│   │       ├── DownloadCard.tsx     # Tarjeta de descarga (OS, versión)
│   │       ├── VersionList.tsx      # Lista de versiones anteriores
│   │       ├── ReleaseNotes.tsx     # Notas de release
│   │       └── PlatformBadge.tsx    # Badge Linux/Windows
│   │
│   ├── pages/                       # Páginas/rutas
│   │   ├── HomePage.tsx             # Landing principal
│   │   ├── DocsPage.tsx             # Panel de documentación
│   │   ├── DownloadPage.tsx         # Página de descargas
│   │   ├── UpdatesPage.tsx          # Changelog/actualizaciones
│   │   └── NotFoundPage.tsx         # 404
│   │
│   ├── data/                        # Datos estáticos (JSON/TS)
│   │   ├── features.ts              # Lista de features con iconos y descripciones
│   │   ├── levels.ts                # Niveles y rangos del sistema RPG
│   │   ├── quests.ts                # Misiones del sistema RPG
│   │   ├── perks.ts                 # Perks desbloqueables
│   │   ├── releases.ts              # Historial de versiones
│   │   └── navigation.ts            # Estructura de navegación
│   │
│   ├── content/                     # Documentación en Markdown (compilada)
│   │   ├── getting-started.md
│   │   ├── development.md
│   │   ├── backend-modules.md
│   │   ├── frontend-modules.md
│   │   ├── database-drivers.md
│   │   ├── security.md
│   │   └── architecture.md
│   │
│   ├── services/                    # Capa de servicios (Axios)
│   │   ├── api.ts                   # Instancia Axios (baseURL, interceptors, refresh token)
│   │   ├── releases.ts             # Servicio de releases/versiones
│   │   ├── docs.ts                  # Servicio de documentación
│   │   └── types.ts                 # Tipos de respuesta del API
│   │
│   ├── hooks/                       # Custom hooks
│   │   ├── useScrollTo.ts
│   │   ├── useMediaQuery.ts
│   │   └── useApi.ts                # Hook genérico para llamadas Axios con estados
│   │
│   └── lib/                         # Utilidades
│       ├── constants.ts             # Colores, versiones, URLs, endpoints
│       └── utils.ts                 # Funciones helpers (cn, formatDate, etc.)
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
└── tsconfig.node.json
```

---

## 4. Diseño Visual y Tema

### 4.1 Paleta de Colores (modo oscuro default)

| Token        | Hex       | Uso                        |
|-------------|-----------|----------------------------|
| `primary`   | `#6366f1` | Botones, links, acentos    |
| `secondary` | `#8b5cf6` | Hovers, gradientes         |
| `accent`    | `#06b6d4` | Detalles, bordes activos   |
| `bg`        | `#09090b` | Fondo principal            |
| `bg-card`   | `#121212` | Tarjetas, contenedores     |
| `bg-code`   | `#1a1a1a` | Bloques de código          |
| `border`    | `#2d2d2d` | Bordes                     |
| `text`      | `#a0a0a0` | Texto corporal             |
| `text-h`    | `#e0e0e0` | Texto headings             |

### 4.2 Tipografía
- **Body**: `ui-monospace, Consolas, monospace` a 13px (consistente con la app)
- **Headings**: `system-ui, "Segoe UI", Roboto, sans-serif`
- **Código**: `ui-monospace, Consolas, monospace`

### 4.3 Elementos Visuales Clave
- **Logo**: Logo actual (`frontend/public/principal.png`), con filtro invertido en dark mode
- **Anillos decorativos**: Tomados del splash screen (`splash-ring-expand`, `splash-glow-pulse`)
- **Pixel Art Wizards**: Los 6 tiers de wizards renderizados como SVG pixel art (Novice → Deity)
- **Scrollbar estilizada**: Misma que la app (`#1a1a1a` track, `#404040` thumb)

---

## 5. Páginas y Funcionalidades

### 5.1 Home (`/`)
- **Hero**: Logo grande + "Toketeo — Database Administration" + animated rings + CTA "Download"
- **Features**: Grid de features principales con iconos Lucide
- **Gamification**: Sistema RPG explicado con wizards pixel art animados
- **Levels & Ranks**: Tabla visual de los 10 rangos
- **Quests**: Las 5 categorías con progresión
- **Perks**: Los 6 perks desbloqueables con nivel requerido
- **Screenshots**: Carrusel de capturas de la app
- **CTA Final**: Botones de descarga directa

### 5.2 Documentación (`/docs/*`)
- **Sidebar izquierdo**: Navegación jerárquica por temas
- **Contenido**: Renderizado de Markdown con syntax highlighting
- **Búsqueda**: Filtro en tiempo real sobre la documentación
- **Rutas**: `/docs/getting-started`, `/docs/development`, `/docs/backend`, `/docs/frontend`, etc.
- **Breadcrumb**: Navegación de migas de pan

### 5.3 Descargas (`/download`)
- **Tarjetas de descarga**: Windows (.zip portable) y Linux (.deb, .AppImage)
- **Versión actual**: Destacada con badge "Latest v0.2.0"
- **Versiones anteriores**: Lista colapsable con release notes
- **Notas de versión**: Detalles de cada release (features, fixes, known issues)

### 5.4 Actualizaciones / Changelog (`/updates`)
- **Timeline**: Lista cronológica de versiones
- **Categorías**: New Features, Improvements, Bug Fixes, Breaking Changes
- **Badges**: Versión + fecha + etiquetas

### 5.5 404 (`/*`)
- Página con wizard pixel art triste y enlace de retorno al home

---

## 6. Árbol de Componentes

```
App
├── Layout
│   ├── Header
│   │   ├── Logo (SVG inline)
│   │   ├── NavLinks (Home | Docs | Downloads | Updates)
│   │   └── MobileNav (hamburguesa)
│   │
│   ├── [Page Content]
│   │
│   └── Footer
│       ├── Logo pequeño
│       ├── FooterLinks
│       └── Copyright
│
├── HomePage
│   ├── HeroSection
│   │   ├── AnimatedRing (x3)
│   │   ├── Logo
│   │   ├── GradientText ("Toketeo")
│   │   └── Button (Download CTA)
│   ├── FeaturesSection
│   │   └── Card (x8-10)
│   │       ├── Icon (Lucide)
│   │       ├── Title
│   │       └── Description
│   ├── GamificationSection
│   │   ├── WizardPixelArt (tier actual)
│   │   ├── XP bar visual
│   │   └── Level progression
│   ├── ArchitectureSection
│   │   ├── TechBadge (x varios)
│   │   └── ArchDiagram
│   ├── LevelsSection
│   │   └── LevelRow (x10)
│   │       ├── Badge (rango)
│   │       └── LevelRange
│   ├── QuestsSection
│   │   └── QuestCategory (x5)
│   │       ├── Icon
│   │       └── ProgressBar
│   ├── ScreenshotsSection
│   │   └── ScreenshotCarousel
│   └── CtaSection
│       └── Button (Download)
│
├── DocsPage
│   ├── DocSidebar
│   │   ├── DocSearch
│   │   └── DocNavGroup (recursivo)
│   ├── DocBreadcrumb
│   └── DocPage (renderiza MD)
│
├── DownloadPage
│   ├── DownloadCard (Windows)
│   ├── DownloadCard (Linux)
│   ├── VersionList
│   │   └── ReleaseNotes
│   └── PlatformBadge
│
└── UpdatesPage
    └── ReleaseTimeline
        └── ReleaseEntry
            ├── Badge (versión)
            └── ChangeCategory (x4)
```

---

## 7. Flujo de Datos

### 7.1 Datos Estáticos
Toda la información del sitio (features, niveles, quests, releases) vive en archivos **`/src/data/*.ts`**. Estos archivos exportan arrays/objetos tipados que los componentes consumen directamente. No hay llamadas API ni backend.

### 7.2 Documentación
Los archivos Markdown en `/src/content/` se importan como strings raw en Vite (usando `?raw` suffix) y se renderizan con una librería ligera tipo `marked` + `highlight.js`.

### 7.3 Routing
React Router con las siguientes rutas:

| Ruta                  | Página          |
|-----------------------|-----------------|
| `/`                   | HomePage        |
| `/docs/:slug`         | DocsPage        |
| `/download`           | DownloadPage    |
| `/updates`            | UpdatesPage     |
| `*`                   | NotFoundPage    |

---

---

## 8. Capa de Servicios (Axios)

### 8.1 Arquitectura

La capa de servicios abstrae toda comunicación HTTP. Inicialmente los servicios consumen datos estáticos locales (mock), pero la interfaz está preparada para conectar con un backend REST sin modificar componentes.

```
src/services/
├── api.ts           # Instancia Axios singleton + interceptors
├── types.ts         # Interfaces de request/response
├── releases.ts      # ReleasesService
└── docs.ts          # DocsService
```

### 8.2 Instancia Axios (`api.ts`)

Configuración centralizada con:
- `baseURL` desde variable de entorno (`VITE_API_BASE_URL`)
- `timeout` configurable
- Interceptor de request (adjuntar token JWT si existe)
- Interceptor de response (manejo global de errores 401, 500)
- Refresh token automático en 401

### 8.3 Servicios

Cada servicio exporta un objeto con métodos tipados:

| Servicio       | Métodos                              | Endpoint (futuro)         |
|---------------|--------------------------------------|---------------------------|
| `ReleasesService` | `getAll()`, `getLatest()`, `getByVersion(ver)` | `/api/releases`     |
| `DocsService`     | `getIndex()`, `getPage(slug)`       | `/api/docs`              |

### 8.4 Modo Local vs Remoto

- **Local (ahora)**: Los services importan datos de `/src/data/` directamente.
- **Remoto (futuro)**: Se cambia la implementación interna del service para usar Axios. Los componentes consumen el mismo contrato de tipos sin cambios.

### 8.5 Hook `useApi<T>`

Hook genérico que maneja estados `loading`, `data`, `error` para cualquier llamada:

```typescript
function useApi<T>(fetcher: () => Promise<T>): {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}
```

---

## 9. Dependencias (package.json)

```json
{
  "name": "toketeo-website",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router": "^7.5.0",
    "react-router-dom": "^7.5.0",
    "lucide-react": "^0.510.0",
    "marked": "^15.0.0",
    "highlight.js": "^11.11.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.3.0",
    "@tailwindcss/vite": "^4.3.0",
    "typescript": "~6.0.0",
    "vite": "^8.0.12",
    "globals": "^15.0.0"
  }
}
```

**Nota**: Solo 7 dependencias de producción (incluyendo Axios). Sin estado global (Zustand), sin monaco, sin echarts — el sitio sigue siendo mayormente estático pero con la capa HTTP lista.

---

## 10. Plan de Implementación por Fases

### Fase 1 — Scaffold y Configuración Inicial
- [ ] Crear directorio `toketeo-website/` fuera del proyecto
- [ ] Inicializar proyecto con `npm create vite@latest` (React + TS)
- [ ] Configurar Tailwind CSS 4 con `@tailwindcss/vite`
- [ ] Copiar e integrar logo SVG desde el proyecto original
- [ ] Configurar tema oscuro base con colores del proyecto
- [ ] Configurar React Router con todas las rutas
- [ ] Crear Layout shell (Header + Footer)

### Fase 2 — Componentes UI Atómicos
- [ ] Implementar `Button` (variants: primary, secondary, ghost, outline)
- [ ] Implementar `Card` (variants: default, hover, interactive)
- [ ] Implementar `Badge` (variants: default, success, warning, info)
- [ ] Implementar `SectionTitle` con decoración (gradiente + borde)
- [ ] Implementar `GradientText` (texto con gradiente indigo → violeta)
- [ ] Implementar `AnimatedRing` (anillos decorativos del splash screen)
- [ ] Implementar `WizardPixelArt` (componente SVG pixel art reutilizable)
- [ ] Implementar `PlatformBadge` (Windows/Linux con iconos)

### Fase 3 — Layout Components
- [ ] Implementar `Header` con logo + navegación + mobile menu
- [ ] Implementar `Footer` con links a GitHub, docs, descargas
- [ ] Implementar `MobileNav` (menú hamburguesa con overlay)
- [ ] Implementar `Sidebar` para docs (colapsable en mobile)
- [ ] Implementar `Layout` wrapper

### Fase 4 — Secciones de Home
- [ ] `HeroSection` con logo, tagline, animated rings, CTA
- [ ] `FeaturesSection` con grid responsivo de 8-10 features
- [ ] `GamificationSection` con wizards pixel art + XP bar
- [ ] `ArchitectureSection` con badges de tecnologías
- [ ] `LevelsSection` con tabla visual de 10 rangos
- [ ] `QuestsSection` con categorías y progresión
- [ ] `ScreenshotsSection` con carrusel simple
- [ ] `CtaSection` con botones de descarga

### Fase 5 — Página de Documentación
- [ ] Implementar `DocSidebar` con estructura jerárquica de navegación
- [ ] Implementar `DocSearch` (filtro en tiempo real)
- [ ] Implementar `DocBreadcrumb`
- [ ] Implementar renderizado de Markdown con `marked` + `highlight.js`
- [ ] Copiar y adaptar contenido de `docs/` del proyecto original
- [ ] Mapear slugs a archivos markdown

### Fase 6 — Página de Descargas
- [ ] Implementar `DownloadCard` para cada plataforma
- [ ] Implementar `VersionList` con versiones anteriores
- [ ] Implementar `ReleaseNotes` expandible
- [ ] Definir datos de releases en `data/releases.ts`

### Fase 7 — Página de Actualizaciones
- [ ] Implementar timeline de versiones con `ReleaseEntry`
- [ ] Categorizar cambios (Features, Fixes, Improvements, Breaking)
- [ ] Integrar con `data/releases.ts`

### Fase 8 — Responsive, Animaciones y Pulido
- [ ] Diseño responsive (mobile-first, 3 breakpoints)
- [ ] Animaciones de entrada (fade-in, slide-up) en scroll
- [ ] Transiciones de página suaves
- [ ] 404 page con wizard pixel art
- [ ] Meta tags OG para compartir

### Fase 9 — Build y Despliegue
- [ ] Configurar build de producción
- [ ] Desplegar a GitHub Pages, Vercel o Netlify
- [ ] DNS custom (opcional)
- [ ] CI/CD con GitHub Actions (deploy automático al hacer push a `main`)

---

## 11. Principios de Arquitectura

### Separación de Responsabilidades
- **`/data/`** → Datos estáticos tipados (no mezclar con componentes)
- **`/components/`** → Solo lógica de presentación
- **`/content/`** → Documentación en Markdown sin procesar
- **`/pages/`** → Orquestación: junta datos + componentes
- **`/lib/`** → Utilidades puras sin JSX
- **`/services/`** → Lógica de datos (mock local o Axios remoto)

### Componentes Reutilizables
- `Button`, `Card`, `Badge`, `Tag` aceptan `variant`, `size`, `className`
- `SectionTitle` acepta `title`, `subtitle`, `align`
- `GradientText` acepta `from`, `to`, `as` (tag HTML)
- `DownloadCard` acepta `platform`, `version`, `url`, `size`

### Sin Acoplamiento
- El sitio NO depende del proyecto principal (copia de assets)
- Sin Tauri, sin IPC, sin SQL — puro contenido estático
- Datos versionados: si el proyecto cambia, se actualiza `data/`

---

## 12. Assets a Copiar del Proyecto Principal

| Archivo                  | Origen                                        | Destino                        |
|--------------------------|-----------------------------------------------|--------------------------------|
| `logo.svg`               | `frontend/public/principal.png`               | `public/images/logo.svg`       |
| `logo-original.svg`      | `frontend/public/logoOriginal.svg`            | `public/images/logo-original.svg` |
| `favicon`                | `frontend/public/fav-ico.ico`                | `public/favicon.ico`           |
| `wizards.ts`             | `frontend/src/lib/gamification/wizards.ts`   | `src/assets/wizard-pixel-art.ts` |

---

## 13. Consideraciones de SEO y Rendimiento

- **SSG**: El sitio es 100% estático, ideal para CDN
- **Lighthouse**: Apuntar a 95+ en todas las métricas
- **Imágenes**: WebP + lazy loading para screenshots
- **Fonts**: System fonts (sin descargas externas)
- **JS bundle**: Sin librerías pesadas (<100KB gzip esperado)
- **SEO**: Meta tags OG, sitemap.xml, robots.txt

---

## 14. Próximos Pasos

1. Aprobar este plan
2. Ejecutar Fase 1 (scaffold)
3. Iterar por fases secuencialmente
4. Desplegar primera versión
5. Mantener sincronizado con nuevas versiones de Toketeo
