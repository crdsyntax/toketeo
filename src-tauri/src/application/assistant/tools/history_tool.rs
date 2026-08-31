use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct HistoryTool;

#[async_trait]
impl AssistantTool for HistoryTool {
    fn name(&self) -> &str {
        "history"
    }

    fn description(&self) -> &str {
        "Read assistant history: 'queries' (previously executed SQL queries) and 'messages' (chat messages). Scoped by connection_id (omit for global)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["queries", "messages"],
                    "description": "Which history to read"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID to scope the history to (optional)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max entries to return (default: 50)"
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
            .unwrap_or("queries");
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as i64;

        match action {
            "queries" => {
                let q = state.storage.load_query_history(cid, limit).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "queries": q })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "messages" => {
                let m = state.storage.load_assistant_messages(cid).await?;
                let recent: Vec<_> = m.iter().rev().take(limit as usize).collect();
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "messages": recent })),
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
