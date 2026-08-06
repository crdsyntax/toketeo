use async_trait::async_trait;

use crate::application::assistant::knowledge::KnowledgeEngine;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Search, list and manage the assistant's validated knowledge library.
pub struct KnowledgeTool;

#[async_trait]
impl AssistantTool for KnowledgeTool {
    fn name(&self) -> &str {
        "knowledge"
    }

    fn description(&self) -> &str {
        "Manage the validated SQL knowledge library: 'search' by text, 'list' recent cases, 'favorite' a case by id, 'record' a new validated QA pair."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["search", "list", "favorite", "record"],
                    "description": "Action to perform"
                },
                "query": {
                    "type": "string",
                    "description": "Search text (for 'search') or the question for 'record'"
                },
                "sql_text": {
                    "type": "string",
                    "description": "Validated SQL to store (for 'record')"
                },
                "engine": {
                    "type": "string",
                    "description": "Engine filter (e.g. postgres, mariadb) — optional"
                },
                "id": {
                    "type": "string",
                    "description": "Knowledge case id (for 'favorite')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default: 20)"
                }
            },
            "required": ["action"]
        })
    }

    fn is_destructive(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        args: serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("search");
        let engine = args
            .get("engine")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as i64;

        match action {
            "search" => {
                let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                if query.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'query' is required for search".to_string()),
                    });
                }
                let cases = KnowledgeEngine::search(&state.storage, query, engine, limit).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "cases": cases })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "list" => {
                let cases = state.storage.list_knowledge_all(engine, limit).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "cases": cases })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "favorite" => {
                let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'id' is required for favorite".to_string()),
                    });
                }
                let favorite = state.storage.toggle_knowledge_favorite(id).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "id": id, "favorite": favorite })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "record" => {
                let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let sql_text = args.get("sql_text").and_then(|v| v.as_str()).unwrap_or("");
                if query.is_empty() || sql_text.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(
                            "'query' and 'sql_text' are required for record".to_string(),
                        ),
                    });
                }
                let id = KnowledgeEngine::record_case(
                    &state.storage,
                    query,
                    sql_text,
                    engine,
                    "positive",
                )
                .await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "id": id })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            other => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown action: {other}")),
            }),
        }
    }
}
