use async_trait::async_trait;

use crate::application::compare::compare_service::CompareService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct CompareDataTool;

#[async_trait]
impl AssistantTool for CompareDataTool {
    fn name(&self) -> &str {
        "compare_data"
    }

    fn description(&self) -> &str {
        "Compare data between two database connections for specific tables."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "source_connection_id": {
                    "type": "string",
                    "description": "Connection ID of the source database"
                },
                "target_connection_id": {
                    "type": "string",
                    "description": "Connection ID of the target database"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Tables to compare data for"
                },
                "chunk_size": {
                    "type": "integer",
                    "description": "Rows per chunk (default: 10000)"
                }
            },
            "required": ["source_connection_id", "target_connection_id", "tables"]
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
        let source_id = args
            .get("source_connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let target_id = args
            .get("target_connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let tables: Vec<String> = args
            .get("tables")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if source_id.is_empty() || target_id.is_empty() || tables.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(
                    "source_connection_id, target_connection_id, and tables are required."
                        .to_string(),
                ),
            });
        }

        let source = state.get_connection(source_id).await?;
        let target = state.get_connection(target_id).await?;

        let chunk_size = args
            .get("chunk_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(10000) as usize;

        let report = CompareService::compare_data(
            source, target, None, None, &tables, chunk_size, None, None, None,
        )
        .await?;

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::to_value(&report).unwrap_or_default()),
            requires_confirmation: false,
            message: None,
        })
    }
}
