# Plan: Independización del Asistente — Split total a crate aparte

> Objetivo: extraer el módulo `src-tauri/src/application/assistant/` del crate único `toketeo` a un crate de Cargo independiente (`toketeo-assistant`), manteniéndolo **integrado** con la app (funciona igual de dentro de Toketeo) pero con **aislamiento de código real**.
> Estado: propuesta (sin código aplicado). Vigente desde 2026-08-31.

---

## 1. Por qué este plan

Hoy el asistente **no es un módulo aislado**: está fuertemente y **cíclicamente** acoplado al crate principal. No es autocontenido (depende de `AppState`, `Storage`, `models`, `db`) y, a la vez, el crate principal depende de vuelta de él (`AppState` lo embebe, `session_service` lo llama, `storage.rs`/`models` importan sus tipos). Este plan lo extrae en limpio a un workspace Cargo.

### Evidencia del acoplamiento actual (auditoría de código)

| Acoplamiento | Archivo:línea |
|---|---|
| `use crate::state::AppState;` (tools + orchestrator + sql_fixer + learning) | `orchestrator.rs:12`, `sql_fixer.rs:8`, `tool_engine.rs:9`, `learning_engine.rs:2`, casi todos los `tools/*` |
| Tools llaman lógica de negocio de `AppState` directo | `tool_engine.rs:77,83-87,97,228` |
| `use crate::storage::Storage;` | `knowledge/knowledge_engine.rs:3` |
| Persistencia del asistente en `storage.rs` del crate principal | `storage.rs:286-349` (tablas assistant_* y query_history) + CRUD `storage.rs:1630-2376` |
| Modelos del asistente FUERA del módulo | `src-tauri/src/models/assistant.rs` (`models/mod.rs:1`), `AssistantMessage`/`QueryHistoryEntry` en `models/mod.rs:281,297` |
| `use crate::db::{DbDriver, DbType, quote_identifier};` | `context/context_builder.rs:1`, `context/schema_engine.rs:6`, `tools/ddl_tool.rs:4`, mayoría de tools |
| Tools usan servicios de negocio concretos | `ExplorerService`, `SqlGeneratorService`, `ModelGeneratorService`, `CompareService`, `ConnectionService`, `SyncService`, `JobEngine`, `crate::ssh::APP_HANDLE` |
| `use crate::error::{AppError, AppResult}` | todos los archivos del módulo |
| **Dependencia inversa**: `AppState` embebe `SchemaEngine`/`ToolEngine`/`VectorIndex` y registra 24 tools | `state.rs:1-2,67-70,88-93,116-170` |
| **Dependencia inversa**: servicio ajeno usa helpers del asistente | `application/session_service.rs:205` → `state.schema_engine.evict_expired()` |
| **Dependencia inversa**: `Storage` y `models` importan tipos del asistente | `storage.rs:1832,...`, `models/mod.rs:1` |
| Startup usa clases del asistente | `lib.rs:65-123` (`KnowledgeEngine`, `EmbeddingProvider`, `VectorIndex`) |

> Conclusión de la auditoría: la parte "pura" (adapters HTTP, prompt, orchestrator, sql_fixer, context, knowledge/embeddings) es la más extraíble; la parte que concentra el costo son los **24 `tools/*`** (dependen de `AppState` y ~7 servicios de aplicación) más la **dependencia inversa** de `AppState`/`Storage`/`session_service`.

---

## 2. Estructura objetivo (workspace Cargo)

```
toketeo/
├── Cargo.toml                      # [workspace] members = ["src-tauri", "crates/contracts", "crates/db", "crates/assistant"]
├── crates/
│   ├── contracts/                  # toketeo-contracts — tipos de datos puros compartidos (sin lógica de negocio)
│   │   └── src/lib.rs              #   modelos del asistente + AppError/AppResult + modelos base compartidos
│   ├── db/                         # toketeo-db — solo el trait DbDriver + DbType + quote_identifier
│   │   └── src/lib.rs
│   └── assistant/                  # toketeo-assistant — TODO el módulo del asistente, autocontenido
│       └── src/
│           ├── lib.rs
│           ├── assistant.rs        #  (orchestrator, sql_fixer, adapters, context, prompt, knowledge,
│           │                       #   learning, history)
│           └── tools/              #  los 24 tools, ahora vs trait de contexto, no vs AppState
└── src-tauri/                      # toketeo (app) — AppState, Storage, drivers, services, presentation
    └── src/
        ├── main.rs / lib.rs        #   queda la app; consume los 3 crates
        ├── state.rs                #   AppState implementa AssistantContext + asamble el crate assistant
        ├── storage.rs              #   Storage implementa AssistantStorage
        ├── db/                     #   drivers concretos implementan el trait de toketeo-db
        └── ...
```

**Regla de dependencias (una dirección):**
```
src-tauri  ──depende──▶  toketeo-assistant  ──depende──▶  toketeo-contracts, toketeo-db
src-tauri  ──depende──▶  toketeo-contracts, toketeo-db
```
**Ningún crate auxiliar puede depender de `src-tauri`.** Se elimina el ciclo.

---

## 3. Pasos

> Cada paso sigue el flujo del AGENTS.md: **Analyze → Plan → List files → Wait approval → One change → Stop**. Verificación tras cada paso: `cargo build --workspace`, `cargo test --workspace`, y en `src-tauri` el fmt/clippy/tests exigidos por AGENTS.md.

### Paso 0 — Crear el workspace Cargo
- Añadir `Cargo.toml` raíz con `[workspace] members = ["src-tauri", "crates/contracts", "crates/db", "crates/assistant"]` y `resolver = "2"`.
- `src-tauri/Cargo.toml` pasa a declaran dependencias de los 3 crates (`path = "../crates/..."`).
- Verificar que `cargo build --workspace` compila **sin mover nada aún** (los crates nuevos deben existir como stubs vacíos o crearse en el paso 1).

### Paso 1 — Crates de contratos y DB (los cimientos)
- **`toketeo-contracts`**: mover `src/models/assistant.rs` (AiRequest, AiResponse, AssistantTurn, SchemaContext, ToolResult, ProviderConfig, KnowledgeCase, Preference, ToolDescriptor, ToolCall, TokenUsage, etc.), `AssistantMessage`, `QueryHistoryEntry`, y `AppError`/`AppResult`.
  - Requiere llevar también los tipos base que esos modelos referencian (`DbType` → desde `toketeo-db`, `DbConnectionConfig`, etc.). Un crate de **datos puro** evita ciclos de compilación.
- **`toketeo-db`**: mover el **trait** `DbDriver`, `DbType` y `quote_identifier` desde `src/db/mod.rs` (solo el trait + tipos, no los drivers).
- Re-exportar desde `src-tauri` para no tocar aún todos los `use crate::...` del código existente (delegar/`pub use`) → permite avanzar paso a paso sin romper la app.
- ✅ Verificación: `cargo build --workspace` + `cargo test`.

### Paso 2 — Trait de persistencia `AssistantStorage`
- Definir en `toketeo-assistant` (o `toketeo-contracts`) el trait:
  ```rust
  #[async_trait]
  pub trait AssistantStorage: Send + Sync {
      fn save_assistant_message(&self, ...) -> AppResult<()>;
      fn load_assistant_messages(&self, connection_id: &str, limit: usize) -> AppResult<Vec<AssistantMessage>>;
      fn clear_assistant_messages(&self, connection_id: &str) -> AppResult<()>;
      // ... query_history, provider_configs, knowledge, preferences
  }
  ```
- `src-tauri::Storage` lo implementa (los métodos ya existen en `storage.rs`, solo hay que ajustarlos a la firma del trait).
- El asistente deja de depender del `Storage` concreto.
- ✅ `cargo build --workspace` + `cargo test`.

### Paso 3 — Trait de contexto `AssistantContext` (desacoplar `AppState`)
- Definir en `toketeo-assistant`:
  ```rust
  #[async_trait]
  pub trait AssistantContext: Send + Sync {
      async fn get_connection(&self, id: &str) -> Option<Arc<DbConnectionConfig>>;
      async fn get_or_connect_driver(&self, id: &str) -> AppResult<Arc<dyn DbDriver>>;
      fn storage(&self) -> Arc<dyn AssistantStorage>;
      fn schema_engine(&self) -> &SchemaEngine;
      fn emit(&self, event: &str, payload: serde_json::Value);
      fn is_destructive_allowed(&self) -> bool;
      // ... service providers: explorer, sql_generator, compare, connection, sync, jobs, ssh_handle
  }
  ```
- **`src-tauri::AppState` implementa `AssistantContext`.** Los 24 tools y el `orchestrator`/`sql_fixer`/`learning_engine` cambian sus firmas de recibir `&AppState` a recibir `&dyn AssistantContext` (o `&Arc<dyn AssistantContext>`).
- `ToolEngine` se registra dentro del crate assistant (sus tools reciben el trait), eliminando la necesidad de `AppState::init_tools`.
- ✅ `cargo build --workspace` + `cargo test`.

### Paso 4 — Absorber los tools y servicios de negocio
- Mover los **24 tools** al crate assistant.
- Los servicios de negocio que los tools llaman (`ExplorerService`, `SqlGeneratorService`, `ModelGeneratorService`, `CompareService`, `ConnectionService`, `SyncService`, `JobEngine`, `ssh::APP_HANDLE`) se exponen **detrás del trait `AssistantContext`** (métodos del trait o un trait `AssistantServiceProvider` asociado).
- `ssh::APP_HANDLE` (estado global estático) se sustituye por un handle inyectable vía el contexto (evitar estado global cruzando frontera de crate).
- ✅ `cargo build --workspace` + `cargo test`.

### Paso 5 — Eliminar la dependencia inversa
- `AppState` deja de **embeber** `SchemaEngine`/`ToolEngine`/`VectorIndex` concretos; el crate assistant se instancia y el principal obtiene los servicios vía el crate (p. ej. un `AssistantRuntime` que el principal guarda y expone).
- `application/session_service.rs:205` (`state.schema_engine.evict_expired()`) refactoriza para pedir el schema engine a través del runtime/context.
- El startup `lib.rs:65-123` se simplifica: inicializa el crate assistant (embedding backfill, vector index) a través de su API pública.
- `storage.rs`/`models` dejan de importar tipos del asistente (ya viven en `toketeo-contracts`).
- ✅ `cargo build --workspace`/`cargo test` + CI completo (lint/tsc/tests del frontend si aplica).

---

## 4. Costo, riesgo y fases

| Fase | Trabajo | Riesgo |
|---|---|---|
| Paso 0-1 (workspace + contratos + db) | Bajo | Bajo (mover tipos puros + re-export) |
| Paso 2 (trait de persistencia) | Medio | Medio (ajustar ~2000 líneas de llamadas a storage) |
| Paso 3 (trait de contexto) | Alto | **Alto** (los 24 tools + orchestrator vs `&AppState`) |
| Paso 4 (servicios de negocio) | Alto | **Alto** (~7 servicios a abstraer tras el contexto) |
| Paso 5 (romper inversa) | Medio | Medio |

- **Estimación total: ~2-3 semanas hábiles**, con verificación verde en cada paso.
- **Parte fácil de extraer primero**: adapters HTTP, prompt, orchestrator, sql_fixer, context, knowledge/embeddings (fronteras limpias contra HTTP).
- **Parte que concentra el costo**: los tools y la inversa de `AppState`/`Storage`/`session_service`.
- **No romper en el camino**: cada paso mantiene la app compilando y testeando (se usa estrategia de "mover + re-exportar", no "borrar y reescribir").

## 5. Beneficios (por qué vale la pena)

- **Aislamiento real de código**: el asistente deja de ser un cajón que toca todo; solo se comunica por traits.
- **Compilación incremental**: `cargo check -p toketeo-assistant` no recompila la app ni los drivers.
- **Elastividad**: al estar aislado vía traits, el asistente podría reutilizarse/testearse en otro contexto (opencode, CLI, otra UI) sin arrastrar Tauri.
- **Visibilidad de capa**: se materializa en el código la regla "La inteligencia está en Rust; el modelo solo interpreta" sin acoplamiento al shell de la app.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Ciclo de compilación entre crates | Crates de contratos/db solo con tipos puros; ninguna dependencia hacia `src-tauri` |
| `ssh::APP_HANDLE` (estado global) cruzando crate | Inyectar handle por el trait de contexto; no leer el estático desde `toketeo-assistant` |
| `AppError`/`AppResult` compartido | Vive en `toketeo-contracts`; ambos lados lo usan |
| Regresión en la app durante el split | Estrategia mover+re-export; CI verde en cada paso; PR incremental (una por paso) por el AGENTS.md |
| Los 24 tools vs `AppState` concreto | Trait `AssistantContext` con todos los service providers; quitar `&AppState` de las firmas |

---

## 7. Criterio de terminado (Definition of Done)

- [ ] Workspace Cargo con `toketeo-assistant` como crate independiente (y `contracts`/`db`).
- [ ] `cargo build --workspace` y `cargo test --workspace` verdes.
- [ ] `src-tauri` no importa ningún tipo de `application/assistant` por ruta directa; solo los crates.
- [ ] `toketeo-assistant` no importa `crate::` de `src-tauri` (ninguna ruta a `state.rs`/`storage.rs`/`db/mod.rs`/`models`/`ssh`).
- [ ] `session_service.rs`, `storage.rs`, `models` y `lib.rs` sin referencia directa a los tipos internos del asistente (solo al runtime/API del crate).
- [ ] Los 24 tools reciben `&dyn AssistantContext`, no `&AppState`.
- [ ] `docs/assistant_architecture_reference.md` actualizado a la nueva estructura de crates.

---

_End of plan. Mantener este documento en sincronía con cualquier cambio real al dividir el asistente._
