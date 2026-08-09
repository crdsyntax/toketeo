use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct ExplainTool;

#[async_trait]
impl AssistantTool for ExplainTool {
    fn name(&self) -> &str {
        "explain"
    }

    fn description(&self) -> &str {
        "Run EXPLAIN on a SQL query to analyze its execution plan."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The SQL query to explain (without leading EXPLAIN keyword)"
                },
                "format": {
                    "type": "string",
                    "enum": ["text", "json"],
                    "description": "EXPLAIN output format (json is supported by MySQL 5.6+ and PostgreSQL 9.6+)"
                }
            },
            "required": ["query"]
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

        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("'query' is required.".to_string()),
            });
        }

        let _format = args
            .get("format")
            .and_then(|v| v.as_str())
            .unwrap_or("text");

        let explain_sql = format!("EXPLAIN {query}");
        let result = driver.execute(&explain_sql).await?;

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({
                "columns": result.columns,
                "rows": result.rows,
                "executionTimeMs": result.execution_time_ms,
            })),
            requires_confirmation: false,
            message: None,
        })
    }
}
