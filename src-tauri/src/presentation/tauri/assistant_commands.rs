use crate::application::assistant::adapters::create_adapter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::orchestrator::ChatOrchestrator;
use crate::application::assistant::sql_fixer::SqlFixer;
use crate::application::assistant::tools::recommendation_engine::RecommendationEngine;
use crate::error::AppResult;
use crate::models::assistant::{
    AssistantTurn, KnowledgeCase, ModelInfo, Preference, ProviderConfig, ProviderInfo, SqlFixResult,
    TestResult, ToolDescriptor, ToolResult,
};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn assistant_get_providers() -> AppResult<Vec<ProviderInfo>> {
    Ok(vec![
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            requires_key: true,
            supports_tools: true,
        },
        ProviderInfo {
            id: "claude".to_string(),
            name: "Claude (Anthropic)".to_string(),
            requires_key: true,
            supports_tools: true,
        },
        ProviderInfo {
            id: "gemini".to_string(),
            name: "Google Gemini".to_string(),
            requires_key: true,
            supports_tools: false,
        },
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            requires_key: true,
            supports_tools: true,
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            requires_key: false,
            supports_tools: false,
        },
        ProviderInfo {
            id: "opencode".to_string(),
            name: "OpenCode".to_string(),
            requires_key: true,
            supports_tools: true,
        },
    ])
}

#[tauri::command]
pub async fn assistant_get_models(
    _provider_id: String,
    config: ProviderConfig,
) -> AppResult<Vec<ModelInfo>> {
    let adapter = create_adapter(&config)?;
    adapter.list_models().await
}

#[tauri::command]
pub async fn assistant_test_provider(config: ProviderConfig) -> AppResult<TestResult> {
    let start = std::time::Instant::now();

    let adapter = create_adapter(&config)?;
    match adapter.list_models().await {
        Ok(models) => Ok(TestResult {
            ok: true,
            message: format!("Connected. {} model(s) available.", models.len()),
            latency_ms: Some(start.elapsed().as_millis() as u64),
        }),
        Err(e) => Ok(TestResult {
            ok: false,
            message: e.to_string(),
            latency_ms: Some(start.elapsed().as_millis() as u64),
        }),
    }
}

// ── Provider config persistence ──

#[tauri::command]
pub async fn assistant_save_provider_config(
    config: ProviderConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    state.storage.save_provider_config(&config).await
}

#[tauri::command]
pub async fn assistant_get_provider_configs(
    state: State<'_, AppState>,
) -> AppResult<Vec<ProviderConfig>> {
    state.storage.load_provider_configs().await
}

#[tauri::command]
pub async fn assistant_get_provider_config(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Option<ProviderConfig>> {
    state.storage.get_provider_config_by_id(&id).await
}

#[tauri::command]
pub async fn assistant_delete_provider_config(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.storage.delete_provider_config(&id).await
}

// ── Chat ──

#[tauri::command]
pub async fn assistant_chat(
    connection_id: String,
    question: String,
    confirm_destructive: bool,
    state: State<'_, AppState>,
) -> AppResult<AssistantTurn> {
    let configs = state.storage.load_provider_configs().await?;
    let config = match configs.first() {
        Some(c) => c.clone(),
        None => {
            return Ok(AssistantTurn {
                turn_id: uuid::Uuid::new_v4().to_string(),
                answer: "No AI provider configured. Go to Settings → AI Providers to set one up."
                    .to_string(),
                sql: None,
                tool_used: None,
                source: "stub".to_string(),
                requires_confirmation: false,
                usage: None,
            })
        }
    };

    ChatOrchestrator::new(&state, &connection_id, &question, &config, confirm_destructive)
        .run()
        .await
}

/// Ask the assistant to fix a failing SQL query using the DB error message.
#[tauri::command]
pub async fn assistant_fix_sql(
    connection_id: String,
    sql: String,
    error: String,
    state: State<'_, AppState>,
) -> AppResult<SqlFixResult> {
    let configs = state.storage.load_provider_configs().await?;
    let config = match configs.first() {
        Some(c) => c.clone(),
        None => {
            return Ok(SqlFixResult {
                sql: None,
                alternatives: vec![],
                explanation: "No AI provider configured. Go to Settings → AI Providers to set one up."
                    .to_string(),
                status: "unconfigured".to_string(),
            })
        }
    };

    SqlFixer::new(&state, &connection_id, &sql, &error, &config)
        .run()
        .await
}

// ── Knowledge ──

#[tauri::command]
pub async fn assistant_search_knowledge(
    query: String,
    engine: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeCase>> {
    KnowledgeEngine::search(&state.storage, &query, &engine, limit.unwrap_or(5)).await
}

#[tauri::command]
pub async fn assistant_list_knowledge(
    engine: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeCase>> {
    state.storage.list_knowledge_all(&engine, limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn assistant_toggle_knowledge_favorite(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    state.storage.toggle_knowledge_favorite(&id).await
}

#[tauri::command]
pub async fn assistant_record_case(
    question: String,
    sql_text: String,
    engine: String,
    rating: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    KnowledgeEngine::record_case(&state.storage, &question, &sql_text, &engine, &rating).await
}

// ── Feedback ──

#[tauri::command]
pub async fn assistant_record_feedback(
    message_id: String,
    connection_id: String,
    rating: String,
    engine: String,
    rejection_reason: Option<String>,
    accepted_sql: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    match rating.as_str() {
        "positive" => {
            crate::application::assistant::learning::LearningEngine::record_positive(
                &state.storage,
                &message_id,
                &connection_id,
                &engine,
            )
            .await
        }
        "negative" => {
            crate::application::assistant::learning::LearningEngine::record_negative(
                &state.storage,
                &message_id,
                &connection_id,
                &engine,
                rejection_reason.as_deref(),
                accepted_sql.as_deref(),
            )
            .await
        }
        _ => Err(crate::error::AppError::Internal(format!("Unknown rating: {rating}"))),
    }
}

// ── Preferences ──

#[tauri::command]
pub async fn assistant_get_preferences(
    state: State<'_, AppState>,
) -> AppResult<Vec<Preference>> {
    state.storage.get_preferences().await
}

#[tauri::command]
pub async fn assistant_set_preference(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.storage.set_preference(&key, &value).await
}

// ── Tools ──

#[tauri::command]
pub async fn assistant_list_tools(state: State<'_, AppState>) -> AppResult<Vec<ToolDescriptor>> {
    Ok(state.tool_engine.list_tools())
}

#[tauri::command]
pub async fn assistant_execute_tool(
    connection_id: String,
    tool_name: String,
    args: serde_json::Value,
    confirm_destructive: bool,
    state: State<'_, AppState>,
) -> AppResult<ToolResult> {
    let driver = if connection_id.is_empty() {
        None
    } else {
        match state.get_connection(&connection_id).await {
            Ok(d) => Some(d),
            Err(_) => None,
        }
    };

    state
        .tool_engine
        .execute_with_confirmation(
            &tool_name,
            args,
            driver.as_deref(),
            &state,
            confirm_destructive,
        )
        .await
}

#[tauri::command]
pub async fn assistant_get_recommendations(
    connection_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let messages = state
        .storage
        .load_assistant_messages(&connection_id)
        .await?;
    let history = state
        .storage
        .load_query_history(&connection_id, 100)
        .await?;
    let cases = state
        .storage
        .list_knowledge_global(200)
        .await?;

    Ok(RecommendationEngine::analyze(&messages, &history, &cases))
}
