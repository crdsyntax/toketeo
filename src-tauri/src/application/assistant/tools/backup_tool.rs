use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::DumpSelection;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct BackupTool;

#[async_trait]
impl AssistantTool for BackupTool {
    fn name(&self) -> &str {
        "backup"
    }

    fn description(&self) -> &str {
        "Backup database schema to a file. Can include tables, views, triggers, procedures, and functions."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID of the database to back up"
                },
                "schema": {
                    "type": "string",
                    "description": "Schema name to back up"
                },
                "file_path": {
                    "type": "string",
                    "description": "Full path for the backup file"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Table names to include (all if omitted)"
                }
            },
            "required": ["connection_id", "schema", "file_path"]
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
        let connection_id = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let schema = args
            .get("schema")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if connection_id.is_empty() || schema.is_empty() || file_path.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(
                    "connection_id, schema, and file_path are required.".to_string(),
                ),
            });
        }

        let tables: Vec<String> = args
            .get("tables")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|s| s.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let selection = DumpSelection {
            tables,
            views: vec![],
            triggers: vec![],
            procedures: vec![],
            functions: vec![],
        };

        ExplorerService::dump_schema(state, connection_id, schema, &selection, file_path)
            .await?;

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({ "filePath": file_path })),
            requires_confirmation: false,
            message: Some(format!("Schema backed up to {file_path}")),
        })
    }
}
