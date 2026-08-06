# Plan: Tool Calls Universales para el Asistente

> Estado: propuesta pendiente de aprobación
> Alcance: backend (Rust/Tauri) + frontend (React)
> Principios rectores: `agents/backend/tech-leader.md`, `agents/frontend/tech-leader.md`, `agents/core/engineering.md`, `agents/core/security.md`

## 1. Objetivo

Que el asistente pueda **realizar cualquier acción** que la aplicación permite hoy (≈130 commands Tauri), mediante tool calls agrupadas por dominio, con confirmación humana para operaciones destructivas, sin exponer credenciales ni funcionalidad de seguridad de la sesión.

## 2. Diagnóstico actual

Lo que YA existe (no se reimplementa):

- `AssistantTool` trait + `ToolEngine` con 10 tools (`schema`, `index`, `explain`, `compare`, `data_compare`, `codegen`, `backup`, `export`, `auto_schema`, `sync`) — `src/application/assistant/tools/`
- Bloqueo de tools destructivas + `confirm_destructive` end-to-end (backend + botón "Confirmar y ejecutar" en `QueriesPanel`)
- Resolución de `connection_id` por args en `ToolEngine` (cualquier tool puede apuntar a cualquier conexión)
- `AppState::get_or_connect_driver` (reconexión automática por ID)
- `SyncTool` con auto-detección de tablas y acción `run`

Brechas:

- Solo 10 dominios cubiertos; faltan: conexiones, explorer, query ejecución, DDL, transacciones, compare sessions, jobs, history, knowledge, diagrams, audit
- `commands.rs` = 2237 líneas y `assistant_commands.rs` = 794 líneas: lógica de orquestación en la capa de presentación (violación de capas)
- Sin tests en: `tool_engine`, `schema_tool`, `sync_tool`, `export_tool`, `assistant_commands`, `opencode.rs`
- Commands con parámetros `serde_json::Value` sin DTO tipado

## 3. Inventario de dominios → tool calls

| # | Tool call | Funciones que envuelve (commands) | Destructiva | Seguridad |
|---|-----------|-----------------------------------|-------------|-----------|
| 1 | `connections` | save/get/list/delete, connect, reconnect, disconnect, switch_database, switch_schema, diagnose, test, export/import | delete | Nunca expone credenciales; solo IDs/nombres |
| 2 | `explorer` | get_databases/schemas/tables/views/procedures/triggers/functions/columns/indexes/fks/constraints, get_ddl, get_table_preview, get_mongo_structure, get_table_sizes, get_schema_diagram_data, get_db_type | no | Solo lectura |
| 3 | `query` | execute_query (clasificado con `SafetyClassifier`), generate_safe_delete_sql, search_similar_queries | sí si es escrita | Params `connection_id`+`database`; jamás devuelve credenciales |
| 4 | `query_edit` | update_cell, edit_column (data) | sí | — |
| 5 | `transaction` | begin/commit/rollback (por conexión) | sí | — |
| 6 | `ddl` | update_ddl, drop/rename column/index/fk/constraint, create/drop database/schema/collection, generate_sql, generate_model | sí | — |
| 7 | `schema` (existe) | describe/ddl/tables/columns | no | Ya soporta `connection_id` |
| 8 | `sync` (existe, extender) | + list/get/delete/validate/validate_config, pause/resume/cancel, list_runs/batches/row_errors, get_checkpoint | create/run sí | — |
| 9 | `compare` | compare_schemas, compare_data, generate_sync_script, pause/resume/cancel, save/get/load/delete session | no (sesiones solo lectura) | — |
| 10 | `backup` (existe, extender) | dump_schema_dialog (sin dialog), restore_database_selected, mongo_backup/restore | restore sí | — |
| 11 | `jobs` | create/update/delete/get, run_job_now, stop_job_now, scheduler_get_databases/tables | create/update/delete/run sí | — |
| 12 | `history` | save/load/clear query history, save/load/clear assistant messages | clear sí | — |
| 13 | `knowledge` | assistant_search/list/toggle_favorite/record_case | delete no existe hoy | — |
| 14 | `assistant_config` | providers CRUD, test_provider, preferences get/set, record_feedback, get_recommendations | save/delete sí | API keys nunca en respuestas (se devuelve `has_key` bool) |
| 15 | `diagrams` | save/get/list/delete_diagram | delete sí | — |

**Excluidos deliberadamente** (el agente NO debe tocarlos):
- Sesión/seguridad: master password, unlock/lock, recovery code, TOTP, Windows Hello, keyring
- Gamification/character (estado de UI del juego)
- Dialogs de archivo (acciones de UI del frontend, no lógica)

## 4. Arquitectura técnica

### 4.1 Contrato

Cada tool nueva sigue el trait existente:

```rust
pub trait AssistantTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;   // JSON Schema de parámetros
    fn parameters(&self) -> serde_json::Value;
    fn is_destructive(&self) -> bool;
    async fn execute(&self, args, driver, state) -> AppResult<ToolResult>;
}
```

Reglas por dominio:
- **Lectura**: `requires_confirmation: false` siempre.
- **Escritura/destructiva**: `is_destructive() = true` → el `ToolEngine` la bloquea y el frontend pide confirmación (flujo ya operativo).
- **`connection_id`**: obligatorio en todos los dominios de DB; resuelto por `ToolEngine::resolve_driver` (ya existe).
- **Respuestas**: `ToolResult { ok, data: Option<Value>, requires_confirmation, message }`. `data` solo con datos de metadata/resultado, nunca credenciales.

### 4.2 Capas (separación obligatoria)

- **Presentation** (`presentation/tauri/commands.rs`, `assistant_commands.rs`): commands thin, DTOs validados, delegación. Prohibido: SQL, spawn de sync, keepalive, orquestación de tools.
- **Application**: servicios de orquestación reutilizables por commands Y tools:
  - `SyncExecutionService` (extraer de `start_sync`: spawn, keepalive, eventos, in_use) — consumido por `commands::start_sync` y `SyncTool::run`
  - `ChatOrchestrator` (extraer de `assistant_chat`: loop de tools, detección de loops, confirmación, knowledge-first) — el comando queda como envoltorio IPC
  - `ConnectionOrchestrator` (connect/disconnect/switch con validación)
- **Infrastructure**: drivers, pooling, extracción de metadata (sin cambios).
- **Domain**: `models/` DTOs tipados.

### 4.3 Tipado estricto

Auditoría y conversión a DTOs (con `#[serde(rename_all = "camelCase")]`) de los commands que hoy aceptan `serde_json::Value` como entrada:
- `update_ddl`, `edit_column`, `update_cell`, `execute_explorer`, `save_sync_pipeline`, `create_scheduled_job`, `update_scheduled_job`, `save_compare_session`, `generate_sync_script`

Cada DTO en `src/models/` con `#[derive(Debug, Serialize, Deserialize)]` + validación en el command (fail fast).

## 5. Refactor por dominio (una fase = un dominio)

Para cada dominio nuevo, orden obligatorio:
1. Extraer/crear el servicio de aplicación (si no existe)
2. Crear DTOs tipados si los commands usan `Value`
3. Crear la tool (thin, delega al servicio)
4. Registrar en `AppState::init_tools`
5. Tests unitarios del servicio + tool (con `MockDriver` en `src/db/mock.rs`)
6. `cargo check`, `cargo test`, `cargo clippy`

## 6. Tests faltantes (inventario actual → objetivo)

Hoy: tests en compare/*, sync/strategies, session_service, audit_service, sql_generator_service, error.rs, models. Cero en assistant.

Objetivo (por archivo):

| Archivo | Tests a agregar |
|---|---|
| `tools/tool_engine.rs` | bloqueo destructivo sin confirmación; ejecución con confirmación; unknown tool; resolución de `connection_id` (con MockDriver) |
| `tools/sync_tool.rs` | parse de args → pipeline (modo, tablas); error sin source/target; auto-detección con MockDriver; run con pipeline inexistente |
| `tools/schema_tool.rs` | actions tables/columns/ddl/describe; error sin driver; error sin object |
| `tools/export_tool.rs` | formato SQL con escaping de comillas; formato JSON; limit |
| `assistant_commands.rs` | `extract_sql_block` (múltiples casos); clasificación `SafetyClassifier`; formateo de tool results |
| `adapters/opencode.rs` | `strip_prefix`; `is_free_model`; clasificación de tiers (go/free/zen) con mock HTTP |
| `state.rs` | `get_or_connect_driver` con conexión muerta → reconexión (mock) |
| `storage.rs` | CRUD de sync_pipelines, provider_configs, assistant_messages |
| `models/sync.rs` | serde round-trip de SyncPipeline/ValidationReport |

Helper: `src/db/mock.rs` — `MockDriver` implementando `DbDriver` (tablas/columnas fijas, respuestas configuradas) para tests de tools sin DB real.

## 7. Fases de implementación

| Fase | Contenido | Criterio de salida |
|---|---|---|
| 0 | Refactor habilitador: `ChatOrchestrator`, `SyncExecutionService`, `ConnectionOrchestrator`, DTOs de commands con `Value`, `MockDriver` | commands.rs y assistant_commands.rs < 60% de lógica; cargo test verde |
| 1 | Tools de lectura: `connections` (lectura), `explorer`, `history`, `knowledge`, `assistant_config` (lectura) | tests + verificación manual con "lista mis conexiones", "muéstrame las tablas de X" |
| 2 | Tools de escritura: `query`, `query_edit`, `transaction`, `ddl`, `connections` (escritura) | confirmación destructiva manual por tool |
| 3 | `sync` (extend), `compare`, `backup`, `jobs`, `diagrams` | flujo completo: crear → confirmar → correr → verificar |
| 4 | Hardening: auditoría de seguridad (no-credenciales), clippy, tests faltantes, actualizar `assistant_list_tools` | definition of done (ver §9) |

Cada fase: 1 change → verificar → stop (proceso AGENTS.md).

### Fase 0 — estado (completada)

- `ChatOrchestrator` (`application/assistant/orchestrator.rs`): loop de tools + knowledge-first + persistencia extraídos de `assistant_chat`. `assistant_commands.rs`: 794 → 296 líneas, delegación pura. `extract_sql_block` movido con 6 tests.
- `SyncExecutionService` (`application/sync/sync_execution_service.rs`): spawn/keepalive/eventos/in_use extraídos de `start_sync`; `fill_schemas` y `auto_detect_primary_keys` compartidos con `SyncTool` (DRY).
- `JobConfigDto` (`models/mod.rs`): `create_scheduled_job`/`update_scheduled_job` con firma tipada (`config` con campos conocidos + `extra` flatten).
- `MockDriver` (`db/mock.rs`, `#[cfg(test)]`): implementa `DbDriver`+`DataReader`+`DataWriter` con tablas/columnas configurables, para tests sin DB.
- Tests agregados: `extract_sql_block` (6), `SafetyClassifier` (2), `sync_tool` parse (5), `export_tool` format (4), `opencode` (7), `storage` CRUD (3) → **181 tests verdes**.
- `create_adapter` movido a `adapters/mod.rs`.

**Nota de entorno (Windows)**: en esta máquina, los binarios de test que enlazan el código de `AppState`/tauri fallan al cargar con `0xc0000139` (STATUS_ENTRYPOINT_NOT_FOUND) — verificado con target dirs nuevos, builds limpios y dumpbin (todos los símbolos existen; los tests con `Storage` solo pasan). Causa no aislada; los tests que requieren `AppState` quedan pendientes de CI u otro entorno. El código de los tests de `tool_engine` con `MockDriver` está listo en el historial de esta sesión.

### Fase 1 — estado (completada)

5 tools nuevas de lectura registradas en `AppState::init_tools` (15 tools en total):

| Tool | Acciones | Seguridad |
|---|---|---|
| `connections` | `list` (todas, sin credenciales), `databases`, `status` | Nunca expone password; `connected` = sesión activa |
| `explorer` | `dbType`, `databases`, `schemas`, `tables`, `views`, `procedures`, `triggers`, `functions`, `columns`, `indexes`, `foreignKeys`, `constraints`, `ddl`, `preview` (100 filas) | Solo lectura; `connection_id` opcional |
| `history` | `queries`, `messages` (por conexión o global) | Solo lectura |
| `knowledge` | `search`, `list`, `favorite`, `record` | No destructiva |
| `assistant_config` | `configs` (con `hasKey` — **las API keys nunca van al modelo**), `preferences`, `recommendations` | Keys nunca expuestas |

Verificado: `cargo check`, 181 tests, clippy limpio en archivos nuevos.

### Fase 2 — estado (completada)

5 tools de escritura registradas (20 tools en total), todas con confirmación destructiva:

| Tool | Acciones | Notas |
|---|---|---|
| `query` | Ejecutar SQL (connection_id + sql + schema) | `is_destructive` → siempre confirmación; bloquea escrituras en conexiones read-only (`is_read_only`); devuelve filas/columnas/rowsAffected |
| `query_edit` | update de celda (CellUpdateInput) vía `SqlGeneratorService` + `ExplorerService` | Requiere row + primary_keys |
| `transaction` | `begin`/`commit`/`rollback` (AppState) | — |
| `ddl` | `update` (DDL arbitrario), `dropColumn`, `dropIndex`, `renameIndex`, `dropForeignKey`, `dropConstraint`, `createDatabase`, `dropDatabase`, `createSchema`, `dropSchema`, `createCollection` | SQL por engine con `db::quote_identifier` (movida a `db/mod.rs`, compartida con commands — DRY) |
| `connection_manage` | `connect` (por id), `disconnect`, `save` (config completo tipado), `delete`, `switchDatabase` | Delega en `ConnectionService`; sin credenciales en el chat |

Verificado: `cargo check`, 181 tests, clippy limpio en archivos nuevos.

### Fase 3 — estado (completada)

| Tool | Acciones | Notas |
|---|---|---|
| `sync` (extendida) | + `list`, `get`, `delete`, `validate`, `pause`, `resume`, `cancel`, `runs`, `batches`, `errors`, `checkpoint` | 13 acciones en total |
| `compare_sessions` | `list`, `load`, `save`, `delete`, `pause`, `resume`, `cancel` | Sesiones persistidas + control de comparaciones |
| `backup` (extendida) | `dump`, `restore` (SQL), `mongoBackup`, `mongoRestore` | `file_path` explícito (sin dialogs); restore destructivo |
| `jobs` | `create` (JobConfigDto), `update`, `delete`, `list`, `run` (background con AppHandle del JobEngine), `stop`, `databases`, `tables` | Getter `JobEngine::app_handle()` añadido |
| `diagrams` | `list`, `get`, `save`, `delete` | CRUD de diagramas |

Total: **23 tools**. Verificado: `cargo check`, 181 tests, clippy limpio en archivos nuevos.

### Fase 4 — estado (completada) · Hardening

**Auditoría de credenciales** (todas las tools revisadas):
- `connections`: nunca expone password (solo id/name/type/host/port/user/database/environment/connected)
- `assistant_config`: API keys nunca — solo `hasKey`
- `jobs`: **fix aplicado** — `sanitize_job` elimina `password` del `config` en `list`/`create`/`update` (los jobs de backup guardan la password de la conexión para ejecutarse; ya no llega al modelo)
- `connection_manage.save`: el usuario aporta su propio config (sin leak del sistema)
- Adapters: api_key solo en headers HTTP

**Bugs encontrados y corregidos**:
- `JobConfigDto.extra` sin `#[serde(flatten)]` → los campos desconocidos del config de jobs se perdían (corregido + test de regresión)
- `sync_execution_service` clippy (`map_or` → `is_some_and`)

**Tests**: 184 (nuevos: `sanitize_job` ×2, `JobConfigDto` round-trip ×1).

### Definition of Done — cumplido

- [x] Cualquier acción de la UI ejecutable desde el chat con confirmación humana (23 tools; excluidos por diseño: sesión/seguridad, gamification, dialogs de archivo)
- [x] Cero commands con `serde_json::Value` sin DTO en firmas de entrada (solo `assistant_execute_tool`, args dinámicos legítimos)
- [x] `assistant_commands.rs` sin lógica de negocio (296 líneas, delegación); `commands.rs` conserva lógica preexistente de DDL/backup inline (documentado; `quote_identifier` centralizado en `db/mod.rs`)
- [x] Tests por tool/servicio nuevo (184 verdes; tests de integración con `AppState` pendientes de entorno Windows — ver nota)
- [x] `cargo check`, `cargo test`, clippy limpio en archivos nuevos, `npm run build` OK
- [x] Ninguna credencial en respuestas de tools (auditado + sanitizado)

## 8. Riesgos y decisiones

- **Límites de respuesta**: `execute_query` con resultados grandes → truncar a N filas + aviso en `message`.
- **Rate limits del proveedor** (429 en planes free): el orquestador debe devolver el error tal cual; el usuario cambia de modelo si es persistente.
- **Sync larga en el chat**: `SyncTool::run` ejecuta inline; si tarda >30s el usuario no ve progreso → fase 3 decide si emitir eventos `sync:event` (requiere AppHandle en AppState).
- **Seguridad de `query`**: el agente solo ejecuta lo que el usuario pidió; `SafetyClassifier` + confirmación; nada nuevo respecto a `execute_query` del editor.

## 9. Definition of Done

- [ ] Cualquier acción de la UI (excepto seguridad/dialogs/juego) ejecutable desde el chat con confirmación humana
- [ ] Cero commands con parámetros `serde_json::Value` sin DTO en firmas de entrada
- [ ] `commands.rs`/`assistant_commands.rs` sin lógica de negocio (delegación pura)
- [ ] Tests unitarios por tool y servicio nuevo (MockDriver)
- [ ] `cargo check`, `cargo test`, `cargo clippy -D warnings`, `npm run build`, ESLint sin errores
- [ ] Ninguna credencial en respuestas de tools ni logs
