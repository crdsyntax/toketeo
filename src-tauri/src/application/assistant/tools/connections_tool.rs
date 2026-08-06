use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// List and inspect connections. Never exposes credentials — only metadata
/// (id, name, type, host, port, user, database, environment, connectivity).
pub struct ConnectionsTool;

#[async_trait]
impl AssistantTool for ConnectionsTool {
    fn name(&self) -> &str {
        "connections"
    }

    fn description(&self) -> &str {
        "List saved database connections (without credentials) and inspect their databases."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "databases", "status"],
                    "description": "list: all saved connections. databases: databases of a connection. status: whether a connection is active."
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID (required for databases/status)"
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
        driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("list");

        match action {
            "list" => {
                let conns = state.storage.get_all_connections().await?;
                let mut safe: Vec<serde_json::Value> = Vec::with_capacity(conns.len());
                for c in &conns {
                    let connected = match &c.id {
                        Some(u) => state.get_connection(&u.to_string()).await.is_ok(),
                        None => false,
                    };
                    safe.push(serde_json::json!({
                        "id": c.id.map(|u| u.to_string()).unwrap_or_default(),
                        "name": c.name,
                        "dbType": c.db_type.to_string(),
                        "host": c.host,
                        "port": c.port,
                        "user": c.user,
                        "database": c.database,
                        "environment": c.environment,
                        "connected": connected,
                    }));
                }
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "connections": safe })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "databases" => {
                let driver = match driver {
                    Some(d) => d,
                    None => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(
                                "No database connection available. Provide connection_id."
                                    .to_string(),
                            ),
                        })
                    }
                };
                let dbs = driver.fetch_databases().await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "databases": dbs })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "status" => {
                let cid = args
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let connected = !cid.is_empty() && state.get_connection(cid).await.is_ok();
                let db_type = driver.map(|d| d.db_type().to_string()).unwrap_or_default();
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({
                        "connection_id": cid,
                        "connected": connected,
                        "dbType": db_type,
                    })),
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
