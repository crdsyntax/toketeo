use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::models::compare::CompareSession;
use crate::state::{AppState, SyncControl};

use super::tool_engine::AssistantTool;

pub struct CompareSessionsTool;

#[async_trait]
impl AssistantTool for CompareSessionsTool {
    fn name(&self) -> &str {
        "compare_sessions"
    }

    fn description(&self) -> &str {
        "Manage schema/data comparison sessions: 'list', 'load' (by id), 'save' (a session object), 'delete' (by id, destructive), 'pause'/'resume'/'cancel' a running comparison by id."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "load", "save", "delete", "pause", "resume", "cancel"],
                    "description": "Operation"
                },
                "id": {
                    "type": "string",
                    "description": "Session/comparison ID"
                },
                "session": {
                    "type": "object",
                    "description": "CompareSession object for 'save'"
                }
            },
            "required": ["action"]
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
            .unwrap_or("list");
        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");

        match action {
            "list" => {
                let sessions = state.storage.list_compare_sessions().await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "sessions": sessions })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "load" => {
                if id.is_empty() {
                    return missing("id is required for load");
                }
                match state.storage.get_compare_session(id).await {
                    Ok(s) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "session": s })),
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
            "save" => {
                let session = match serde_json::from_value::<CompareSession>(
                    args.get("session")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(format!("Invalid session: {e}")),
                        })
                    }
                };
                match state.storage.save_compare_session(&session).await {
                    Ok(s) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "session": s })),
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
            "delete" => {
                if id.is_empty() {
                    return missing("id is required for delete");
                }
                match state.storage.delete_compare_session(id).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "deleted": id })),
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
            "pause" => {
                if id.is_empty() {
                    return missing("id is required for pause");
                }
                state.set_compare_control(id, SyncControl::Paused).await;
                Ok(ok_result(
                    serde_json::json!({ "id": id, "status": "paused" }),
                ))
            }
            "resume" => {
                if id.is_empty() {
                    return missing("id is required for resume");
                }
                state.set_compare_control(id, SyncControl::Running).await;
                Ok(ok_result(
                    serde_json::json!({ "id": id, "status": "running" }),
                ))
            }
            "cancel" => {
                if id.is_empty() {
                    return missing("id is required for cancel");
                }
                state.set_compare_control(id, SyncControl::Cancelled).await;
                Ok(ok_result(
                    serde_json::json!({ "id": id, "status": "cancelled" }),
                ))
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

fn ok_result(data: serde_json::Value) -> ToolResult {
    ToolResult {
        ok: true,
        data: Some(data),
        requires_confirmation: false,
        message: None,
    }
}

fn missing(msg: &str) -> AppResult<ToolResult> {
    Ok(ToolResult {
        ok: false,
        data: None,
        requires_confirmation: false,
        message: Some(msg.to_string()),
    })
}
