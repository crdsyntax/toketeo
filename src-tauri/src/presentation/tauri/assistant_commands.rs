use crate::application::assistant::adapters::claude::ClaudeAdapter;
use crate::application::assistant::adapters::deepseek::DeepSeekAdapter;
use crate::application::assistant::adapters::gemini::GeminiAdapter;
use crate::application::assistant::adapters::ollama::OllamaAdapter;
use crate::application::assistant::adapters::opencode::OpenCodeAdapter;
use crate::application::assistant::adapters::openai::OpenAiAdapter;
use crate::application::assistant::adapters::AiAdapter;
use crate::application::assistant::context::relevance::RelevanceFilter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::learning::memory_engine::MemoryEngine;
use crate::application::assistant::prompt::prompt_builder::PromptBuilder;
use crate::application::assistant::tools::recommendation_engine::RecommendationEngine;
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

    let mut system_prompt = PromptBuilder::build_system_prompt(&ctx, &prefs);

    // ── Knowledge-first retrieval ──
    // Before calling the LLM, search the validated knowledge library for high-
    // confidence prior answers. If we find a near-exact match with a positive
    // rating, short-circuit and return the cached SQL (much faster, free, and
    // honours prior user feedback). Otherwise, inject the top candidates into
    // the system prompt so the model can reuse validated SQL.
    let global_cases = state
        .storage
        .list_knowledge_global(500)
        .await
        .unwrap_or_default();
    let scored = KnowledgeEngine::find_similar_scored(&question, &global_cases, 0.5);

    // Short-circuit on a very-high-confidence positive hit (≥ 0.9 word overlap).
    if let Some((case, score)) = scored
        .iter()
        .find(|(c, s)| c.rating == "positive" && *s >= 0.9)
    {
        let _ = state.storage.increment_knowledge_used(&case.id).await;
        let user_msg_id = uuid::Uuid::new_v4().to_string();
        let _ = state
            .storage
            .save_assistant_messages(&[crate::models::AssistantMessage {
                id: user_msg_id,
                role: "user".to_string(),
                content: question,
                sql: None,
                is_safe_delete: None,
                feedback: None,
                accepted_sql: None,
                rejection_reason: None,
                tool_used: None,
                timestamp: chrono::Utc::now().timestamp(),
                connection_id: Some(connection_id.clone()),
            }])
            .await;
        let turn_id = uuid::Uuid::new_v4().to_string();
        let answer = format!(
            "Based on a previously validated answer (reused from your knowledge library, score {score:.2}):\n\n```sql\n{}\n```",
            case.sql_text
        );
        let _ = state
            .storage
            .save_assistant_messages(&[crate::models::AssistantMessage {
                id: turn_id.clone(),
                role: "assistant".to_string(),
                content: answer.clone(),
                sql: Some(case.sql_text.clone()),
                is_safe_delete: None,
                feedback: None,
                accepted_sql: None,
                rejection_reason: None,
                tool_used: None,
                timestamp: chrono::Utc::now().timestamp(),
                connection_id: Some(connection_id.clone()),
            }])
            .await;
        return Ok(AssistantTurn {
            turn_id,
            answer,
            sql: Some(case.sql_text.clone()),
            tool_used: None,
            source: "knowledge".to_string(),
            requires_confirmation: false,
            usage: None,
        });
    }

    // Inject the top similar cases (capped at 5) as context for the model.
    if !scored.is_empty() {
        system_prompt.push_str(
            "\n\n=== KNOWLEDGE LIBRARY (validated QA pairs you may reuse) ===",
        );
        for (i, (case, score)) in scored.iter().take(5).enumerate() {
            system_prompt.push_str(&format!(
                "\n{}. Q: {}\n   SQL: {}\n   rating: {}, score: {:.2}, used: {}",
                i + 1,
                case.question,
                case.sql_text,
                case.rating,
                score,
                case.used_count,
            ));
        }
    }

    let user_message = ChatMessage {
        role: "user".to_string(),
        content: question.clone(),
        ..Default::default()
    };

    let mut messages = history;
    messages.push(user_message);

    // Save the user message to history
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    let _ = state
        .storage
        .save_assistant_messages(&[crate::models::AssistantMessage {
            id: user_msg_id.clone(),
            role: "user".to_string(),
            content: question.clone(),
            sql: None,
            is_safe_delete: None,
            feedback: None,
            accepted_sql: None,
            rejection_reason: None,
            tool_used: None,
            timestamp: chrono::Utc::now().timestamp(),
            connection_id: Some(connection_id.clone()),
        }])
        .await;

    let turn_id = uuid::Uuid::new_v4().to_string();
    let source = format!("ai:{}", config.provider_id);

    // ── Tool-call orchestration loop ──
    // Call the model. If it returns tool_calls, execute each one and feed the
    // results back to the model; repeat up to MAX_TOOL_ROUNDS times. The final
    // non-tool response is returned to the caller. Providers that don't return
    // tool calls (Claude/Gemini fall back here) simply exit on round 0.
    const MAX_TOOL_ROUNDS: usize = 5;
    let mut last_response: Option<crate::models::assistant::AiResponse> = None;
    let mut tool_used: Option<String> = None;
    let mut total_prompt = 0u32;
    let mut total_completion = 0u32;
    let mut requires_confirmation = false;

    for round in 0..MAX_TOOL_ROUNDS {
        let request = AiRequest {
            system: system_prompt.clone(),
            messages: messages.clone(),
            tools: tools.clone(),
            temperature: 0.3,
            max_tokens: Some(4096),
        };
        match adapter.complete(request).await {
            Ok(response) => {
                total_prompt = total_prompt.saturating_add(response.usage.prompt_tokens);
                total_completion =
                    total_completion.saturating_add(response.usage.completion_tokens);

                if response.tool_calls.is_empty() {
                    last_response = Some(response);
                    break;
                }

                // Model requested tool execution. Append its assistant message
                // (so the model later sees its own tool_calls) and a "tool"
                // role message per call result. For destructive tools the
                // engine returns requires_confirmation=true and we surface that
                // to the caller instead of executing blindly.
                let assistant_msg = ChatMessage {
                    role: "assistant".to_string(),
                    content: response.content.clone(),
                    tool_calls: response.tool_calls.clone(),
                    ..Default::default()
                };
                messages.push(assistant_msg);

                for tc in response.tool_calls.iter() {
                    let exec = state
                        .tool_engine
                        .execute_with_confirmation(
                            &tc.name,
                            tc.arguments.clone(),
                            Some(&*driver),
                            &state,
                            /*confirm_destructive=*/ false,
                        )
                        .await;
                    let result_text = match exec {
                        Ok(r) => {
                            if r.requires_confirmation {
                                requires_confirmation = true;
                            }
                            serde_json::to_string(&r).unwrap_or_else(|_| "{}".to_string())
                        }
                        Err(e) => serde_json::json!({
                            "ok": false,
                            "message": e.to_string(),
                            "requires_confirmation": false,
                            "data": null,
                        })
                        .to_string(),
                    };
                    if tool_used.is_none() {
                        tool_used = Some(tc.name.clone());
                    }
                    messages.push(ChatMessage {
                        role: "tool".to_string(),
                        content: result_text,
                        tool_call_id: Some(tc.id.clone()),
                        ..Default::default()
                    });
                }
            }
            Err(e) => {
                return Ok(AssistantTurn {
                    turn_id,
                    answer: format!("Error: {}", e),
                    sql: None,
                    tool_used: None,
                    source: "error".to_string(),
                    requires_confirmation: false,
                    usage: None,
                });
            }
        }
        let _ = round;
    }

    let response = last_response.unwrap_or_else(|| crate::models::assistant::AiResponse {
        content: "Tool orchestration exceeded the maximum number of rounds.".to_string(),
        tool_calls: vec![],
        usage: TokenUsage {
            prompt_tokens: total_prompt,
            completion_tokens: total_completion,
            total_tokens: total_prompt.saturating_add(total_completion),
        },
        model: config.model.clone().unwrap_or_default(),
    });

    // Try to extract a fenced ```sql block from the final answer so the UI can
    // surface a "Run SQL" affordance even outside of explicit tool responses.
    let sql = extract_sql_block(&response.content);

    // Save the assistant response to history
    let _ = state
        .storage
        .save_assistant_messages(&[crate::models::AssistantMessage {
            id: turn_id.clone(),
            role: "assistant".to_string(),
            content: response.content.clone(),
            sql: sql.clone(),
            is_safe_delete: None,
            feedback: None,
            accepted_sql: None,
            rejection_reason: None,
            tool_used: tool_used.clone(),
            timestamp: chrono::Utc::now().timestamp(),
            connection_id: Some(connection_id.clone()),
        }])
        .await;

    Ok(AssistantTurn {
        turn_id,
        answer: response.content,
        sql,
        tool_used,
        source,
        requires_confirmation,
        usage: Some(TokenUsage {
            prompt_tokens: total_prompt,
            completion_tokens: total_completion,
            total_tokens: total_prompt.saturating_add(total_completion),
        }),
    })
}

/// Extract the first ```sql fenced block from a markdown answer, returning the
/// raw SQL (without the fences). Returns `None` if no such block is found.
fn extract_sql_block(answer: &str) -> Option<String> {
    let opener = "```sql";
    let close = "```";
    let start = answer.to_lowercase().find(opener)?;
    let after_open = start + opener.len();
    let rest = &answer[after_open..];
    // Skip a trailing fence on the same line ("```sql\n") — find close fence.
    let end = rest.find(close)?;
    let sql = rest[..end].trim();
    if sql.is_empty() {
        None
    } else {
        Some(sql.to_string())
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

fn create_adapter(config: &ProviderConfig) -> AppResult<Box<dyn AiAdapter>> {
    match config.provider_id.as_str() {
        "openai" => Ok(Box::new(OpenAiAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "claude" => Ok(Box::new(ClaudeAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "gemini" => Ok(Box::new(GeminiAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "deepseek" => Ok(Box::new(DeepSeekAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "ollama" => Ok(Box::new(OllamaAdapter::new(
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "opencode" => Ok(Box::new(OpenCodeAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        other => Err(crate::error::AppError::Internal(format!(
            "Unknown provider: {other}"
        ))),
    }
}
