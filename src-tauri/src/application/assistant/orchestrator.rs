use crate::application::assistant::adapters::create_adapter;
use crate::application::assistant::context::relevance::RelevanceFilter;
use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::application::assistant::learning::memory_engine::MemoryEngine;
use crate::application::assistant::prompt::prompt_builder::PromptBuilder;
use crate::application::assistant::tools::workspace_tool::render_ui_context_prompt;
use crate::error::AppResult;
use crate::models::assistant::{AiRequest, AssistantTurn, ChatMessage, SchemaContext, TokenUsage};
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

        // ── Knowledge-first retrieval ──
        // Before calling the LLM, search the validated knowledge library for
        // high-confidence prior answers. Short-circuit on a very-high-confidence
        // positive hit (≥ 0.9 word overlap); otherwise inject candidates below
        // the threshold as suggestions the user can pick from.
        // Error cases (engine = "error") are excluded from suggestions and
        // instead injected into the prompt as known past errors below.
        let global_cases = self
            .state
            .storage
            .list_knowledge_global(500)
            .await
            .unwrap_or_default();
        let scored = KnowledgeEngine::find_similar_scored(self.question, &global_cases, 0.5);
        let scored: Vec<_> = scored
            .into_iter()
            .filter(|(c, _)| c.engine != "error")
            .collect();

        // Known past errors relevant to this question become prompt context so
        // the model can recognize recurring failures and propose proven fixes.
        let error_cases = self
            .state
            .storage
            .list_knowledge_all("error", 100)
            .await
            .unwrap_or_default();
        let known_errors: Vec<&crate::models::assistant::KnowledgeCase> =
            KnowledgeEngine::find_similar(self.question, &error_cases, 0.6)
                .into_iter()
                .take(3)
                .collect();

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
            match adapter.complete_streaming(request, &on_delta).await {
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
                        let exec = self
                            .state
                            .tool_engine
                            .execute_with_confirmation(
                                &tc.name,
                                tool_args,
                                driver.as_deref(),
                                self.state,
                                self.confirm_destructive,
                                Some(self.connection_id),
                            )
                            .await;
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
                        if let Ok(final_resp) =
                            adapter.complete_streaming(final_request, &on_delta).await
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

        // Try to extract a fenced ```sql block from the final answer so the UI
        // can surface a "Run SQL" affordance even outside of tool responses.
        let sql = extract_sql_block(&response.content);

        self.save_message(
            &turn_id,
            "assistant",
            response.content.clone(),
            sql.clone(),
            tool_used.clone(),
        )
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
