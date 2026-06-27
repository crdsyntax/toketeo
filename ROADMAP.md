# Roadmap: Cross-DB Sync

## Visión General

Sincronizar datos entre motores de base de datos heterogéneos (MySQL, MariaDB, PostgreSQL, MongoDB, SQL Server) mediante pipelines configurables con extracción, transformación y carga.

---

## Fase 1: Foundation (en progreso)

**Objetivo:** Tipos base, traits separados, capacidades por driver.

- [ ] Crear `src-tauri/src/models/sync.rs` — tipos `SyncPipeline`, `SyncMode`, `PipelineStatus`, `DriverCapabilities`, `UpsertStrategy`
- [ ] Separar `DbDriver` en traits especializados: `SchemaProvider`, `DataReader`, `DataWriter`, `CapabilityProvider`
- [ ] Implementar `CapabilityProvider` en MySQL, MariaDB, PostgreSQL, MongoDB, SQL Server
- [ ] Registrar módulo `sync` en `lib.rs`

---

## Fase 2: Estrategias + Extractores (completada)

**Objetivo:** Motor de sincronización con paginación por keyset.

- [x] Trait `SyncStrategy` + `FullSync` e `IncrementalSync`
- [x] `SqlExtractor`: keyset pagination (`WHERE pk > ? ORDER BY pk LIMIT ?`)
- [x] `MongoExtractor`: cursor pagination (`{ _id: { $gt: last_id } }`)
- [x] Trait `DataExtractor` + registro de extractores por engine

---

## Fase 3: Transformadores (completada)

**Objetivo:** Mapeo de esquemas y transformaciones de columnas.

- [x] `SchemaMapper`: mapeo de tipos entre engines
- [x] `ColumnMapper`: mapeo columna-a-columna
- [x] `ColumnTransforms`: `trim()`, `uppercase()`, `lowercase()`, `default_value`, `regex`, `concat`, `cast`, `date_format`

---

## Fase 4: Cargadores (Upsert) (completada)

**Objetivo:** Carga con upsert específico por engine.

- [x] Trait `DataWriter` con `upsert_rows` (ON CONFLICT / ON DUPLICATE KEY / MERGE / upsert:true)
- [x] `MongoLoader` (`updateOne` con `upsert: true`)
- [x] Batch commit configurable

---

## Fase 5: Validación + Schema Diff

**Objetivo:** Validar pipeline antes de ejecutar.

- [ ] `Validator`: conexiones, tablas, columnas, tipos, PKs, NOT NULL, permisos, charset, espacio
- [ ] `SchemaDiff`: comparar esquemas source vs target
- [ ] `ValidationReport` detallado

---

## Fase 6: Checkpoints + Reanudación

**Objetivo:** Sincronizaciones reanudables.

- [ ] `CheckpointService`: CRUD de checkpoints
- [ ] Reanudar desde último batch exitoso
- [ ] Persistencia SQLite (`sync_checkpoint`)

---

## Fase 7: EventBus + Comandos Tauri + Persistencia

**Objetivo:** Comunicación pipeline → frontend.

- [ ] `EventBus`: canal interno con eventos (`BatchCompleted`, `RowError`, `SyncFinished`)
- [ ] `SyncCommands`: `start_sync`, `stop_sync`, `pause_sync`, `resume_sync`, `list_syncs`, `get_sync_run`, `validate_pipeline`, `preview_sync`, `schema_diff`, `get_checkpoint`
- [ ] Persistencia SQLite: `sync_pipeline`, `sync_run`, `sync_batch`, `sync_log`, `sync_row_error`

---

## Fase 8: Frontend — Store + API Layer

**Objetivo:** Comunicación frontend → backend.

- [ ] Tipos TypeScript (`sync.ts`)
- [ ] `syncStore.ts` (Zustand)
- [ ] `api/sync.ts` (invoke wrappers)

---

## Fase 9: Frontend — Pipeline Editor

**Objetivo:** Crear y configurar pipelines.

- [ ] `PipelineList`: listado de pipelines guardados
- [ ] `PipelineEditor`: selector source/target, tablas, modo
- [ ] `ColumnMapper`: mapeo visual columna-a-columna
- [ ] `TransformEditor`: transformaciones por columna

---

## Fase 10: Frontend — Monitoreo

**Objetivo:** Visualizar ejecución en tiempo real.

- [ ] `SyncProgress`: barra de progreso, batches, velocidad
- [ ] `SyncLogViewer`: log estructurado por batch
- [ ] `SyncHistory`: histórico de ejecuciones

---

## Fase 11: Scheduler

**Objetivo:** Sincronizaciones programadas.

- [ ] `SyncJob` executor en `job_engine.rs`
- [ ] Integración con scheduler existente (cron)

---

## Fase 12: Preview

**Objetivo:** Vista previa sin escribir en destino.

- [ ] Reutilizar pipeline: Extract → Transform → (detener antes de Load)
- [ ] Frontend: `SchemaDiffViewer` + preview de datos

---

## Diagrama de dependencias

```
Fase 1 (Foundation)
    ↓
Fase 2 (Estrategias + Extractores) ──→ Fase 3 (Transformadores) ──→ Fase 4 (Cargadores)
    ↓                                        ↓
Fase 5 (Validación + Schema Diff) ←─────────┘
    ↓
Fase 6 (Checkpoints)
    ↓
Fase 7 (EventBus + Comandos + Persistencia)
    ↓
Fase 8 (Frontend Store + API)
    ↓
Fase 9 (Frontend Pipeline Editor) ──→ Fase 10 (Frontend Monitoreo)
    ↓                                        ↓
Fase 11 (Scheduler)                          Fase 12 (Preview)
```
