use crate::application::assistant::adapters::ollama::OllamaAdapter;
use crate::application::assistant::adapters::openai::OpenAiAdapter;
use crate::application::assistant::adapters::AiAdapter;
use crate::application::assistant::context::relevance::RelevanceFilter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::learning::memory_engine::MemoryEngine;
use crate::application::assistant::prompt::prompt_builder::PromptBuilder;
use crate::error::AppResult;
use crate::models::assistant::{
    AiRequest, AssistantTurn, ChatMessage, KnowledgeCase, ModelInfo, Preference, ProviderConfig,
    ProviderInfo, TestResult, TokenUsage, ToolDescriptor, ToolResult,
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
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            requires_key: false,
            supports_tools: false,
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

    let driver = state.get_connection(&connection_id).await?;

    let db_type = driver.db_type();
    let db_name = match db_type {
        crate::db::DbType::Sqlite => Some("main"),
        _ => None,
    };

    let ctx = state
        .schema_engine
        .get_or_build(&connection_id, driver.as_ref(), db_name)
        .await?;

    let ctx = RelevanceFilter::filter(&ctx, &question);

    // Load conversation history
    let stored = state.storage.load_assistant_messages(&connection_id).await?;
    let history = MemoryEngine::build_history(&stored, 10);

    // Load user preferences
    let prefs = state.storage.get_preferences().await?;

    let adapter = create_adapter(&config)?;

    // Include available tool descriptions
    let tools = state.tool_engine.list_tools();

    let system_prompt = PromptBuilder::build_system_prompt(&ctx, &prefs);

    let user_message = ChatMessage {
        role: "user".to_string(),
        content: question.clone(),
    };

    let mut messages = history;
    messages.push(user_message);

    let request = AiRequest {
        system: system_prompt,
        messages,
        tools: tools,
        temperature: 0.3,
        max_tokens: Some(4096),
    };

    // Save the user message to history
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    let _ = state
        .storage
        .save_assistant_messages(&[crate::models::AssistantMessage {
            id: user_msg_id.clone(),
            role: "user".to_string(),
            content: question,
            sql: None,
            is_safe_delete: None,
            feedback: None,
            timestamp: chrono::Utc::now().timestamp(),
            connection_id: Some(connection_id.clone()),
        }])
        .await;

    let turn_id = uuid::Uuid::new_v4().to_string();
    let source = format!("ai:{}", config.provider_id);

    match adapter.complete(request).await {
        Ok(response) => {
            // Save the assistant response to history
            let _ = state
                .storage
                .save_assistant_messages(&[crate::models::AssistantMessage {
                    id: turn_id.clone(),
                    role: "assistant".to_string(),
                    content: response.content.clone(),
                    sql: None,
                    is_safe_delete: None,
                    feedback: None,
                    timestamp: chrono::Utc::now().timestamp(),
                    connection_id: Some(connection_id),
                }])
                .await;

            Ok(AssistantTurn {
                turn_id,
                answer: response.content,
                sql: None,
                tool_used: None,
                source,
                requires_confirmation: false,
                usage: Some(TokenUsage {
                    prompt_tokens: response.usage.prompt_tokens,
                    completion_tokens: response.usage.completion_tokens,
                    total_tokens: response.usage.total_tokens,
                }),
            })
        }
        Err(e) => Ok(AssistantTurn {
            turn_id,
            answer: format!("Error: {}", e),
            sql: None,
            tool_used: None,
            source: "error".to_string(),
            requires_confirmation: false,
            usage: None,
        }),
    }
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

fn create_adapter(config: &ProviderConfig) -> AppResult<Box<dyn AiAdapter>> {
    match config.provider_id.as_str() {
        "openai" => Ok(Box::new(OpenAiAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "ollama" => Ok(Box::new(OllamaAdapter::new(
            config.model.clone(),
            config.base_url.clone(),
        ))),
        other => Err(crate::error::AppError::Internal(format!(
            "Unknown provider: {other}"
        ))),
    }
}
