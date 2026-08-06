# Architecture Reference: Intelligent Assistant (Toketeo)

> **Purpose**: Single-source snapshot of the assistant module's internal architecture.
> Read this BEFORE touching any assistant file to avoid re-exploring the codebase.

Last updated: 2026-07-27 (after Phase 6 + OpenCode provider integration)

---

## 1. Module Map

```
src-tauri/src/application/assistant/
├── adapters/          — AiAdapter trait + 6 provider implementations
│   ├── mod.rs         — pub trait AiAdapter
│   ├── openai_format.rs — SHARED OpenAI-compat body builder + response parser (build_messages, build_tools, parse_response)
│   ├── openai.rs      — uses openai_format
│   ├── claude.rs      — Anthropic (/v1/messages, no tool orchestration yet)
│   ├── gemini.rs      — Google Gemini, supports_tools=false (declared)
│   ├── deepseek.rs    — uses openai_format
│   ├── ollama.rs      — Local Ollama (no key), supports_tools=false (declared)
│   └── opencode.rs    — OpenCode Zen API (uses openai_format)
├── context/
│   ├── SchemaEngine   — TTL cache of SchemaContext keyed by connection fingerprint
│   └── relevance      — RelevanceFilter::filter(ctx, question) prunes unrelated tables
├── prompt/
│   └── prompt_builder.rs — PromptBuilder::build_system_prompt(ctx, prefs) -> String
├── knowledge/
│   └── knowledge_engine.rs — search(), record_case(), find_similar()
├── learning/
│   └── memory_engine.rs    — build_history(), estimate_history_tokens()
├── history/
│   └── HistoryEngine       — timeline merge (assistant_messages + query_history)
├── tools/
│   ├── tool_engine.rs      — AssistantTool trait + ToolEngine + SafetyClassifier
│   ├── schema_tool, index_tool, explain_tool, compare_tool, data_compare_tool, codegen_tool
│   ├── backup_tool, export_tool, auto_schema_tool
│   └── recommendation_engine.rs — RecommendationEngine::analyze()
└── mod.rs
```

Frontend counterpart: `frontend/src/components/assistant/` + `frontend/src/services/assistant.service.ts` + `frontend/src/types/assistant.ts`.

---

## 2. Key Data Models (TypeScript mirror in `frontend/src/types/assistant.ts`)

### IPC DTOs (`src-tauri/src/models/assistant.rs`)

| Struct | Purpose | Notes |
|---|---|---|
| `AiRequest` | `{ system, messages, tools, temperature, max_tokens }` | Sent to `AiAdapter::complete` |
| `ChatMessage` | `{ role, content, tool_calls, tool_call_id }` | Units of conversation. `tool_calls` filled on assistant round-after-tool-request; `tool_call_id` on `role:"tool"` results. `#[derive(Default)]` so new fields are non-breaking. |
| `AiResponse` | `{ content, tool_calls, usage, model }` | Returned by adapters |
| `ToolCall` | `{ id, name, arguments }` | LLM-requested tool execution |
| `ToolDescriptor` | `{ name, description, parameters }` | Tool metadata sent in `AiRequest.tools` |
| `ToolResult` | `{ ok, data, requires_confirmation, message }` | Returned by `AssistantTool::execute` |
| `ProviderConfig` | `{ id?, provider_id, model?, api_key?, base_url? }` | Stored persistently |
| `ProviderInfo` | `{ id, name, requires_key, supports_tools }` | Static list from `assistant_get_providers` |
| `ModelInfo` | `{ id, name, provider, supports_tools }` | From `assistant_get_models` |
| `AssistantTurn` | `{ turn_id, answer, sql?, tool_used?, source, requires_confirmation, usage? }` | Returned by `assistant_chat` |
| `KnowledgeCase` | `{ id, question, sql_text, engine, rating, used_count, favorite }` | Stored in `assistant_knowledge` |
| `TestResult` | `{ ok, message, latency_ms? }` | From `assistant_test_provider` |
| `Preference` | `{ key, value }` | Stored in `assistant_preferences` |
| `SchemaContext` + sub-types | `{ db_type, version?, database?, tables[], views[], ... }` | Built by SchemaEngine |
| `SchemaFingerprint` | `{ table_names, view_names, table_hashes }` | TTL cache invalidation key |
| `TokenUsage` | `{ prompt_tokens, completion_tokens, total_tokens }` | |

### Persistence models (`src-tauri/src/models/mod.rs`)

- **`AssistantMessage`** (`models/mod.rs:218`): `{ id, role, content, sql?, is_safe_delete?, feedback?, accepted_sql?, rejection_reason?, tool_used?, timestamp, connection_id? }` — full chat log.
- **`QueryHistoryEntry`** (`models/mod.rs:234`): `{ id, query, connection_id, executed_at, duration_ms?, status, error?, row_count? }`.

---

## 3. SQLite Tables (`src-tauri/src/storage.rs`)

| Table | Schema (cols) | Methods on `Storage` |
|---|---|---|
| `assistant_providers` | `id, provider_id, model, api_key (legacy plaintext), api_key_enc, api_key_nonce, base_url, created_at, updated_at` | `save_provider_config` (encrypts), `load_provider_configs` (decrypts), `delete_provider_config`, `get_provider_config_by_id` (decrypts), `decrypt_provider_key` helper |
| `assistant_knowledge` | `id, question, sql_text, engine, rating, used_count, favorite, created_at` | `save_knowledge_case`, `search_knowledge(query, engine, limit)`, `list_knowledge_all(engine, limit)`, `list_knowledge_global(limit)`, `toggle_knowledge_favorite`, `delete_knowledge_case`, `increment_knowledge_used` |
| `assistant_preferences` | `key, value, updated_at` | `get_preferences`, `set_preference` |
| `assistant_messages` | `id, role, content, sql, is_safe_delete, feedback, accepted_sql, rejection_reason, tool_used, timestamp, connection_id` | `save_assistant_messages`, `load_assistant_messages(connection_id)`, `clear_assistant_messages` |
| `query_history` | `id, query, connection_id, executed_at, duration_ms, status, error, row_count` | `save_query_history`, `load_query_history(connection_id, limit)`, `clear_query_history`, `search_similar_queries` |

> **API keys are encrypted at rest** with AES-256-GCM using the master password. `api_key_enc` (base64 ciphertext) + `api_key_nonce` (base64 12-byte nonce) are populated on save; legacy `api_key` (plaintext) is kept for backwards-compat fallback only. When the session is locked, decryption returns `None` (the UI tolerates missing keys).

---

## 4. The Chat Pipeline (`assistant_chat` command)

**File**: `src-tauri/src/presentation/tauri/assistant_commands.rs:127`

```
assistant_chat(connection_id, question, state) -> AppResult<AssistantTurn>
│
├─ 1. Load first ProviderConfig (storage.load_provider_configs)
│      If none → return stub AssistantTurn.source="stub"
│      (ProviderConfig.api_key is decrypted on read — see §6.)
│
├─ 2. Resolve driver: state.get_connection(&connection_id) -> Arc<dyn DbDriver>
│
├─ 3. Build SchemaContext:
│      db_name = "main" if Sqlite else None
│      ctx = state.schema_engine.get_or_build(&connection_id, driver, db_name)
│      ctx = RelevanceFilter::filter(&ctx, &question)    // prune unrelated tables
│
├─ 4. Load conversation history:
│      stored  = storage.load_assistant_messages(&connection_id)
│      history = MemoryEngine::build_history(&stored, 10)   // last 10 turns
│
├─ 5. Load preferences: storage.get_preferences()
│
├─ 6. Build adapter: create_adapter(&config) -> Box<dyn AiAdapter>
│      tools   = state.tool_engine.list_tools()          // Vec<ToolDescriptor>
│      system  = PromptBuilder::build_system_prompt(&ctx, &prefs)
│
├─ 7. ┌── Knowledge-first retrieval ──
│      │ global_cases = storage.list_knowledge_global(500)
│      │ scored = KnowledgeEngine::find_similar_scored(&question, &global_cases, 0.5)
│      │ if some (case, score) has rating="positive" and score ≥ 0.9:
│      │     increment_knowledge_used(case.id)
│      │     persist user + assistant messages
│      │     return AssistantTurn { answer, sql: case.sql_text,
│      │                            source="knowledge", usage: None }
│      │ else:
│      │     append top-5 cases to `system` as "KNOWLEDGE LIBRARY ..."
│
├─ 8. Build initial messages: history + ChatMessage{ role:"user", content: question }
│      Persist the user message to `assistant_messages`
│
├─ 9. ┌── Tool-call orchestration loop (max 5 rounds) ──
│      │ request = AiRequest{ system, messages, tools, temp:0.3, max:4096 }
│      │ for round in 0..MAX_TOOL_ROUNDS:
│      │     resp = adapter.complete(request).await?
│      │     accumulate resp.usage into total_usage
│      │     if resp.tool_calls.is_empty(): break (resp becomes "last")
│      │     push ChatMessage{ role:"assistant", content, tool_calls:[...] }
│      │     for tc in resp.tool_calls:
│      │         result = tool_engine.execute_with_confirmation(
│      │             tc.name, tc.arguments, Some(&*driver), state, false)
│      │         push ChatMessage{ role:"tool", content: result_json,
│      │                            tool_call_id: tc.id }
│      │         remember tool_used = tc.name (first one wins)
│      │         set requires_confirmation if result.requires_confirmation
│      │ Loop end (last_response set after first non-empty round).
│
└─ 10. extract_sql_block(&resp.content) → Option<String>
        persist assistant message (with sql + tool_used)
        return AssistantTurn { answer, sql, tool_used, source="ai:<provider>",
                                requires_confirmation, usage }
```

**Implementation notes:**
- KnowledgeEngine::find_similar_scored returns `Vec<(&KnowledgeCase, f64)>`; plain `find_similar` just strips the score.
- Tool orchestration only runs for adapters that emit tool_calls (OpenAI / OpenCode / DeepSeek). Claude/Gemini return `tool_calls: vec![]` and exit on round 0 — graceful degradation.
- Destructive tools surface `requires_confirmation=true` in the returned AssistantTurn so the UI can confirm before re-execution via `assistant_execute_tool`.
- Token usage is accumulated across all tool-call rounds.
- `extract_sql_block` looks for the first `` ```sql `` fenced block in the answer so the UI can offer a "Run SQL" button even when the model returns prose + code.

---

## 5. Adapter Contract

**Trait**: `application/assistant/adapters/mod.rs`
```rust
#[async_trait]
pub trait AiAdapter: Send + Sync {
    fn id(&self) -> &str;
    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse>;
    async fn list_models(&self) -> AppResult<Vec<ModelInfo>>;
    fn supports_tools(&self) -> bool;
}
```

All 6 adapters expose `<Adapter>::new(api_key_or_args, model: Option<String>, base_url: Option<String>)` and use a `reqwest::Client`. OpenAI / DeepSeek / OpenCode / Grok / Qwen all speak the OpenAI-compatible `/chat/completions` format; Claude uses `/v1/messages`; Gemini uses `/v1beta/models/{model}:generateContent`.

**`create_adapter(config) -> AppResult<Box<dyn AiAdapter>>`** lives at the bottom of `assistant_commands.rs` — it is the single switchboard that maps `provider_id` to adapter instance. Any new provider must be added here AND in `assistant_get_providers`.

---

## 6. Crypto Infrastructure (for Phase 7 API-key encryption)

**File**: `src-tauri/src/infrastructure/crypto.rs` — AES-256-GCM + Argon2id.

| Function | Signature | Use |
|---|---|---|
| `crypto::encrypt` | `(plaintext: &str, key: &[u8;32]) -> Result<(Vec<u8>, [u8;12])>` | returns `(ciphertext, nonce)` |
| `crypto::decrypt` | `(ciphertext: &[u8], nonce: &[u8;12], key: &[u8;32]) -> Result<String>` | |
| `crypto::derive_key` | `(master_password: &str, salt: &[u8]) -> Result<[u8;32]>` | Argon2id KDF |
| `crypto::hash_password` / `verify_password` | Argon2-with-salt | master password verification |

**Master-key plumbing**:
- `Storage.master_key: RwLock<Option<[u8; 32]>>` (`storage.rs:17`)
- `AppState.master_key: RwLock<Option<[u8; 32]>>` (`state.rs`)
- `AppState::get_decryption_key() -> AppResult<[u8; 32]>` (`state.rs:144`) — returns `Unauthorized("Session locked")` if master_key is None. **Caller must be prepared** for the session to be locked.
- `AppState::set_master_key` / `clear_master_key` (`state.rs:152`, `:160`) — toggled by `unlock_master_password` / `lock_session` commands.
- Auth flow: `auth_service::unlock_master_password(password, storage)` derives key, verifies against stored Argon2 hash, then `state.set_master_key(key, timeout)`.

**Reference pattern** — how `ConnectionService` encrypts connection passwords today (`application/connection_service.rs:17`, `:54`):
```rust
fn encrypt_connection(config: &mut DbConnectionConfig, key: &[u8; 32]) -> AppResult<()> {
    if let Some(plaintext) = config.password.as_ref() {
        let (enc, nonce) = crypto::encrypt(plaintext, key)
            .map_err(AppError::Internal)?;
        config.password_enc = Some(base64::encode(&enc));
        config.password_nonce = Some(base64::encode(&nonce));
        config.password = None;                  // wipe plaintext
    }
    // ... same dance for ssh_json
}
```
Decoder mirrors: `crypto::decrypt(enc, &nonce, key)`. `Storage::update_connection_encrypted` persists the encrypted form; migration re-encrypts on master-password change (see `auth_service::change_master_password`).

The `assistant_providers` table needs the SAME treatment: add `api_key_enc` + `api_key_nonce` (both base64 TEXT, nullable) and wipe `api_key` to NULL after encryption. Backward-compat migration: if `api_key IS NOT NULL AND api_key_enc IS NULL`, encrypt on first save and null out `api_key`.

---

## 7. Tool Engine (`application/assistant/tools/tool_engine.rs`)

`AssistantTool` trait:
```rust
#[async_trait]
pub trait AssistantTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> serde_json::Value;  // OpenAI function-tool JSON schema
    fn is_destructive(&self) -> bool;
    async fn execute(&self, args: serde_json::Value,
                     driver: Option<&dyn DbDriver>,
                     state: &AppState) -> AppResult<ToolResult>;
}
```

9 tools registered in `AppState::init_tools` (`state.rs`): `schema`, `index`, `explain`, `compare_schema`, `compare_data`, `codegen`, `backup`, `export`, `auto_schema`.

Two execution paths:
- `ToolEngine::execute(name, args, driver, state)` — denies destructive tools with `requires_confirmation=true`.
- `ToolEngine::execute_with_confirmation(..., confirm_destructive:true)` — runs destructive tools after user consent.

`SafetyClassifier::is_destructive_query(sql)` classifies INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/RENAME/REPLACE/CALL.

---

## 8. Tauri Commands (registered in `lib.rs` invoke_handler)

All exported through `src-tauri/src/commands/mod.rs` as `pub use crate::presentation::tauri::assistant_commands::*;`.

| Command | Purpose |
|---|---|
| `assistant_chat` | Main chat entry (see §4) |
| `assistant_get_providers` | Static `Vec<ProviderInfo>` (6 providers) |
| `assistant_get_models` | Calls `adapter.list_models()` |
| `assistant_test_provider` | Pings provider, returns `TestResult` |
| `assistant_save_provider_config` / `_get_provider_configs` / `_get_provider_config` / `_delete_provider_config` | CRUD on `assistant_providers` |
| `assistant_search_knowledge` | `KnowledgeEngine::search` (LIKE) |
| `assistant_list_knowledge` | `storage::list_knowledge_all(engine, limit)` |
| `assistant_toggle_knowledge_favorite` | flip `favorite` flag |
| `assistant_record_case` | Insert KnowledgeCase |
| `assistant_record_feedback` | Insert LearningEngine case from thumbs |
| `assistant_get_preferences` / `assistant_set_preference` | preferences CRUD |
| `assistant_list_tools` | `tool_engine.list_tools()` for UI |
| `assistant_execute_tool` | manual tool run by name + args + `confirm_destructive` |
| `assistant_get_recommendations` | `RecommendationEngine::analyze(messages, history, cases)` |

Plus the existing pre-phase-1 commands: `save_assistant_messages`, `load_assistant_messages`, `clear_assistant_messages`, `update_assistant_feedback`, `save_query_history`, `load_query_history`, `clear_query_history`, `search_similar_queries`.

---

## 9. Frontend Touch Points

- **Service**: `frontend/src/services/assistant.service.ts` — thin `invoke` wrapper, one method per Tauri command.
- **Types**: `frontend/src/types/assistant.ts` — TypeScript mirrors of `models/assistant.rs` (camelCase via serde rename).
- **UI**: `frontend/src/components/assistant/`
  - `AssistantLayout.tsx` — tabbed layout (Chat / Library / ...)
  - `panels/QueriesPanel.tsx` — chat with thumbs-up/down feedback → `assistant_record_feedback`
  - `panels/LibraryPanel.tsx` — browse / search / favorite / copy SQL / open in editor
  - `ProviderSettings.tsx` — 6-provider config UI (PROVIDER_ICONS: openai=Sparkles, claude=BookOpen, gemini=Globe, deepseek=Bot, ollama=Cpu, opencode=Zap)
- **Store**: `frontend/src/store/assistantStore.ts` (Zustand) — messages, schemaCache, feedback, onboarding.
- **Feature flag**: ProviderSettings sits under `FeatureGate("ai_assistant")` on `SettingsPage`.

---

## 10. Phase 7 — DONE

All three refinements shipped in commit-able state:

1. **Knowledge-first retrieval** — `assistant_chat` short-circuits on a ≥0.9-word-overlap positive KnowledgeCase hit (returns `source="knowledge"`); otherwise injects top-5 similar cases into the system prompt as context.

2. **Tool-call orchestration loop** — bounded 5-round loop in `assistant_chat` that:
   - appends the assistant's tool-call message (`ChatMessage.tool_calls`) to the running `messages`,
   - executes each `tool_engine.execute_with_confirmation(name, args, Some(&*driver), &state, false)`,
   - appends `ChatMessage.role="tool"` with `tool_call_id` + JSON-serialized `ToolResult`,
   - accumulates `usage` across rounds and remembers `tool_used` + `requires_confirmation`.
   Reused across all OpenAI-compat providers via the shared `openai_format::build_messages` / `parse_response` helpers in `adapters/openai_format.rs`.

3. **API-key encryption** — new `api_key_enc` + `api_key_nonce` (base64) columns on `assistant_providers`; `save_provider_config` uses `crypto::encrypt` with `Storage::get_master_key()`, `load_provider_configs` / `get_provider_config_by_id` decrypt via the internal `decrypt_provider_key` helper. Session-locked reads return `api_key=None` (UI already tolerates). Master-password change should eventually re-encrypt rows (TODO: mirror `auth_service::change_master_password`), but for now old rows are preserved as plaintext fallback if decryption fails.

---

## 11. Quick Glossary

- **Provider** = an upstream AI company (OpenAI / Anthropic / Google / ...).
- **Adapter** = Rust impl of `AiAdapter` that translates `AiRequest` ↔ provider HTTP API.
- **Engine** = stateless service struct (`SchemaEngine`, `KnowledgeEngine`, `HistoryEngine`, `MemoryEngine`, `RecommendationEngine`).
- **Tool** = `AssistantTool` impl invoked by the LLM via JSON-schema function calls.
- **KnowledgeCase** = validated (question, sql) pair remembered for future reuse.
- **Turn** = one round-trip of `assistant_chat`; may contain one or more tool calls.

---

_End of reference. Keep this file in sync with any structural change to the assistant module._