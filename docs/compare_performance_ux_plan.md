# Plan de Optimización: DB Compare — Rendimiento y UX

## 1. Estado Actual (Análisis)

### 1.1 Flujo de datos

```
SchemaDiffWizard (frontend)
  → compareService.compareSchemas()                // 1 viaje IPC
    → compare_schemas command                      // src-tauri/src/presentation/tauri/commands.rs
      → CompareService::compare_schemas            // src-tauri/src/application/compare/compare_service.rs:26
        → compare_all_tables (fetch_tables + fetch_columns por tabla)
        → compare_all_indexes  (fetch_indexes por tabla, secuencial)
        → compare_all_foreign_keys (fetch_foreign_keys + queries on-delete/update por tabla, secuencial)
        → compare_all_constraints (fetch_constraints por tabla, secuencial)
        → compare_views / procedures / functions / triggers (fetch_ddl + hash por objeto)
      → SchemaReport (JSON completo)
  → Resultados filtrados en frontend (solo "missing")
  → generate_script (el reporte cruza la frontera IPC 2-3 veces)
```

**Data compare** (`compare_table_data`, compare_service.rs:290):
- `resolve_pk` → `fetch_columns` (1 query)
- `fetch_columns` source de nuevo (duplicado, 1 query)
- `fetch_columns` target (1 query)
- Escaneo completo de source con `LIMIT ? OFFSET ?` en chunks (N/queries O(n²) por OFFSET)
- Escaneo completo de target con `LIMIT ? OFFSET ?` (mismo problema)
- Por cada fila divergente: `compare_row_columns` = **2 SELECT por fila** (N+1)

### 1.2 Problemas de rendimiento confirmados

| # | Problema | Ubicación | Impacto |
|---|----------|-----------|---------|
| P1 | Paginación `LIMIT/OFFSET` en data compare | compare_service.rs:419-462, hash_generator.rs:23-53 | O(n²): el OFFSET fuerza a la BD a descartar filas ya leídas. Tablas de 1M filas → decenas de miles de scans costosos |
| P2 | N+1 en data compare: 2 SELECT por fila divergente | compare_service.rs:471-528, row_comparator.rs:51-52 | 10k filas modificadas → 20k queries |
| P3 | Sin caché de metadatos: `fetch_columns` se llama 2+ veces por tabla | compare_service.rs:300/323, resolve_pk | Duplica latencia de metadata en cada tabla |
| P4 | Introspectión de schema secuencial tabla por tabla | compare_service.rs:662-738 (3 bucles `for table`) | 100 tablas × 3 fases × 2 conexiones = 600 round-trips en serie |
| P5 | No se pasa `compareId` desde el wizard | SchemaDiffWizard.tsx:115-125, emit_progress solo emite si `compare_id` existe (compare_service.rs:614) | El usuario no ve progreso; pantalla congelada de "Comparing..." sin feedback |
| P6 | Reporte completo viaja 2-3 veces por IPC | SchemaDiffWizard.tsx:115→158 | JSON pesado serializado/deserializado múltiples veces |
| P7 | El reporte se construye entero en memoria y se renderiza completo | MissingObjectsList filtra todo el reporte en cada render | Lento con cientos de objetos |

### 1.3 Bugs confirmados que degradan el resultado

| # | Bug | Ubicación | Efecto |
|---|-----|-----------|--------|
| B1 | FK on-delete/on-update: query MySQL con `?` sin binds; Postgres pasa el nombre de tabla como schema | fk_comparator.rs:86-100,125,142; mysql.rs:135-145; postgres.rs:147-215 | Error en runtime por cada tabla → el diff de FK se omite silenciosamente (warn + continue en compare_service.rs:696-698). MySQL y Postgres: FKs nunca se comparan |
| B2 | `execute_with_schema` no restaura search_path/USE de la conexión antes de devolverla al pool | postgres.rs:154-158, mysql.rs:208+ | Contaminación de estado: consultas posteriores heredan schema basura |
| B3 | Tablas missing en data compare retornan contadores a 0 sin contar filas | compare_service.rs:353-368 | Información incorrecta al usuario |

### 1.4 Problemas de UX/visual actuales

| # | Problema | Ubicación |
|---|----------|-----------|
| U1 | El wizard solo muestra objetos **missing** (ámbar). No hay vista de "modificado", "nuevo", ni resumen de iguales | MissingObjectsList, SchemaDiffWizard.tsx:502-543 |
| U2 | No hay barra de progreso ni % ni fase actual durante la comparación; solo un spinner genérico | SchemaDiffWizard.tsx:317-321 |
| U3 | El botón de accion principal es "Compare Schemas" con lenguaje técnico; sin explicación en lenguaje natural de qué pasó | SchemaDiffWizard.tsx:396-402 |
| U4 | Resultados sin agrupar por tipo de cambio ni con conteos por estado; el header solo dice "Missing Objects Found" | SchemaDiffWizard.tsx:324-333 |
| U5 | El paso "Script" es un `<pre>` plano con SQL crudo sin agrupar por operación (create/alter/drop), sin resaltado ni selección por tipo | SchemaDiffWizard.tsx:364 |
| U6 | No hay comparación lado a lado (A vs B): los detalles de columnas/índices no son visibles para objetos modificados | MissingObjectsList solo muestra nombre+status |
| U7 | No hay modo "no técnico": no hay resumen en lenguaje natural, ni niveles de detalle (resumen → detalle → SQL) | Todo el wizard |
| U8 | Ventana 700px fija sin responsive a contenido denso; sin búsqueda/filtro en resultados | SchemaDiffWizard.tsx:206 |

---

## 2. Objetivos

1. **Rendimiento**: reducir el tiempo de comparación de esquema en ≥5x en bases ≥100 tablas, y data compare de O(n²) a O(n).
2. **Correctitud**: arreglar B1 (FK on-delete/on-update), B2 (pool contaminado), B3 (conteos).
3. **UX técnico**: vista detallada lado a lado (A vs B), progreso real, script agrupado y editable.
4. **UX no técnico**: resumen en lenguaje natural con semáforo de estado y nivel de detalle progresivo.

---

## 3. Fase A — Rendimiento Backend

### A1. Caché de metadatos por comparación (P3)

**Archivos**: `compare_service.rs`, `pk_resolver.rs`, `table_comparator.rs`

- Crear `SchemaMetadataCache` que cachee `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_foreign_keys`, `fetch_constraints` por `(conn, schema)` durante una ejecución.
- `resolve_pk` recibe el cache en vez de re-consultar; eliminar la doble llamada a `fetch_columns` (compare_service.rs:300 y :323).
- Invalidez: por ejecución (no persistente), para que datos modificados entre runs no den falsos positivos.

```rust
pub struct SchemaMetadataCache {
    columns: HashMap<(String, String), Vec<serde_json::Value>>, // (schema, table)
    indexes: HashMap<(String, String), Vec<serde_json::Value>>,
    foreign_keys: HashMap<(String, String), Vec<serde_json::Value>>,
    constraints: HashMap<(String, String), Vec<serde_json::Value>>,
    tables: HashMap<String, Vec<String>>,
}
```

### A2. Keyset pagination en data compare (P1)

**Archivos**: `hash_generator.rs`, `compare_service.rs`, `chunk_reader.rs`

- Reemplazar `ORDER BY pk LIMIT ? OFFSET ?` por keyset:
  `WHERE pk > ?last ORDER BY pk LIMIT ?` (MySQL/PG/SQLite) y `WHERE pk > ?last ORDER BY pk OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY` (SQL Server).
- PKs numéricas y string soportadas; para PKs compuestas usar tupla `(pk1, pk2) > (?, ?)`.
- Mantener `chunk_size + 1` como detección de fin (chunk_reader.rs ya tiene el patrón; extenderlo).
- Primera iteración sin `WHERE` (o `pk > -inf`).

### A3. Batch de row comparison (P2)

**Archivos**: `row_comparator.rs`, `compare_service.rs`, `data/mod.rs`

- Reemplazar el N+1 de `compare_row_columns` por **comparación por lotes**:
  - Opción 1 (preferida): 2 queries por lote de ~500 PKs divergentes:
    `SELECT ... FROM t WHERE pk IN (...)` (source) y mismo para target; comparar en Rust.
  - Opción 2: para filas "solo en source/target", eliminar la query innecesaria: si la fila no existe en target por hash, no hace falta SELECT de target.
- Para filas "solo en source": 1 query al lado source basta (el código actual hace 2; row_comparator.rs:51-52).
- Parámetro `batch_size` configurable (default 500).

### A4. Fix FK on-delete/on-update (B1)

**Archivos**: `fk_comparator.rs`, `mysql.rs`, `postgres.rs`

- MySQL: bindear los 2 `?` (TABLE_NAME, CONSTRAINT_SCHEMA) en `mysql_on_delete_update_query` — usar `execute_with_params` o interpolación sanitizada (identificador, no dato).
- Postgres: `postgres_on_delete_update_query` debe recibir el **schema** como segundo argumento; usar `execute_with_params(query, &[table_name])` en vez de `execute_with_schema` (que interpreta el arg como schema).
- Añadir test de integración con MySQL y Postgres reales (opcional: mock driver en `db/mock.rs` con asserts de queries).
- Dejar de tragar errores en `compare_all_foreign_keys`: recolectar en `report.warnings`/`errors` (compare_service.rs:696-698) y emitir a la UI.

### A5. Fix restore de conexión al pool (B2)

**Archivos**: `postgres.rs`, `mysql.rs`

- En `execute_with_schema`: tras ejecutar, restaurar el estado anterior (`SET search_path TO DEFAULT` / `USE <db original>`) antes de devolver la conexión, o usar `pool.begin()` + rollback para aislar.
- Patrón recomendado: envolver en transacción `BEGIN; SET search_path ...; ...; ROLLBACK` — garantiza restauración incluso con errores.

### A6. Paralelismo de introspectión (P4)

**Archivos**: `compare_service.rs`

- Comparar **tablas en paralelo** con `futures::stream::iter(tables).map(...).buffered(4-8)` o `tokio::join!` por grupos.
- Cautela: los drivers usan pool de conexiones; respetar el límite de `max_connections`. Un batch de 4-8 es seguro en la mayoría de pools.
- Mantener el orden del reporte con índice original (recolectar `(idx, result)` y reordenar).
- Aplicar a: `compare_all_indexes`, `compare_all_foreign_keys`, `compare_all_constraints`, y comparación de columnas en `compare_tables` (paralelizar `fetch_columns` source/target por tabla).

### A7. Progreso y cancelación reales (P5)

**Archivos**: `commands.rs`, `SchemaDiffWizard.tsx`, `compare.service.ts`

- Generar `compare_id` en el frontend (crypto.randomUUID()) y pasarlo en `compare_schemas`/`compare_data`.
- Suscribirse a `compare:progress` en el wizard (ya existe el canal, compare_service.rs:615).
- El backend ya calcula `current/total` por fase; añadir sub-progreso por tabla: `message = "Comparing indexes (12/45): orders"`.
- Botón "Cancel" en la UI → emitir `compare:cancel` con `compare_id` (ya existe `SyncController`, wiring en commands.rs).

### A8. Reducción de viajes IPC (P6)

**Archivos**: `commands.rs`, `compare.service.ts`, `SchemaDiffWizard.tsx`

- Devolver en una sola respuesta el `SchemaReport` **y** el `SyncScript` generado si el usuario lo pide (flag `generate_script: bool`), eliminando el 2º viaje.
- Para reportes grandes (>N objetos): streaming por secciones (tables → indexes → fks...) vía eventos `compare:section` en vez de un único JSON.
- El frontend ya filtra; mover el filtrado de "missing/equal/modified" a un `useMemo`.

---

## 4. Fase B — UX y Diseño Visual

### B1. Modelo de niveles de detalle (U7)

La ventana tendrá **3 niveles progresivos**, accesibles para técnicos y no técnicos:

1. **Resumen (no técnico)**: semáforo + números + lenguaje natural.
2. **Detalle técnico**: listas por objeto con estado e iconos, agrupadas.
3. **SQL (técnico)**: script generado con agrupación por operación.

### B2. Vista Resumen (nueva cabecera de resultados)

**Archivo**: `SchemaDiffWizard.tsx` (nuevo componente `CompareSummary`)

- Tarjetas de estado con semáforo:
  - ✅ **Coinciden**: N objetos idénticos (verde)
  - 🔁 **Modificados**: N objetos (ámbar)
  - ➕ **Solo en B (nuevos)**: N (azul)
  - ❌ **Faltan en B**: N (rojo)
- Frase en lenguaje natural generada en backend (campo `summary` en SchemaReport):
  - "Tu base A y tu base B coinciden en 120 de 145 objetos. Hay 12 que existen en A pero faltan en B, y 3 que fueron modificados."
  - Reglas de generación: conteos por estado + nombres de los 3 primeros objetos de cada categoría.
- CTA principal: "Ver script de sincronización" (no técnico) / "Revisar diferencias" (técnico).

### B3. Vista Detalle (lista completa, no solo missing) (U1, U4, U6)

**Archivo**: `MissingObjectsList` → renombrar/expandir a `CompareResultsList`

- Lista completa de objetos con badge de estado (Equal/Modified/Missing/New) con colores semánticos del tema actual (verde/ámbar/rojo/azul).
- **Agrupación por tipo de cambio** con conteos (secciones: Solo en A · Modificados · Solo en B · Coinciden).
- **Expansión por objeto** (acordeón):
  - Modificado → tabla lado a lado **A vs B** de columnas (name, type, nullable, default) con diffs resaltados (patrón de diff: rojo-verde).
  - Índices/FKs/constraints → columnas cambiadas y opciones (on-delete/on-update) lado a lado.
- **Búsqueda/filtro** por nombre (input con debounce) y filtro por estado.
- **Selección múltiple** de objetos para generar script solo de esos.
- Contenido virtualizado (`react-window` o scroll con `max-h` + `overflow-auto`; ya hay patrón en el wizard) para reportes grandes.

### B4. Progreso visual (U2)

**Archivo**: `SchemaDiffWizard.tsx`

- Barra de progreso determinada (fase + % actual/total) en lugar del spinner genérico.
- Checklist de fases animado: `Tablas ✓ · Índices → · FKs · Constraints · Vistas · Routines`.
- Mostrar tabla actual que se está comparando + contador `12/45`.
- Botón Cancelar siempre visible durante la comparación.

### B5. Vista Script mejorada (U5)

**Archivo**: `SchemaDiffWizard.tsx` (nuevo componente `ScriptReview`)

- Agrupar statements por operación: **CREATE** (azul) · **ALTER** (ámbar) · **DROP** (rojo) · **DATA SYNC** (verde), con checkbox "seleccionar todo" por grupo.
- Checkbox por statement (ya existe `selected`) + **diff preview** al hover (para ALTER: mostrar `antes → después`).
- Syntax highlighting del SQL (reusar CodeMirror con tema existente `vsDarkTheme`/`oneDark`, ya disponible en `lib/editor/themes.ts`).
- Contador de statements seleccionados + botones: Copiar · Ejecutar (si existe comando) · Descargar `.sql`.
- Advertencia de riesgos: marcar con icono ⚠ los DROP y los cambios destructivos (drop column, drop table, recreate table en SQLite).

### B6. Tokens de color y accesibilidad

- Usar tokens existentes (`--accent`, `--destructive`, `--text`, `--border`) en lugar de hex hardcodeados (queda `bg-[#0d1117]` en el `<pre>`, SchemaDiffWizard.tsx:364 → reemplazar por `bg-muted border-border text-foreground`).
- Estados semánticos con las paletas actuales:
  - Equal → `text-emerald-500` (ya usado en wizard)
  - Modified → `text-amber-500`
  - Missing → `text-red-500` / `text-destructive`
  - New → `text-sky-500`
- Contraste ≥ 4.5:1 en texto sobre superficies (verificar con los tokens dark actuales: `--surface #16161f`, `--text #a0a0b0`).
- Iconos + color + texto (no depender solo del color) para usuarios con daltonismo.

### B7. Layout de la ventana (U8)

- Anchura adaptable: `min-w-[720px] w-[min(1100px,92vw)]` con 2 columnas en la vista detalle (A | B).
- Cabecera compacta con breadcrumb de paso + botón "Nueva comparación".
- Estado vacío y estado de error con acciones (retry, cambiar conexiones).

---

## 5. Orden de Implementación

| # | Tarea | Archivos | Depende | Estimación | Prioridad |
|---|-------|----------|---------|-----------|-----------|
| 1 | ✅ Fix B4 (FK binds MySQL/PG) + test | `fk_comparator.rs`, `mysql.rs`, `postgres.rs` | — | 1 día | 🔴 Alta (correctitud) |
| 2 | ✅ Fix B2 (restore pool en execute_with_schema) | `postgres.rs`, `mysql.rs` | — | 0.5 días | 🔴 Alta |
| 3 | ✅ Caché de metadatos (A1) | `compare_service.rs`, `pk_resolver.rs`, nuevo `metadata_cache.rs` | — | 1 día | 🔴 Alta |
| 4 | ✅ Keyset pagination (A2) | `hash_generator.rs`, `compare_service.rs`, `chunk_reader.rs` | — | 1 día | 🔴 Alta (impacto O(n²)) |
| 5 | ✅ Batch de row compare (A3) | `row_comparator.rs`, `compare_service.rs` | — | 1-1.5 días | 🔴 Alta |
| 6 | ✅ Fix B3 (contar filas en tablas missing) | `compare_service.rs` | 3 | 0.5 días | 🟡 Media |
| 7 | ✅ Progreso real + cancelar (A7) | `commands.rs`, `SchemaDiffWizard.tsx`, `compare.service.ts` | — | 1 día | 🔴 Alta (UX crítico) |
| 8 | ✅ Paralelismo de introspectión (A6) | `compare_service.rs`, `table_comparator.rs` | 3 | 1-2 días | 🟡 Media |
| 9 | ✅ Resumen en lenguaje natural (B2) | `models/compare.rs`, `compare_service.rs`, `SchemaDiffWizard.tsx` | 7 | 1 día | 🟡 Media |
| 10 | ✅ Vista detalle completa con diff A/B (B3) | `SchemaDiffWizard.tsx`, nuevo `CompareResultsList.tsx` | 7, 9 | 2-3 días | 🟡 Media |
| 11 | ✅ Vista Script mejorada (B5) | `SchemaDiffWizard.tsx`, nuevo `ScriptReview.tsx` | 10 | 1-1.5 días | 🟢 Media-baja |
| 12 | ✅ Tokens de color y accesibilidad (B6, B7) | `SchemaDiffWizard.tsx`, `ScriptReview.tsx` | 10 | 0.5-1 días | 🟢 Media-baja |
| 13 | ✅ Reducción IPC + streaming (A8) | `compare_service.rs`, `compare.service.ts` | 4-8 | 1-2 días | 🟢 Baja |

**Total estimado: ~14-18 días**.

**Orden recomendado de entrega** (para obtener valor pronto):
1. Sprint 1 (3.5 días): B1+B2+fallos de correctitud → los resultados dejan de estar incompletos.
2. Sprint 2 (3 días): A1+A2+A3 → rendimiento O(n) y sin duplicación.
3. Sprint 3 (2 días): A7 + B2/B3 UX básico → el usuario ve progreso y resumen.
4. Sprint 4 (4-5 días): B3+B5 vista detalle y script → valor UX completo.
5. Sprint 5 (2-3 días): A6+A8 → escalabilidad en bases grandes.

---

## 6. Métricas de Éxito y Verificación

| Métrica | Antes (referencia) | Después (objetivo) | Cómo medir |
|---------|-------------------|--------------------|------------|
| Schema compare, 100 tablas / 3000 columnas | TBD (baseline a medir) | ≥5x más rápido | Timer en `compare_schemas` + logs |
| Data compare, tabla 1M filas | O(n²) por OFFSET | O(n), keyset | Comparar con 1M y 2M filas: tiempo ~lineal |
| Filas divergentes (10k) | 20k SELECTs (N+1) | ~40 queries batch | Contar queries ejecutadas (tracing) |
| FK diffs detectados | 0 (bug B1) | 100% de diferencias | Dataset con FKs distintas on-delete/on-update |
| UX: % de usuarios que encuentra el diff en <30s | TBD | ≥80% | Test manual con 5 usuarios (técnicos y no técnicos) |

**Checklist de CI** (por AGENTS.md):
- `cd frontend && bun run lint && bunx tsc -b && bun run test`
- `cd src-tauri && cargo fmt --all -- --check && cargo clippy --lib --all-targets -- -D warnings && cargo test --lib`
- Tests nuevos obligatorios: fk_comparator (binds), keyset pagination (hash_generator), batch compare (row_comparator), restore de pool.

---

## 7. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Keyset con PKs compuestas o tipos exóticos (UUID, decimal, text) | Comparación incorrecta | Normalizar clave con `CAST(pk AS text)`; test con UUID y composite |
| Paralelismo saturando el pool de conexiones | Timeouts en BD | `buffered(4-8)` + límite configurable; respetar `max_connections` del pool |
| Batch IN (...) con 500 PKs en SQLite (límite de variables) | Error en runtime | Detectar `?` limits por driver; batch dinámico (SQLite: 500 → 250) |
| Reportes grandes saturan el render | UI congelada | Virtualización + streaming por secciones (A8) |
| Resumen en lenguaje natural desalineado con el detalle | Confianza del usuario | Generar el resumen desde los mismos datos del reporte; test de consistencia |
| Cambios de visual rotos por tokens nuevos | Regresión visual | Mantener los tokens `--color-*` existentes; solo reemplazar hex hardcodeados |
