use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct TransactionTool;

#[async_trait]
impl AssistantTool for TransactionTool {
    fn name(&self) -> &str {
        "transaction"
    }

    fn description(&self) -> &str {
        "Manage a connection's transaction: 'begin' starts one, 'commit' persists, 'rollback' discards (requires confirmation)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["begin", "commit", "rollback"],
                    "description": "Transaction operation"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID"
                }
            },
            "required": ["action", "connection_id"]
        })
    }

    fn is_destructive(&self) -> bool {
        true
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
            .unwrap_or("begin");
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if cid.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("connection_id is required.".to_string()),
            });
        }

        let message = match action {
            "begin" => state.begin_transaction(cid).await.map(|_| {
                "Transaction started. Write queries on this connection now run inside it."
                    .to_string()
            }),
            "commit" => state
                .commit_transaction(cid)
                .await
                .map(|rows| format!("Transaction committed ({rows} rows affected).")),
            "rollback" => state
                .rollback_transaction(cid)
                .await
                .map(|_| "Transaction rolled back.".to_string()),
            other => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Unknown action: {other}")),
                })
            }
        };

        match message {
            Ok(msg) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({ "message": msg })),
                requires_confirmation: false,
                message: None,
            }),
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            }),
        }
    }
}
