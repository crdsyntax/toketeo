use async_trait::async_trait;

use crate::application::connection_service::ConnectionService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::models::DbConnectionConfig;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Write operations on connections: connect, disconnect, save (create/update)
/// and delete. All require confirmation.
pub struct ConnectionManageTool;

#[async_trait]
impl AssistantTool for ConnectionManageTool {
    fn name(&self) -> &str {
        "connection_manage"
    }

    fn description(&self) -> &str {
        "Manage connections (requires confirmation): 'connect' a saved connection by id, 'disconnect', 'save' a new/updated connection config, 'delete' a connection, 'switchDatabase'."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["connect", "disconnect", "save", "delete", "switchDatabase"],
                    "description": "Operation"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID (connect/disconnect/delete/switchDatabase)"
                },
                "database": {
                    "type": "string",
                    "description": "New database for switchDatabase"
                },
                "config": {
                    "type": "object",
                    "description": "Connection config for 'save' — same shape as the app's connection form. Never include credentials in the chat; the backend keeps them encrypted."
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
            .unwrap_or("connect");
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match action {
            "connect" => {
                if cid.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("connection_id is required.".to_string()),
                    });
                }
                let config = match state.storage.get_connection(cid).await {
                    Ok(c) => c,
                    Err(e) => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(e.to_string()),
                        })
                    }
                };
                match ConnectionService::connect(state, config).await {
                    Ok(id) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "connectionId": id, "connected": true })),
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
            "disconnect" => {
                if cid.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("connection_id is required.".to_string()),
                    });
                }
                state.remove_connection(cid).await.map(|_| ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "connectionId": cid, "connected": false })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "save" => {
                let config = match serde_json::from_value::<DbConnectionConfig>(
                    args.get("config").cloned().unwrap_or(serde_json::Value::Null),
                ) {
                    Ok(c) => c,
                    Err(e) => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(format!("Invalid connection config: {e}")),
                        })
                    }
                };
                match ConnectionService::save_connection(state, config).await {
                    Ok(id) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "connectionId": id })),
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
                if cid.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("connection_id is required.".to_string()),
                    });
                }
                match ConnectionService::delete_connection(state, cid).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "deleted": cid })),
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
            "switchDatabase" => {
                let database = args.get("database").and_then(|v| v.as_str()).unwrap_or("");
                if cid.is_empty() || database.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(
                            "connection_id and database are required for switchDatabase.".to_string(),
                        ),
                    });
                }
                match ConnectionService::switch_database(state, cid, database).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({
                            "connectionId": cid,
                            "database": database,
                        })),
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
            other => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown action: {other}")),
            }),
        }
    }
}
