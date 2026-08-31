use crate::application::assistant::adapters::create_adapter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::orchestrator::ChatOrchestrator;
use crate::application::assistant::sql_fixer::SqlFixer;
use crate::application::assistant::tools::recommendation_engine::RecommendationEngine;
use crate::error::AppResult;
use crate::models::assistant::{
    AssistantTurn, KnowledgeCase, ModelInfo, Preference, ProviderConfig, ProviderInfo,
    SqlFixResult, TestResult, ToolDescriptor, ToolResult, UiContext,
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

#[tauri::command]
pub async fn assistant_chat(
    connection_id: String,
    question: String,
    confirm_destructive: bool,
    ui_context: Option<UiContext>,
    on_event: tauri::ipc::Channel<serde_json::Value>,
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
                action: None,
            })
        }
    };

    let emitter = move |value: serde_json::Value| {
        let _ = on_event.send(value);
    };

    ChatOrchestrator::new(
        &state,
        &connection_id,
        &question,
        &config,
        confirm_destructive,
        ui_context.as_ref(),
        Some(&emitter),
    )
    .run()
    .await
}

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
                explanation:
                    "No AI provider configured. Go to Settings → AI Providers to set one up."
                        .to_string(),
                status: "unconfigured".to_string(),
            })
        }
    };

    SqlFixer::new(&state, &connection_id, &sql, &error, &config)
        .run()
        .await
}

#[tauri::command]
pub async fn assistant_search_knowledge(
    query: String,
    engine: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeCase>> {
    KnowledgeEngine::search(
        &state.storage,
        &query,
        engine.as_deref(),
        limit.unwrap_or(50),
    )
    .await
}

#[tauri::command]
pub async fn assistant_list_knowledge(
    engine: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeCase>> {
    state
        .storage
        .list_knowledge_all(engine.as_deref(), limit.unwrap_or(200))
        .await
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
    let id = KnowledgeEngine::record_case(&state.storage, &question, &sql_text, &engine, &rating)
        .await?;

    if let Some(case) = state.storage.get_knowledge_case(&id).await.ok().flatten() {
        AppState::spawn_index_knowledge(&state.storage, &state.knowledge_vectors, case);
    }
    Ok(id)
}

#[tauri::command]
pub async fn assistant_record_error(
    error: String,
    context: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<(String, bool)> {
    let (id, created) = KnowledgeEngine::record_error_case(
        &state.storage,
        &error,
        context.as_deref().unwrap_or(""),
    )
    .await?;
    if created {
        if let Ok(Some(case)) = state.storage.get_knowledge_case(&id).await {
            AppState::spawn_index_knowledge(&state.storage, &state.knowledge_vectors, case);
        }
    }
    Ok((id, created))
}

#[tauri::command]
pub async fn assistant_knowledge_index_stats(state: State<'_, AppState>) -> AppResult<(i64, i64)> {
    state.storage.knowledge_index_stats().await
}

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
                &state,
                &message_id,
                &connection_id,
                &engine,
            )
            .await
        }
        "negative" => {
            crate::application::assistant::learning::LearningEngine::record_negative(
                &state,
                &message_id,
                &connection_id,
                &engine,
                rejection_reason.as_deref(),
                accepted_sql.as_deref(),
            )
            .await
        }
        _ => Err(crate::error::AppError::Internal(format!(
            "Unknown rating: {rating}"
        ))),
    }
}

#[tauri::command]
pub async fn assistant_get_preferences(state: State<'_, AppState>) -> AppResult<Vec<Preference>> {
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
        state.get_connection(&connection_id).await.ok()
    };

    state
        .tool_engine
        .execute_with_confirmation(
            &tool_name,
            args,
            driver.as_deref(),
            &state,
            confirm_destructive,
            Some(&connection_id),
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
    let cases = state.storage.list_knowledge_global(200).await?;

    Ok(RecommendationEngine::analyze(&messages, &history, &cases))
}
