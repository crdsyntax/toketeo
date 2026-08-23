use crate::application::assistant::adapters::create_adapter;
use crate::application::assistant::context::relevance::RelevanceFilter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::learning::memory_engine::MemoryEngine;
use crate::application::assistant::prompt::prompt_builder::PromptBuilder;
use crate::application::assistant::tools::workspace_tool::render_ui_context_prompt;
use crate::error::AppResult;
use crate::models::assistant::{
    AiRequest, AiResponse, AssistantTurn, ChatMessage, SchemaContext, TokenUsage,
};
use crate::models::assistant::{ProviderConfig, UiContext};
use crate::state::AppState;

/// Orchestrates a single assistant chat turn: builds context (schema, history,
/// preferences), performs knowledge-first retrieval, then runs the tool-call
/// loop against the configured model. Kept in the application layer so the
/// Tauri command stays thin and the flow is unit-testable.
pub struct ChatOrchestrator<'a> {
    state: &'a AppState,
    connection_id: &'a str,
    question: &'a str,
    config: &'a ProviderConfig,
    confirm_destructive: bool,
    ui_context: Option<&'a UiContext>,
    events: Option<ChatEventEmitter<'a>>,
}

const MAX_TOOL_ROUNDS: usize = 12;

/// Retries for transient provider failures (5xx / 429 / network blips).
const PROVIDER_MAX_RETRIES: u32 = 2;

fn is_transient_provider_error(err: &crate::error::AppError) -> bool {
    let msg = err.to_string().to_lowercase();
    const MARKERS: [&str; 14] = [
        "500",
        "502",
        "503",
        "504",
        "429",
        "service unavailable",
        "bad gateway",
        "internal server error",
        "rate limit",
        "too many requests",
        "timed out",
        "timeout",
        "connection reset",
        "temporarily unavailable",
    ];
    MARKERS.iter().any(|m| msg.contains(m))
}

/// Call the provider with automatic retries on transient errors. Before each
/// retry the partially streamed content is wiped (`clear_content`) and a
/// status line tells the user what is happening — no more dead turns on 503.
async fn complete_with_retry(
    adapter: &dyn crate::application::assistant::adapters::AiAdapter,
    request: &AiRequest,
    on_delta: &(dyn Fn(&str) + Send + Sync),
    events: Option<ChatEventEmitter<'_>>,
) -> AppResult<AiResponse> {
    let mut attempt = 0u32;
    loop {
        match adapter.complete_streaming(request.clone(), on_delta).await {
            Ok(resp) => return Ok(resp),
            Err(e) if attempt < PROVIDER_MAX_RETRIES && is_transient_provider_error(&e) => {
                attempt += 1;
                if let Some(emit) = events {
                    emit(serde_json::json!({ "event": "clear_content" }));
                    emit(serde_json::json!({
                        "event": "status",
                        "message": format!(
                            "Proveedor no disponible ({e}); reintentando ({attempt}/{PROVIDER_MAX_RETRIES})…"
                        ),
                    }));
                }
                tokio::time::sleep(std::time::Duration::from_millis(800 * (1 << attempt))).await;
            }
            Err(e) => return Err(e),
        }
    }
}

#[cfg(test)]
mod dump_tests {
    #[test]
    fn transient_provider_errors_are_detected() {
        use crate::error::AppError;
        for msg in [
            "OpenCode returned 503 Service Unavailable: overloaded",
            "OpenAI returned 429: rate limit exceeded",
            "DeepSeek returned 502 Bad Gateway",
            "request timed out after 30s",
            "connection reset by peer",
        ] {
            assert!(
                super::is_transient_provider_error(&AppError::Internal(msg.to_string())),
                "should be transient: {msg}"
            );
        }
        for msg in [
            "Invalid API key (401)",
            "model not found",
            "Embedding parse failed: unexpected token",
        ] {
            assert!(
                !super::is_transient_provider_error(&AppError::Internal(msg.to_string())),
                "should NOT be transient: {msg}"
            );
        }
        // 500 contains "500" — but a 401 message must not match "40" patterns.
        assert!(super::is_transient_provider_error(&AppError::Internal(
            "provider returned 500: oops".into()
        )));
        assert!(!super::is_transient_provider_error(&AppError::Internal(
            "provider returned 400: bad request shape".into()
        )));
    }

    use super::strip_pseudo_tool_dump;

    #[test]
    fn clean_answer_passes_through() {
        let (cleaned, sql) = strip_pseudo_tool_dump("Respuesta normal del modelo.");
        assert_eq!(cleaned, "Respuesta normal del modelo.");
        assert!(sql.is_none());
    }

    #[test]
    fn pseudo_dump_is_stripped_and_sql_rescued() {
        let content = "Encontré 11 tablas derivadas. Ejecuto el conteo.\n\
                       Query\n\
                       connection_id\n\
                       5d692c53-ed8f-4fe4-a3bf-325354238c6d\n\
                       sql\n\
                       SELECT 'orders' AS tabla, COUNT(*) FROM orders;\n\
                       schema\n\
                       public\n\
                       confirm_destructive\n\
                       true";
        let (cleaned, sql) = strip_pseudo_tool_dump(content);
        assert_eq!(cleaned, "Encontré 11 tablas derivadas. Ejecuto el conteo.");
        let sql = sql.unwrap();
        assert!(sql.starts_with("SELECT 'orders'"));
        assert!(!sql.contains("schema"));
        assert!(!sql.contains("confirm_destructive"));
    }

    #[test]
    fn sql_keyword_in_prose_does_not_trigger() {
        // The key must be a bare line; prose containing the word is untouched.
        let content = "El campo connection_id es obligatorio en la herramienta.";
        let (cleaned, sql) = strip_pseudo_tool_dump(content);
        assert_eq!(cleaned, content);
        assert!(sql.is_none());
    }
}

/// Some models emit tool invocations as plain text instead of using the
/// function-calling mechanism (e.g. a block starting with `Query`,
/// `connection_id`, `sql`, …). Detect that dump in a final answer, remove it
/// and rescue the SQL so the user still gets a "Load in editor" action.
fn strip_pseudo_tool_dump(content: &str) -> (String, Option<String>) {
    let lines: Vec<&str> = content.lines().collect();
    let is_key = |l: &str| -> bool {
        let t = l.trim().trim_end_matches(':').to_lowercase();
        matches!(
            t.as_str(),
            "query" | "connection_id" | "sql" | "schema" | "confirm_destructive" | "database"
        )
    };

    // Find the start of the dump: a bare `connection_id` key line.
    let Some(start_idx) = lines.iter().position(|l| {
        l.trim()
            .trim_end_matches(':')
            .eq_ignore_ascii_case("connection_id")
    }) else {
        return (content.to_string(), None);
    };
    // The dump usually begins one line earlier with the tool name ("query").
    let dump_start = if start_idx > 0 && is_key(lines[start_idx - 1]) {
        start_idx - 1
    } else {
        start_idx
    };

    // Rescue the SQL: the value lines after a bare `sql` key line.
    let sql = lines
        .iter()
        .skip(dump_start)
        .position(|l| l.trim().trim_end_matches(':').eq_ignore_ascii_case("sql"))
        .map(|sql_key_rel| {
            let from = dump_start + sql_key_rel + 1;
            let mut collected: Vec<&str> = vec![];
            for l in &lines[from..] {
                if is_key(l) && !l.trim().is_empty() {
                    break;
                }
                collected.push(l);
            }
            collected.join("\n").trim().to_string()
        })
        .filter(|s| !s.is_empty());

    let cleaned: String = lines[..dump_start].join("\n").trim_end().to_string();
    (cleaned, sql)
}

/// Callback used to stream progress events (answer deltas, tool status) to the
/// frontend during a chat turn. The Tauri command layer adapts this to an
/// ipc::Channel, keeping this module decoupled from Tauri.
pub type ChatEventEmitter<'a> = &'a (dyn Fn(serde_json::Value) + Send + Sync);

impl<'a> ChatOrchestrator<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        state: &'a AppState,
        connection_id: &'a str,
        question: &'a str,
        config: &'a ProviderConfig,
        confirm_destructive: bool,
        ui_context: Option<&'a UiContext>,
        events: Option<ChatEventEmitter<'a>>,
    ) -> Self {
        Self {
            state,
            connection_id,
            question,
            config,
            confirm_destructive,
            ui_context,
            events,
        }
    }

    pub async fn run(self) -> AppResult<AssistantTurn> {
        let driver = if self.connection_id.is_empty() {
            None
        } else {
            self.state.get_connection(self.connection_id).await.ok()
        };

        let ctx = if let Some(ref driver) = driver {
            // Use the stored database/schema from the connection config so the
            // schema context targets the correct database (MySQL/MariaDB "No
            // database selected" guard). SQLite always exposes schemas via its
            // main pseudo-database.
            let db_type = driver.db_type();
            let conn_cfg = self
                .state
                .storage
                .get_connection(self.connection_id)
                .await
                .ok();
            let db_name = match db_type {
                crate::db::DbType::Sqlite => Some("main"),
                _ => conn_cfg.as_ref().and_then(|c| c.database.as_deref()),
            };
            self.state
                .schema_engine
                .get_or_build(self.connection_id, driver.as_ref(), db_name)
                .await
                .ok()
        } else {
            None
        };

        // Without an active connection the schema context stays empty — the
        // model can still answer general questions and generate SQL from scratch.
        let ctx = match ctx {
            Some(ctx) => RelevanceFilter::filter(&ctx, self.question),
            None => SchemaContext {
                db_type: "generic".to_string(),
                version: None,
                database: None,
                user: None,
                tables: vec![],
                views: vec![],
                procedures: vec![],
                triggers: vec![],
            },
        };

        // Load conversation history (global when no connection is selected).
        let stored = self
            .state
            .storage
            .load_assistant_messages(self.connection_id)
            .await?;
        let history = MemoryEngine::build_history(&stored, 10);

        let prefs = self.state.storage.get_preferences().await?;
        let adapter = create_adapter(self.config)?;
        let tools = self.state.tool_engine.list_tools();

        // Inject connections into the prompt so tools can reference them by name.
        let conn_list = self.state.storage.get_all_connections().await.ok();
        let conn_refs: Vec<(String, String)> = conn_list
            .as_ref()
            .map(|list| {
                list.iter()
                    .map(|c| {
                        (
                            c.name.clone(),
                            c.id.map(|u| u.to_string()).unwrap_or_default(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        let conn_slice: Vec<(&str, &str)> = conn_refs
            .iter()
            .map(|(n, i)| (n.as_str(), i.as_str()))
            .collect();
        let system_prompt = PromptBuilder::build_system_prompt(&ctx, &prefs, &conn_slice);
        // Surface the user's current workspace (module, open tabs, errors) so
        // the model can act on what the user is looking at.
        let system_prompt = match self.ui_context {
            Some(ui) => format!("{system_prompt}\n\n{}", render_ui_context_prompt(ui)),
            None => system_prompt,
        };

        // ── Knowledge-first retrieval (hybrid: lexical ∪ vector) ──
        // Before calling the LLM, search the knowledge library for
        // high-confidence prior answers. Lexical candidates come from a cheap
        // LIKE query; semantic recall comes from the in-memory embedding index
        // (skipped when no provider is configured). Scores are fused with max.
        // Short-circuit on a very-high-confidence positive hit (≥ 0.9);
        // error cases are injected into the prompt as known past errors.
        let embed_query = async {
            let provider = crate::application::assistant::knowledge::EmbeddingProvider::from_config(
                self.config,
            );
            match provider {
                Some(p) => p.embed_one(self.question.to_string()).await.ok(),
                None => None,
            }
        };
        let hybrid = KnowledgeEngine::hybrid_search(
            &self.state.storage,
            &self.state.knowledge_vectors,
            self.question,
            0.5,
            embed_query,
        )
        .await?;
        let scored = &hybrid.qa;
        let known_errors: Vec<&crate::models::assistant::KnowledgeCase> =
            hybrid.errors.iter().take(3).collect();

        let system_prompt = if known_errors.is_empty() {
            system_prompt
        } else {
            let mut section = String::from(
                "\n## Known past errors in this app\n\
                 The user has hit these errors before. If the current question \
                 relates to one of them, explain the cause and reuse what worked:\n",
            );
            for case in &known_errors {
                let error_text = case
                    .question
                    .strip_prefix("[error] ")
                    .unwrap_or(&case.question);
                section.push_str(&format!("- Error: \"{error_text}\"\n"));
                if !case.sql_text.trim().is_empty() {
                    section.push_str(&format!("  Context: {}\n", case.sql_text));
                }
            }
            format!("{system_prompt}\n{section}")
        };

        if let Some((case, score)) = scored
            .iter()
            .find(|(c, s)| c.rating == "positive" && *s >= 0.9)
        {
            let _ = self.state.storage.increment_knowledge_used(&case.id).await;
            self.save_message(
                &uuid::Uuid::new_v4().to_string(),
                "user",
                self.question.to_string(),
                None,
                None,
            )
            .await;
            let turn_id = uuid::Uuid::new_v4().to_string();
            let answer = format!(
                "Based on a previously validated answer (reused from your knowledge library, score {score:.2}):\n\n```sql\n{}\n```",
                case.sql_text
            );
            self.save_message(
                &turn_id,
                "assistant",
                answer.clone(),
                Some(case.sql_text.clone()),
                None,
            )
            .await;
            return Ok(AssistantTurn {
                turn_id,
                answer,
                sql: Some(case.sql_text.clone()),
                tool_used: None,
                source: "knowledge".to_string(),
                requires_confirmation: false,
                usage: None,
                action: None,
            });
        }

        if !scored.is_empty() {
            let suggestions: Vec<String> = scored
                .iter()
                .take(5)
                .map(|(c, s)| {
                    format!(
                        "[score {s:.2}] Q: {q}\nSQL: {sql}\n",
                        q = c.question,
                        sql = c.sql_text,
                    )
                })
                .collect();
            let answer = format!(
                "I found similar cases in your knowledge library. Reply with \"continue\" if none answers your question, \
                 or pick one of the following:\n\n{}",
                suggestions.join("\n"),
            );
            let turn_id = uuid::Uuid::new_v4().to_string();
            self.save_message(&turn_id, "assistant", answer.clone(), None, None)
                .await;
            return Ok(AssistantTurn {
                turn_id,
                answer,
                sql: None,
                tool_used: None,
                source: "knowledge".to_string(),
                requires_confirmation: false,
                usage: None,
                action: None,
            });
        }

        let user_message = ChatMessage {
            role: "user".to_string(),
            content: self.question.to_string(),
            ..Default::default()
        };

        let mut messages = history;
        messages.push(user_message);

        // When the user confirmed a pending operation, the question was already
        // persisted by the first turn — do not duplicate it in storage. The
        // model still receives the question here, plus an explicit internal
        // confirmation note (never shown in the chat UI).
        if !self.confirm_destructive {
            let user_msg_id = uuid::Uuid::new_v4().to_string();
            self.save_message(&user_msg_id, "user", self.question.to_string(), None, None)
                .await;
        }
        if self.confirm_destructive {
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: "[El usuario confirmó la operación. Ejecuta la tool que habías solicitado y entrega el resultado.]"
                    .to_string(),
                ..Default::default()
            });
        }

        let turn_id = uuid::Uuid::new_v4().to_string();
        let source = format!("ai:{}", self.config.provider_id);

        // ── Tool-call orchestration loop ──
        // Call the model. If it returns tool_calls, execute each one and feed
        // the results back to the model; repeat up to MAX_TOOL_ROUNDS times.
        // The final non-tool response is returned to the caller. Providers that
        // don't return tool calls simply exit on round 0.
        let mut last_response: Option<crate::models::assistant::AiResponse> = None;
        let mut tool_used: Option<String> = None;
        let mut total_prompt = 0u32;
        let mut total_completion = 0u32;
        let mut requires_confirmation = false;

        // Detect repeated identical tool calls across rounds. If the model keeps
        // requesting the same (tool, args), it is likely stuck — we stop
        // executing and force one final completion without tools.
        let mut executed_signatures: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut loop_detected = false;
        // Side-effectful UI actions requested by the workspace tool are
        // surfaced to the frontend on the returned turn.
        let mut ui_action: Option<serde_json::Value> = None;

        for _round in 0..MAX_TOOL_ROUNDS {
            let request = AiRequest {
                system: system_prompt.clone(),
                messages: messages.clone(),
                tools: tools.clone(),
                temperature: 0.3,
                max_tokens: Some(4096),
            };
            // Stream answer deltas to the frontend as they arrive.
            let events = self.events;
            let on_delta = move |text: &str| {
                if let Some(emit) = events {
                    emit(serde_json::json!({ "event": "delta", "text": text }));
                }
            };
            match complete_with_retry(adapter.as_ref(), &request, &on_delta, self.events).await {
                Ok(response) => {
                    total_prompt = total_prompt.saturating_add(response.usage.prompt_tokens);
                    total_completion =
                        total_completion.saturating_add(response.usage.completion_tokens);

                    // A round that produces tool calls means its streamed text was
                    // only intermediate reasoning (or leaked tool-call arguments),
                    // never part of the answer. Tell the frontend to drop it so
                    // the visible reply only keeps meaningful content.
                    if !response.tool_calls.is_empty() {
                        if let Some(emit) = self.events {
                            emit(serde_json::json!({ "event": "clear_content" }));
                        }
                    }

                    if response.tool_calls.is_empty() {
                        last_response = Some(response);
                        break;
                    }

                    let assistant_msg = ChatMessage {
                        role: "assistant".to_string(),
                        content: response.content.clone(),
                        tool_calls: response.tool_calls.clone(),
                        ..Default::default()
                    };
                    messages.push(assistant_msg);

                    for tc in response.tool_calls.iter() {
                        let signature = format!(
                            "{}:{}",
                            tc.name,
                            serde_json::to_string(&tc.arguments).unwrap_or_default()
                        );
                        if !executed_signatures.insert(signature) {
                            loop_detected = true;
                            let result_text = serde_json::json!({
                                "ok": false,
                                "message": "Tool call repeated across rounds. Skipping it — answer now using the information already gathered.",
                                "requires_confirmation": false,
                                "data": null,
                            })
                            .to_string();
                            messages.push(ChatMessage {
                                role: "tool".to_string(),
                                content: result_text,
                                tool_call_id: Some(tc.id.clone()),
                                ..Default::default()
                            });
                            continue;
                        }
                        // Give context-aware tools access to the user's
                        // workspace snapshot for this turn.
                        let mut tool_args = tc.arguments.clone();
                        if let Some(ui) = self.ui_context {
                            if let Ok(ui_val) = serde_json::to_value(ui) {
                                tool_args["ui_context"] = ui_val;
                            }
                        }
                        if let Some(emit) = self.events {
                            emit(serde_json::json!({
                                "event": "status",
                                "message": format!("Ejecutando herramienta '{}'…", tc.name),
                            }));
                        }
                        // Hard timeout per tool: a hanging driver/network call
                        // must never freeze the whole chat turn. On timeout the
                        // model receives an error result and can narrate it.
                        let exec = match tokio::time::timeout(
                            std::time::Duration::from_secs(120),
                            self.state.tool_engine.execute_with_confirmation(
                                &tc.name,
                                tool_args,
                                driver.as_deref(),
                                self.state,
                                self.confirm_destructive,
                                Some(self.connection_id),
                            ),
                        )
                        .await
                        {
                            Ok(res) => res,
                            Err(_) => Ok(crate::models::assistant::ToolResult {
                                ok: false,
                                data: None,
                                requires_confirmation: false,
                                message: Some(format!(
                                    "Tool '{}' timed out after 120s and was cancelled.",
                                    tc.name
                                )),
                            }),
                        };
                        let result_text = match exec {
                            Ok(r) => {
                                if r.requires_confirmation {
                                    requires_confirmation = true;
                                }
                                // Stream the executed action so the frontend can
                                // reflect side effects in real time (e.g. a
                                // connection opened by the agent shows up
                                // immediately in the sidebar).
                                if let Some(emit) = self.events {
                                    emit(serde_json::json!({
                                        "event": "tool",
                                        "name": tc.name,
                                        "ok": r.ok,
                                        "message": r.message,
                                        "data": r.data,
                                    }));
                                }
                                if tc.name == "workspace" {
                                    if let Some(action) =
                                        r.data.as_ref().and_then(|d| d.get("action"))
                                    {
                                        ui_action = Some(action.clone());
                                    }
                                }
                                serde_json::to_string(&r).unwrap_or_else(|_| "{}".to_string())
                            }
                            Err(e) => {
                                if let Some(emit) = self.events {
                                    emit(serde_json::json!({
                                        "event": "tool",
                                        "name": tc.name,
                                        "ok": false,
                                        "message": e.to_string(),
                                        "data": null,
                                    }));
                                }
                                serde_json::json!({
                                    "ok": false,
                                    "message": e.to_string(),
                                    "requires_confirmation": false,
                                    "data": null,
                                })
                                .to_string()
                            }
                        };
                        if tool_used.is_none() {
                            let _tn = tc.name.clone();
                            tool_used = Some(_tn);
                        }
                        // Tool results are only fed back to the model within
                        // this turn — they are not persisted as chat messages,
                        // so the conversation stays clean (no raw JSON shown).
                        messages.push(ChatMessage {
                            role: "tool".to_string(),
                            content: result_text,
                            tool_call_id: Some(tc.id.clone()),
                            ..Default::default()
                        });
                    }

                    // The model kept requesting the same tool call. Force one
                    // final completion with tools disabled so it must answer
                    // from context.
                    if loop_detected {
                        let final_request = AiRequest {
                            system: system_prompt.clone(),
                            messages: messages.clone(),
                            tools: vec![],
                            temperature: 0.3,
                            max_tokens: Some(4096),
                        };
                        let events = self.events;
                        let on_delta = move |text: &str| {
                            if let Some(emit) = events {
                                emit(serde_json::json!({ "event": "delta", "text": text }));
                            }
                        };
                        if let Ok(final_resp) = complete_with_retry(
                            adapter.as_ref(),
                            &final_request,
                            &on_delta,
                            self.events,
                        )
                        .await
                        {
                            last_response = Some(final_resp);
                        }
                        break;
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
                        action: None,
                    });
                }
            }
        }

        let response = last_response.unwrap_or_else(|| crate::models::assistant::AiResponse {
            content: "Tool orchestration exceeded the maximum number of rounds.".to_string(),
            tool_calls: vec![],
            usage: TokenUsage {
                prompt_tokens: total_prompt,
                completion_tokens: total_completion,
                total_tokens: total_prompt.saturating_add(total_completion),
            },
            model: self.config.model.clone().unwrap_or_default(),
        });

        let sql_from_fenced = extract_sql_block(&response.content);
        let (answer_text, sql) = match strip_pseudo_tool_dump(&response.content) {
            (cleaned, Some(rescued)) if !rescued.is_empty() => {
                (cleaned, sql_from_fenced.or(Some(rescued)))
            }
            (cleaned, _) => (cleaned, sql_from_fenced),
        };

        self.save_message(
            &turn_id,
            "assistant",
            answer_text.clone(),
            sql.clone(),
            tool_used.clone(),
        )
        .await;

        Ok(AssistantTurn {
            turn_id,
            answer: answer_text,
            sql,
            tool_used,
            source,
            requires_confirmation,
            usage: Some(TokenUsage {
                prompt_tokens: total_prompt,
                completion_tokens: total_completion,
                total_tokens: total_prompt.saturating_add(total_completion),
            }),
            action: ui_action,
        })
    }

    async fn save_message(
        &self,
        id: &str,
        role: &str,
        content: String,
        sql: Option<String>,
        tool_used: Option<String>,
    ) {
        let _ = self
            .state
            .storage
            .save_assistant_messages(&[crate::models::AssistantMessage {
                id: id.to_string(),
                role: role.to_string(),
                content,
                sql,
                is_safe_delete: None,
                feedback: None,
                accepted_sql: None,
                rejection_reason: None,
                tool_used,
                timestamp: chrono::Utc::now().timestamp(),
                connection_id: Some(self.connection_id.to_string()),
            }])
            .await;
    }
}

/// Extract every ```sql fenced block from a markdown answer, returning the raw
/// SQL of each (without the fences). Empty blocks are skipped.
pub fn extract_sql_blocks(answer: &str) -> Vec<String> {
    let re = regex::Regex::new(r"(?i)```sql\s*([\s\S]*?)```").unwrap();
    re.captures_iter(answer)
        .filter_map(|c| {
            let sql = c.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            if sql.is_empty() {
                None
            } else {
                Some(sql.to_string())
            }
        })
        .collect()
}

/// Extract the first ```sql fenced block from a markdown answer, returning the
/// raw SQL (without the fences). Returns `None` if no such block is found.
pub fn extract_sql_block(answer: &str) -> Option<String> {
    extract_sql_blocks(answer).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::{extract_sql_block, extract_sql_blocks};

    #[test]
    fn extracts_simple_sql_block() {
        let answer = "Here is the query:\n```sql\nSELECT * FROM users;\n```\nEnjoy!";
        assert_eq!(
            extract_sql_block(answer),
            Some("SELECT * FROM users;".to_string())
        );
    }

    #[test]
    fn returns_none_without_sql_fence() {
        assert_eq!(extract_sql_block("Just plain text"), None);
    }

    #[test]
    fn returns_none_on_empty_block() {
        let answer = "```sql\n```";
        assert_eq!(extract_sql_block(answer), None);
    }

    #[test]
    fn extracts_first_block_only() {
        let answer = "```sql\nSELECT 1;\n```\nthen\n```sql\nSELECT 2;\n```";
        assert_eq!(extract_sql_block(answer), Some("SELECT 1;".to_string()));
    }

    #[test]
    fn case_insensitive_opener() {
        let answer = "```SQL\nSELECT 1;\n```";
        assert_eq!(extract_sql_block(answer), Some("SELECT 1;".to_string()));
    }

    #[test]
    fn trims_whitespace() {
        let answer = "```sql\n  SELECT 1;  \n```";
        assert_eq!(extract_sql_block(answer), Some("SELECT 1;".to_string()));
    }

    #[test]
    fn extracts_all_blocks_in_order() {
        let answer = "1. Direct:\n```sql\nSELECT 1;\n```\n2. Subquery:\n```sql\nSELECT 2;\n```\n3. Left join:\n```sql\nSELECT 3;\n```";
        assert_eq!(
            extract_sql_blocks(answer),
            vec![
                "SELECT 1;".to_string(),
                "SELECT 2;".to_string(),
                "SELECT 3;".to_string()
            ]
        );
    }

    #[test]
    fn skips_empty_blocks() {
        let answer = "```sql\n\n```\ntext\n```sql\nSELECT 2;\n```";
        assert_eq!(extract_sql_blocks(answer), vec!["SELECT 2;".to_string()]);
    }
}
