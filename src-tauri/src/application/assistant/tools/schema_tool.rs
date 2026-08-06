use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct SchemaTool;

#[async_trait]
impl AssistantTool for SchemaTool {
    fn name(&self) -> &str {
        "schema"
    }

    fn description(&self) -> &str {
        "Describe database schema objects: tables, columns, indexes, foreign keys, or get DDL for an object."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["describe", "ddl", "tables", "columns"],
                    "description": "Action to perform"
                },
                "object": {
                    "type": "string",
                    "description": "Object name (table, view, etc.)"
                },
                "object_type": {
                    "type": "string",
                    "enum": ["table", "view", "procedure", "function", "trigger"],
                    "description": "Type of the object"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID to inspect (defaults to the chat's active connection)"
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
        _state: &AppState,
    ) -> AppResult<ToolResult> {
        let driver = match driver {
            Some(d) => d,
            None => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some("No database connection available.".to_string()),
                })
            }
        };

        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("describe");

        match action {
            "tables" => {
                let tables = driver.fetch_tables(None, None).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "tables": tables })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "columns" => {
                let object = args.get("object").and_then(|v| v.as_str()).unwrap_or("");
                if object.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'object' is required for action 'columns'".to_string()),
                    });
                }
                let columns = driver.fetch_columns(object, None).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "table": object, "columns": columns })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "ddl" => {
                let object = args.get("object").and_then(|v| v.as_str()).unwrap_or("");
                let object_type = args
                    .get("object_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("table");
                if object.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'object' is required for action 'ddl'".to_string()),
                    });
                }
                let ddl = driver.fetch_ddl(object, object_type, None).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "object": object, "ddl": ddl })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "describe" => {
                let object = args.get("object").and_then(|v| v.as_str()).unwrap_or("");
                if object.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'object' is required for action 'describe'".to_string()),
                    });
                }
                let columns = driver.fetch_columns(object, None).await?;
                let indexes = driver.fetch_indexes(object, None).await?;
                let fks = driver.fetch_foreign_keys(object, None).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({
                        "table": object,
                        "columns": columns,
                        "indexes": indexes,
                        "foreignKeys": fks,
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
