# Plan de Implementación – Asistente Inteligente de Toketeo

## Visión General

Construir un asistente inteligente integrado a Toketeo que aprende progresivamente del usuario **sin acoplarse a un proveedor específico de IA**. El asistente entiende el contexto de la conexión activa, genera consultas precisas, sugiere mejoras, aprende de las correcciones del usuario y reutiliza ese conocimiento en futuras interacciones.

La inteligencia principal reside en **Toketeo (Rust)**, no en el modelo. El modelo únicamente interpreta lenguaje natural cuando el Knowledge Engine no tiene una respuesta validada.

---

## Estado Actual (Base sobre la que se construye)

Ya existe infraestructura del asistente — este plan **extiende** lo construido, no empieza desde cero.

| Componente existente | Path | Estado |
|----------------------|------|--------|
| Modelo `AssistantMessage` | `models/mod.rs:217` | ✅ (id, role, content, sql, is_safe_delete, feedback, timestamp, connection_id) |
| Tabla `assistant_messages` | `storage.rs:270` | ✅ Con migración `feedback TEXT` |
| Comandos IPC | `presentation/tauri/commands.rs:2170` | ✅ save/load/clear messages + update_assistant_feedback |
| `search_similar_queries` | `storage.rs:1477` | ✅ Búsqueda LIKE en query_history — base del Knowledge Engine |
| Store Zustand | `frontend/src/store/assistantStore.ts` | ✅ messages, schemaCache, feedback, onboarding |
| Layout + paneles | `frontend/src/components/assistant/` | ✅ 5 paneles con `FeatureGate` (gamification) |
| `QueriesPanel` | `frontend/.../panels/QueriesPanel.tsx` | ⚠️ IA falsa (`SYSTEM_RESPONSES` + regex) — **a reemplazar** |
| Servicio de esquema | `frontend/src/services/schema.service.ts` | ✅ getTables/getColumns/updateAssistantFeedback |

**No existe todavía:** AI Adapter, Context Builder, Knowledge Engine, Learning Engine, Tool Engine, memoria conversacional, integración con `DbDriver` para contexto.

---

## Principios de Diseño

- Independiente del proveedor de IA (OpenAI, Claude, Gemini, DeepSeek, Ollama, etc.)
- La inteligencia principal reside en Rust (Toketeo), no en el modelo
- El modelo únicamente interpreta lenguaje natural cuando el Knowledge Engine no tiene respuesta validada
- Todo conocimiento generado debe poder reutilizarse
- Cada interacción debe servir para mejorar las siguientes respuestas
- Nunca ejecutar operaciones destructivas automáticamente
- Arquitectura basada en herramientas (Tool Based Architecture)
- **Stack obligatorio:** Rust + Tauri 2 + React. Cero HTTP, cero NestJS, cero Axios. Toda comunicación es `tauri::command`.

---

## Arquitectura General

El asistente es un **caso de uso vertical dentro de `application/assistant/`** que orquesta drivers y servicios existentes. Respeta la layering de Toketeo: comando → application → drivers.

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (React)                                                 │
│  AssistantLayout → assistantStore → services/assistant.service   │
│     ↓ tauriApi.invoke('assistant_*') · eventos de progreso       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ IPC tipado (serde)
┌──────────────────────────────▼──────────────────────────────────┐
│ Presentation: presentation/tauri/assistant_commands.rs           │
│   valida → delega → devuelve DTOs                               │
├─────────────────────────────────────────────────────────────────┤
│ Application: application/assistant/                             │
│   AssistantService (orquestador)                                │
│     ├── context/      (ContextBuilder + SchemaEngine)            │
│     ├── learning/      (LearningEngine + MemoryEngine)           │
│     ├── knowledge/      (KnowledgeEngine — casos validados)      │
│     ├── tools/          (ToolEngine — ejecuta en Rust)            │
│     ├── prompt/         (PromptBuilder)                          │
│     └── history/        (HistoryEngine)                         │
├─────────────────────────────────────────────────────────────────┤
│ Adapters: application/assistant/adapters/                       │
│   AiAdapter (trait) → OpenAI / Claude / Gemini / DeepSeek / Ollama│
├─────────────────────────────────────────────────────────────────┤
│ Infrastructure:                                                 │
│   db/ (DbDriver para contexto/esquema)   storage.rs (persistencia)│
│   infrastructure/crypto.rs (API keys en keyring)                  │
└─────────────────────────────────────────────────────────────────┘
```

**Regla de capas (Tech Leader):** La IA jamás ejecuta SQL ni herramientas. Rust decide y ejecuta; la IA solo propone. El `DbDriver` no se expone al frontend — solo DTOs cruzan IPC.

---

## Módulo 1 – AI Adapter

### Objetivo
Desacoplar completamente el proveedor de IA detrás de un trait Rust.

### Path
`application/assistant/adapters/`

### Responsabilidades
- Enviar prompts y recibir respuestas
- Manejar autenticación (API keys nunca en frontend — ver Seguridad)
- Gestionar modelos disponibles y límites de tokens
- Implementar reintentos y timeouts
- Normalizar respuestas al tipo interno `AiResponse`

### Diseño

```rust
// application/assistant/adapters/mod.rs
#[async_trait]
pub trait AiAdapter: Send + Sync {
    fn id(&self) -> &str;            // "openai" | "claude" | ...
    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse>;
    async fn list_models(&self) -> AppResult<Vec<ModelInfo>>;
    fn supports_tools(&self) -> bool;
}

pub struct AiRequest {
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolDescriptor>,   // descripción para el modelo, no la implementación
    pub temperature: f32,
    pub max_tokens: Option<u32>,
}

pub struct AiResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,     // el modelo pide herramientas; Rust decide ejecutar
    pub usage: TokenUsage,
    pub model: String,
}
```

### Proveedores soportados (Fase 1: 2 priorizados)
| Proveedor | File | Prioridad |
|-----------|------|-----------|
| OpenAI | `adapters/openai.rs` | Fase 1 |
| Ollama (local, sin API key) | `adapters/ollama.rs` | Fase 1 |
| Claude | `adapters/claude.rs` | Fase 2 |
| Gemini | `adapters/gemini.rs` | Fase 2 |
| DeepSeek | `adapters/deepseek.rs` | Fase 3 |

### Selección en runtime
`AssistantConfig` en `AppState` resuelve el adapter activo por conexión o global. Configuración persistida en `storage.rs` (sin secrets — esos van a keyring).

---

## Módulo 2 – Context Builder

### Objetivo
Antes de consultar cualquier IA, Toketeo construye automáticamente el contexto necesario usando `DbDriver`.

### Path
`application/assistant/context/context_builder.rs`

### Información recopilada (vía `DbDriver` existente)
| Dato | Método `DbDriver` |
|------|-------------------|
| Motor + versión | `db_type()` + `execute` metadata query |
| Charset / Collation / SQL Mode | `execute` introspection (engine-specific) |
| Base de datos activa | `AppState` session |
| Usuario conectado | connection metadata |
| Tablas relevantes | `fetch_tables` |
| Columnas | `fetch_columns` (filtrado por relevancia) |
| Relaciones (FK) | `fetch_foreign_keys` |
| Índices | `fetch_indexes` |
| Vistas / Procedimientos / Triggers | `fetch_views` / `fetch_procedures` / `fetch_triggers` |
| Estadísticas (filas, tamaño) | `fetch_rows` count / introspection |

### Reglas
- **Solo se envía el contexto relacionado con la consulta** — recorte por tablas mencionadas y sus FKs adyacentes
- Caché en memoria por `connection_id` con invalidación ante cambios de esquema (Schema Engine)
- Preserva engine fidelity: el contexto de PostgreSQL ≠ MySQL — no normalizar

---

## Módulo 3 – Schema Engine

### Objetivo
Mantener una representación interna cacheada del esquema.

### Path
`application/assistant/context/schema_engine.rs`

### Funciones
- Obtener tablas, columnas, FKs, índices, procedimientos, vistas, triggers (delegando a `DbDriver`)
- Detectar cambios del esquema (hash.lazy compare)
- Mantener caché en `AppState` por `connection_id`
- Invalidar caché cuando el explorador o el query editor detectan DDL

### Nota
No duplica `DbDriver` — es una **capa de caché + recorte** encima del trait. El driver sigue siendo la fuente de verdad.

---

## Módulo 4 – Prompt Builder

### Objetivo
Construye el prompt definitivo combinando: contexto de conexión, esquema relevante, historial reciente, preferencias del usuario, aprendizajes anteriores y ejemplos exitosos.

### Path
`application/assistant/prompt/prompt_builder.rs`

### Salida
Un `AiRequest` (system + messages + tools) listo para el `AiAdapter`. El usuario nunca ve este proceso.

### Reglas de seguridad
- **Nunca incluir credenciales** en el prompt (connection strings, passwords, SSH keys)
- Identificadores quotizados per engine en el esquema serializado
- Tamaño acotado (`max_context_tokens`) — truncado inteligente de tablas irrelevantes

---

## Módulo 5 – Learning Engine

### Objetivo
El componente más importante. El asistente aprende continuamente de cada interacción validada.

### Path
`application/assistant/learning/learning_engine.rs`

### Flujo
```
Usuario pregunta
   ↓
IA responde (o Knowledge Engine reutiliza)
   ↓
Usuario ejecuta consulta
   ↓
Usuario califica
   ├── 👍 → Guardar como caso exitoso (Knowledge Base)
   └── 👎 → Solicitar nueva generación
              ↓
            Comparar propuesta anterior
              ↓
            Usuario acepta versión correcta
              ↓
            Guardar caso exitoso + caso rechazado (con causa)
```

### Tabla de persistencia (nueva, en `storage.rs`)
```sql
CREATE TABLE IF NOT EXISTS assistant_knowledge (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,           -- pregunta normalizada
    question_hash TEXT NOT NULL,      -- hash para búsqueda exacta
    sql_text TEXT NOT NULL,           -- consulta validada
    engine TEXT NOT NULL,             -- postgres | mysql | ...
    schema_signature TEXT,            -- hash del esquema usado (para invalidar si cambió)
    provider TEXT,                    -- openai | claude | ...
    model TEXT,
    rating TEXT NOT NULL,             -- positive | negative
    rejection_reason TEXT,            -- solo si rating = negative
    accepted_sql TEXT,                -- versión final aceptada (para casos rechazados)
    connection_id TEXT,
    created_at INTEGER NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_knowledge_engine_question
    ON assistant_knowledge(engine, question_hash);
```

### Casos exitosos
Cada respuesta 👍 alimenta la base de conocimiento. La próxima vez se reutiliza **antes** de consultar la IA (Knowledge Engine).

### Casos rechazados
Un 👎 **no elimina** el caso — se marca como incorrecto, se almacena la causa y se evita repetir esa solución en futuras generaciones para el mismo patrón.

---

## Módulo 6 – Memory Engine

### Objetivo
Recordar el contexto de la conversación activa (multi-turno).

### Path
`application/assistant/learning/memory_engine.rs`

### Comportamiento
```
Usuario: "optimiza la consulta"
Usuario: "agrega índices"
Usuario: "genera la migración"
```
No requiere volver a explicar el contexto. El `MemoryEngine` mantiene una **ventana deslizante** de mensajes (`AssistantMessage` ya persistidos en `assistant_messages`) y los inyecta en el `PromptBuilder`.

### Reglas
- Ventana configurable (default: últimos 10 mensajes)
- Los mensajes viejos se resumen/comprimen si exceden `max_context_tokens`
- Scope por `connection_id` — además por sesión de chat

---

## Módulo 7 – Knowledge Engine

### Objetivo
Antes de consultar la IA, buscar casos similares validados.

### Path
`application/assistant/knowledge/knowledge_engine.rs`

### Algoritmo
```
Pregunta nueva
   ↓
Normalizar pregunta (lowercase, strip acentos, stop words)
   ↓
Buscar en assistant_knowledge
   ├── MATCH exacto (question_hash) y rating='positive' → REUTILIZAR
   ├── MATCH similar (LIKE / trigram) con score > umbral → SUGERIR (confirmar)
   └── Sin match → CONSULTAR IA
```

### Base existente a reusar
- `storage.rs:1477` `search_similar_queries` ya hace LIKE search en `query_history` — **extender** el mismo patrón para `assistant_knowledge`
- Para fuzzy matching más avanzado, evaluar `trigram` crate o SQL `LIKE`/`SIMILAR TO` por engine (preservando engine fidelity)

### Beneficio
Reduce costos (tokens) y aumenta precisión. Con el tiempo el sistema responde más desde conocimiento local y menos desde la IA.

---

## Módulo 8 – Sistema de Feedback

### Objetivo
Cada respuesta del asistente tiene acciones en UI.

### Path UI
`frontend/src/components/assistant/panels/QueriesPanel.tsx` (extender)

### Acciones por respuesta
| Acción | Comportamiento |
|--------|----------------|
| 👍 Correcta | Llama a `assistant_record_case(rating='positive')` |
| 👎 Incorrecta | Abre dialog de motivo → `assistant_record_case(rating='negative', rejection_reason)` → dispara nueva generación evitando la solución previa |
| 📋 Copiar | Sin persistencia |
| ▶ Ejecutar | Abre en Query Editor (existente via `updateTabQuery`) |
| 💾 Guardar | Marca como favorito en `assistant_knowledge` |
| 📌 Favorito | Tag para acceso rápido en la Biblioteca de Casos |

### Flujo Dislike (respetando proceso del plan original)
1. Registrar el motivo (UI dialog)
2. Mantener el contexto (MemoryEngine)
3. Generar una nueva respuesta (PromptBuilder incluye "evitar solución previa X")
4. Evitar repetir la misma solución (tag del caso rechazado)
5. Comparar con respuestas anteriores (Knowledge Engine)
6. Aprender de la respuesta finalmente aceptada → caso exitoso

---

## Módulo 9 – Biblioteca de Casos

### Objetivo
Toketeo construye una biblioteca propia de casos validados categorizados.

### Path UI
Nuevo panel `frontend/src/components/assistant/panels/LibraryPanel.tsx` (+ pestaña en `AssistantLayout`)

### Categorías (crecen automáticamente con tags del Knowledge Engine)
```
Consultas SQL · Procedimientos · Migraciones · Optimización ·
Índices · Backups · Particiones · JSON · CTE · Window Functions · Triggers
```

### Fuente
Tabla `assistant_knowledge` (rating='positive') agrupada por tag derivado del `question`/`accepted_sql`.

---

## Módulo 10 – Tool Engine

### Objetivo
Herramientas ejecutadas por **Toketeo (Rust)**. La IA propone usarlas; Rust ejecuta y devuelve el resultado.

### Path
`application/assistant/tools/`

### Diseño
```rust
// application/assistant/tools/mod.rs
#[async_trait]
pub trait AssistantTool: Send + Sync {
    fn name(&self) -> &str;
    fn descriptor(&self) -> ToolDescriptor;   // lo que se envía al modelo
    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> AppResult<ToolResult>;
}
```

### Herramientas (mapeadas a capacidades existentes)
| Herramienta | Reutiliza | Path |
|-------------|-----------|------|
| Obtener esquema | `DbDriver::fetch_*` | `tools/schema_tool.rs` |
| Obtener índices | `DbDriver::fetch_indexes` | `tools/index_tool.rs` |
| Ejecutar EXPLAIN | `DbDriver::execute` | `tools/explain_tool.rs` |
| Comparar bases | `application/compare/` | `tools/compare_tool.rs` |
| Comparar datos | `application/compare/` | `tools/data_compare_tool.rs` |
| Crear backup | `application/explorer_service` | `tools/backup_tool.rs` |
| Exportar resultados | query export existente | `tools/export_tool.rs` |
| Generar código | `sql_generator_service` / `model_generator_service` | `tools/codegen_tool.rs` |

### Regla crítica
La IA **solicita** tools vía `tool_calls` en `AiResponse` → el `AssistantService` valida, ejecuta vía Rust, y devuelve el `ToolResult` al modelo en el siguiente turno. **Nunca** se ejecuta SQL del modelo directamente sin pasar por `DbDriver` con prepared statements.

---

## Módulo 11 – Historial Inteligente

### Objetivo
El historial combina conversaciones + métricas de ejecución.

### Path
`application/assistant/history/history_engine.rs`

### Persistencia existente a reusar
- `assistant_messages` (conversación) — ✅
- `query_history` (consultas ejecutadas: query, duration, status, error, row_count) — ✅

### Extensiones (migraciones en `storage.rs`)
```sql
ALTER TABLE assistant_messages ADD COLUMN accepted_sql TEXT;
ALTER TABLE assistant_messages ADD COLUMN rejection_reason TEXT;
ALTER TABLE assistant_messages ADD COLUMN tool_used TEXT;
```

### Datos registrados
Consultas ejecutadas, modificadas, favoritas, exitosas, rechazadas, tiempo de ejecución, errores. Base para recomendaciones futuras.

---

## Módulo 12 – Personalización

### Objetivo
El asistente aprende preferencias del usuario.

### Path
`application/assistant/learning/preferences.rs`

### Tabla (nueva, en `storage.rs`)
```sql
CREATE TABLE IF NOT EXISTS assistant_preferences (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,         -- p.ej. "prefer_explicit_joins"
    value TEXT NOT NULL,              -- "true" | "false" | "mariadb" | ...
    learned_from TEXT,                -- "feedback" | "explicit"
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### Preferencias de ejemplo (detectadas de feedback)
- Usar JOIN explícitos
- Evitar `SELECT *`
- Preferir CTE
- SQL compatible con MariaDB
- Evitar consultas destructivas

### Aplicación
El `PromptBuilder` inyecta las preferencias activas en el `system` prompt.

---

## Módulo 13 – Seguridad

### Operational safety (UI)
Nunca ejecutar automáticamente operaciones destructivas: `DELETE`, `UPDATE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `RESTORE`. Siempre requerir **confirmación explícita** en UI.

Las `SELECT` pueden ejecutarse directamente si el usuario lo configura (flag en `AssistantConfig`).

### Secretos y credenciales (alineado a `agents/core/security.md`)
- **API keys de proveedores de IA** nunca en frontend ni en logs — almacenadas en OS keyring (`infrastructure/crypto.rs` + keyring crate) o en `storage.rs` **encriptadas** (texto nunca plaintext)
- **Credenciales de DB** nunca se incluyen en prompts al modelo
- **Frontend es hostil** — toda validación de inputs en `assistant_commands.rs` (IPC boundary)
- El `Tool Engine` valida argumentos antes de ejecutar cualquier tool
- Toda ejecución SQL vía `DbDriver` con prepared statements —蜿a concatenación dinámica desde input del modelo

### Detección de operaciones destructivas
`application/assistant/tools/safety.rs` — parser del SQL propuesto por el modelo que clasifica la operación. Si es destructiva → el comando returnedea `RequiresConfirmation` y la UI muestra un modal.

---

## Comandos Tauri (nuevos)

Agregar en `presentation/tauri/assistant_commands.rs` (o extender `commands.rs`) y registrar en `lib.rs invoke_handler`.

```rust
// Configuration & providers
#[tauri::command]
pub async fn assistant_get_providers(state: State<'_, AppState>) -> AppResult<Vec<ProviderInfo>>;

#[tauri::command]
pub async fn assistant_save_provider_config(config: ProviderConfig, state: State<'_, AppState>) -> AppResult<()>;
//   ^ API key se enruta a keyring dentro de application — nunca llega a storage plaintext

#[tauri::command]
pub async fn assistant_test_provider(provider_id: String, state: State<'_, AppState>) -> AppResult<TestResult>;

// Chat
#[tauri::command]
pub async fn assistant_chat(
    connection_id: String,
    question: String,
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<AssistantTurn>;
//   Emite progreso via eventos tauri::Emitter si hay tool calls encadenados

#[tauri::command]
pub async fn assistant_cancel_turn(turn_id: String, state: State<'_, AppState>) -> AppResult<()>;

// Knowledge
#[tauri::command]
pub async fn assistant_search_knowledge(
    connection_id: String,
    query: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeCase>>;

#[tauri::command]
pub async fn assistant_record_case(
    turn_id: String,
    rating: String,             // "positive" | "negative"
    rejection_reason: Option<String>,
    accepted_sql: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()>;

// Tools
#[tauri::command]
pub async fn assistant_list_tools(state: State<'_, AppState>) -> AppResult<Vec<ToolDescriptor>>;

#[tauri::command]
pub async fn assistant_execute_tool(
    connection_id: String,
    tool_name: String,
    args: serde_json::Value,
    confirm_destructive: bool,
    state: State<'_, AppState>,
) -> AppResult<ToolResult>;
//   ^ Si la tool es destructiva y confirm_destructive=false → devuelve RequiresConfirmation

// History & preferences
#[tauri::command]
pub async fn assistant_get_preferences(state: State<'_, AppState>) -> AppResult<Vec<Preference>>;

#[tauri::command]
pub async fn assistant_set_preference(key: String, value: String, state: State<'_, AppState>) -> AppResult<()>;
```

**Existentes que se reusan sin cambios:** `save_assistant_messages`, `load_assistant_messages`, `clear_assistant_messages`, `update_assistant_feedback`, `search_similar_queries`.

---

## DTOs (`models/assistant.rs` nuevo)

Crear `src-tauri/src/models/assistant.rs` con tipos IPC y exportarlos desde `models/mod.rs`. Mantener ** paridad exacta** con `frontend/src/types/assistant.ts`.

```rust
pub struct AssistantTurn {
    pub turn_id: String,
    pub answer: String,
    pub sql: Option<String>,
    pub tool_used: Option<String>,
    pub source: String,           // "knowledge" | "ai:openai" | "ai:ollama" | ...
    pub requires_confirmation: bool,
    pub usage: Option<TokenUsage>,
}

pub struct ProviderInfo { /* id, name, requires_key, supports_tools */ }
pub struct KnowledgeCase { /* id, question, sql_text, engine, rating, used_count */ }
pub struct ToolResult { /* ok, data, requires_confirmation, message */ }
pub struct Preference { /* key, value */ }
```

`serde(rename_all = "camelCase")` consistente con el resto del códigobase.

---

## Frontend (mapeo por capa)

| Cambio | Path |
|--------|------|
| Reemplazar IA falsa en `QueriesPanel` | `panels/QueriesPanel.tsx` → invoca `assistant_chat` |
| Servicio thin | `services/assistant.service.ts` (nuevo) → wrapper de comandos |
| Tipos espejo Rust | `types/assistant.ts` (nuevo) |
| Provider settings UI | `pages/Settings.tsx` o nueva `ConnectionsProviderConfig` |
| Dislike dialog | `components/assistant/DislikeDialog.tsx` |
| Library panel | `components/assistant/panels/LibraryPanel.tsx` |
| Confirm modal (destructive) | `components/assistant/DestructiveConfirmModal.tsx` |
| `assistantStore` extensions | campos: `turnInProgress`, `activeProvider`, `preferences` |

**Regla:** el frontend es **presentacional** — ningún cálculo de similaridad, ningún prompt armado client-side, ningún regex SQL. Todo viaja al backend.

---

## Fases de Implementación

### Fase 0 — Limpieza (prerrequisito)
- Reemplazar `SYSTEM_RESPONSES` y los generators regex de `QueriesPanel.tsx` por stub que llame al backend (aún sin IA real, devuelve "configura un proveedor").

### Fase 1 — Infraestructura
| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 1.1 | Trait `AiAdapter` + `models/assistant.rs` | `adapters/mod.rs`, `models/assistant.rs` | ⏳ |
| 1.2 | Adapter OpenAI | `adapters/openai.rs` | ⏳ |
| 1.3 | Adapter Ollama | `adapters/ollama.rs` | ⏳ |
| 1.4 | `AssistantService` esqueleto + `assistant_commands.rs` | `application/assistant/`, `presentation/tauri/assistant_commands.rs` | ⏳ |
| 1.5 | Persistencia de providers (keyring para keys) | `storage.rs`, `infrastructure/crypto.rs` | ⏳ |
| 1.6 | `assistant.service.ts` + `types/assistant.ts` + Provider Settings UI | `frontend/src/services/`, `types/` | ⏳ |
| 1.7 | `QueriesPanel` conectado a `assistant_chat` (sin tools aún) | `panels/QueriesPanel.tsx` | ⏳ |

### Fase 2 — Contexto
| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 2.1 | `ContextBuilder` usando `DbDriver` | `context/context_builder.rs` | ⏳ |
| 2.2 | `SchemaEngine` (caché + invalidación) | `context/schema_engine.rs` | ⏳ |
| 2.3 | `PromptBuilder` (system + contexto + historial) | `prompt/prompt_builder.rs` | ⏳ |
| 2.4 | Recorte de relevancia (tablas mencionadas + FKs) | `context/relevance.rs` | ⏳ |

### Fase 3 — Aprendizaje
| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 3.1 | Tabla `assistant_knowledge` + storage methods | `storage.rs` | ⏳ |
| 3.2 | `KnowledgeEngine` (búsqueda exacta + similar) | `knowledge/knowledge_engine.rs` | ⏳ |
| 3.3 | `LearningEngine` (grabar casos 👍/👎) | `learning/learning_engine.rs` | ⏳ |
| 3.4 | `MemoryEngine` (ventana deslizante) | `learning/memory_engine.rs` | ⏳ |
| 3.5 | Feedback UI (dislike dialog + re-generación evitando previa) | `panels/QueriesPanel.tsx`, `DislikeDialog.tsx` | ⏳ |
| 3.6 | Tabla `assistant_preferences` + `Preferences` en prompt | `learning/preferences.rs` | ⏳ |

### Fase 4 — Herramientas
| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 4.1 | Trait `AssistantTool` + `ToolEngine` + safety classifier | `tools/mod.rs`, `tools/safety.rs` | ⏳ |
| 4.2 | Tools: schema, index, explain | `tools/schema_tool.rs`, `index_tool.rs`, `explain_tool.rs` | ⏳ |
| 4.3 | Tools: compare (reusa `application/compare/`) | `tools/compare_tool.rs`, `data_compare_tool.rs` | ⏳ |
| 4.4 | Tools: codegen (reusa `sql_generator_service`/`model_generator_service`) | `tools/codegen_tool.rs` | ⏳ |
| 4.5 | DestructiveConfirmModal UI | `DestructiveConfirmModal.tsx` | ⏳ |

### Fase 5 — Biblioteca & Historial inteligente
| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 5.1 | Migraciones `assistant_messages` (accepted_sql, rejection_reason, tool_used) | `storage.rs` | ⏳ |
| 5.2 | `HistoryEngine` (combinar messages + query_history) | `history/history_engine.rs` | ⏳ |
| 5.3 | `LibraryPanel` (categorías autom+ tokens desde knowledge) | `panels/LibraryPanel.tsx` | ⏳ |
| 5.4 | Favoritos UI | `panels/QueriesPanel.tsx`, `LibraryPanel.tsx` | ⏳ |

### Fase 6 — Proveedores adicionales & Automatización
| # | Tarea | Estado |
|---|-------|--------|
| 6.1 | Adapter Claude, Gemini, DeepSeek | ⏳ |
| 6.2 | Tools: backup, export | ⏳ |
| 6.3 | Recomendaciones desde historial (e.g. "sueles tener tablas sin índice en FK") | ⏳ |
| 6.4 | Auto-esquema sugerido (CREATE TABLE destino desde origen, dialecto target) | ⏳ |

---

## Orden de Implementación Sugerido

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6
```

| Fase | Estimación | Bloquea a |
|------|------------|-----------|
| Fase 0 | 0.5 días | Fase 1 |
| Fase 1 | 5-6 días | Fase 2, 3, 4 |
| Fase 2 | 4 días | Fase 3 |
| Fase 3 | 5 días | Fase 4 (dislike flow) |
| Fase 4 | 4-5 días | Fase 6 |
| Fase 5 | 2-3 días | — |
| Fase 6 | 3-4 días | — |

**Total estimado: ~24-29 días hábiles.**

---

## Dependencias Existentes que se Reusan

| Componente | Fuente | Uso en asistente |
|------------|--------|------------------|
| `DbDriver::fetch_*` | `db/mod.rs` | Context Builder, Schema Engine |
| `application/compare/` | `application/compare/` | Tool: comparar esquemas/datos |
| `application/explorer_service` | `application/explorer_service.rs` | Tool: backup |
| `sql_generator_service` / `model_generator_service` | `application/` | Tool: codegen |
| `storage.rs` SQLite | `storage.rs` | Persistencia (knowledge, preferences, messages) |
| `infrastructure/crypto.rs` + keyring | `infrastructure/crypto.rs` | API keys encriptadas |
| `search_similar_queries` | `storage.rs:1477` | Patrón para Knowledge Engine |
| `assistant_messages` + commands | `commands.rs:2170` | Reusado sin cambios |
| `FeatureGate` (gamification) | `components/gamification/` | Access control a paneles (`ai_assistant` perk) |
| `query_history` | `storage.rs:284` | History Engine |
| `query_editor` (`updateTabQuery`) | `store/useAppStore` | Action "Open in Editor" |

---

## Notas de Implementación

### Proceso por cambio (AGENTS.md)
Cada tarea numerada se ejecuta con el flujo **Analyze → Plan → List files → Wait approval → One change → Stop**, una solicitud por submit.

### DTO Parity
Cada cambio en `models/assistant.rs` → actualizar `frontend/src/types/assistant.ts` en el mismo changeset.

### Verificación (antes de cerrar cada fase)
```bash
cd src-tauri && cargo check --lib
cd frontend && bun run lint && npx tsc --noEmit
```

### Consideraciones de performance
- Context Builder: cache por `connection_id` — evitar N+1 metadata en cada turno
- Knowledge Engine: índice `(engine, question_hash)` + límite de resultados
- Memory Engine: ventana acotada, resumir mensajes viejos solo si exceden tokens
- Tools: timeouts configurables por tool
- Llamadas al modelo: timeout total + cancelación vía `assistant_cancel_turn`

### Engine fidelity
El contexto enviado al modelo preserva el dialecto del motor activo. No se normaliza PostgreSQL ↔ MySQL. Los tools generan SQL en el dialecto target (el script generator ya es engine-specific en `application/compare/`).

### Seguridad
- API keys en keyring o encriptadas en `storage.rs`
- Cero credenciales de DB en prompts
- Validación en IPC boundary (`assistant_commands.rs`)
- Tools destructivas: `RequiresConfirmation` → modal en UI
- Logs estructurados sin secrets (ver `agents/core/security.md`)

### Proceso por cambio (AGENTS.md)
Cada cambio sigue: **Analyze → Plan → List files → Wait approval → One change → Stop**.

---

## Objetivo Final

El asistente de Toketeo no será un simple chat conectado a un proveedor de IA. Será un **sistema de conocimiento** en Rust que combina el contexto de la base de datos (vía `DbDriver`), el historial de uso, las preferencias del usuario y un mecanismo de aprendizaje continuo para ofrecer respuestas cada vez más precisas. Cada interacción validada enriquece su base de conocimiento (SQLite local), reduciendo la dependencia del modelo de IA, disminuyendo el consumo de tokens y aumentando la calidad de las sugerencias con el paso del tiempo.

La inteligencia está en Toketeo. El modelo solo interpreta lo que Toketeo aún no sabe.