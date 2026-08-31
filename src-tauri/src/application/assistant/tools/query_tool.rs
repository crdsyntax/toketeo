use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::{AssistantTool, SafetyClassifier};

pub struct QueryTool;

#[async_trait]
impl AssistantTool for QueryTool {
    fn name(&self) -> &str {
        "query"
    }

    fn description(&self) -> &str {
        "Execute a SQL statement on a connection. Requires user confirmation (destructive guard). For read-only metadata use 'explorer' instead."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID to execute on"
                },
                "sql": {
                    "type": "string",
                    "description": "SQL statement to execute"
                },
                "schema": {
                    "type": "string",
                    "description": "Optional schema/database context"
                }
            },
            "required": ["connection_id", "sql"]
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
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let sql = args.get("sql").and_then(|v| v.as_str()).unwrap_or("");
        let schema = args
            .get("schema")
            .and_then(|v| v.as_str())
            .map(String::from);

        if cid.is_empty() || sql.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("Both connection_id and sql are required.".to_string()),
            });
        }

        if SafetyClassifier::is_destructive_query(sql)
            && state.is_read_only(cid).await.unwrap_or(false)
        {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(
                    "Connection is read-only; write statements are not allowed.".to_string(),
                ),
            });
        }

        match ExplorerService::execute_query_with_origin(state, cid, sql, schema, "assistant").await
        {
            Ok(result) => {
                let destructive = SafetyClassifier::is_destructive_query(sql);
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({
                        "columns": result.columns,
                        "rows": result.rows,
                        "rowsAffected": result.rows_affected,
                        "executionTimeMs": result.execution_time_ms,
                        "destructive": destructive,
                    })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            }),
        }
    }
}
