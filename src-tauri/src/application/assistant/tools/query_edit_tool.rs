use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::application::sql_generator_service::SqlGeneratorService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::models::CellUpdateInput;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Update a single cell in a table (generates the engine-specific UPDATE).
pub struct QueryEditTool;

#[async_trait]
impl AssistantTool for QueryEditTool {
    fn name(&self) -> &str {
        "query_edit"
    }

    fn description(&self) -> &str {
        "Update a single cell of a table row on a connection (requires confirmation)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID"
                },
                "schema": {
                    "type": "string",
                    "description": "Optional schema"
                },
                "table": {
                    "type": "string",
                    "description": "Table name"
                },
                "column": {
                    "type": "string",
                    "description": "Column to update"
                },
                "new_value": {
                    "description": "New value for the cell"
                },
                "primary_keys": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Primary key column names"
                },
                "row": {
                    "type": "object",
                    "description": "The full row, keyed by column name, used to locate the record"
                }
            },
            "required": ["connection_id", "table", "column", "primary_keys", "row"]
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
        let table = args.get("table").and_then(|v| v.as_str()).unwrap_or("");
        let column = args.get("column").and_then(|v| v.as_str()).unwrap_or("");

        if cid.is_empty() || table.is_empty() || column.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("connection_id, table and column are required.".to_string()),
            });
        }

        let row = match args.get("row").and_then(|v| v.as_object()) {
            Some(r) => r.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            None => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some("'row' must be an object.".to_string()),
                })
            }
        };
        let primary_keys: Vec<String> = args
            .get("primary_keys")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str())
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();
        if primary_keys.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("'primary_keys' must not be empty.".to_string()),
            });
        }

        let input = CellUpdateInput {
            schema: args
                .get("schema")
                .and_then(|v| v.as_str())
                .map(String::from),
            table: table.to_string(),
            row,
            column: column.to_string(),
            new_value: args
                .get("new_value")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
            primary_keys,
        };

        let driver = match state.get_connection(cid).await {
            Ok(d) => d,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                })
            }
        };
        let sql = match SqlGeneratorService::generate_cell_update(driver.db_type(), &input) {
            Ok(s) => s,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                })
            }
        };

        match ExplorerService::execute_query_with_origin(state, cid, &sql, None, "assistant").await
        {
            Ok(result) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({
                    "rowsAffected": result.rows_affected,
                    "sql": sql,
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
}
