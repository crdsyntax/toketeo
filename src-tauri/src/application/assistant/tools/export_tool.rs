use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct ExportTool;

#[async_trait]
impl AssistantTool for ExportTool {
    fn name(&self) -> &str {
        "export"
    }

    fn description(&self) -> &str {
        "Export table data as SQL INSERT statements or JSON."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Table name to export"
                },
                "format": {
                    "type": "string",
                    "enum": ["sql", "json"],
                    "description": "Export format"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to export (default: 100)"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID to export from (defaults to the chat's active connection)"
                }
            },
            "required": ["table"]
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

        let table = args
            .get("table")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if table.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("'table' is required.".to_string()),
            });
        }

        let format = args
            .get("format")
            .and_then(|v| v.as_str())
            .unwrap_or("sql");
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(100);

        let columns = driver.fetch_columns(table, None).await?;
        let col_names: Vec<String> = columns
            .iter()
            .filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(String::from))
            .collect();

        let query = format!(
            "SELECT {} FROM {} LIMIT {}",
            col_names.join(", "),
            table,
            limit
        );
        let result = driver.execute(&query).await?;

        let export = match format {
            "json" => serde_json::json!({
                "table": table,
                "columns": col_names,
                "rows": result.rows,
            }),
            _ => {
                let inserts: Vec<String> = result
                    .rows
                    .iter()
                    .map(|row| {
                        let vals: Vec<String> = col_names
                            .iter()
                            .map(|c| {
                                row.get(c)
                                    .map(|v| match v {
                                        serde_json::Value::String(s) => {
                                            format!("'{}'", s.replace('\'', "''"))
                                        }
                                        serde_json::Value::Null => "NULL".to_string(),
                                        other => other.to_string(),
                                    })
                                    .unwrap_or_else(|| "NULL".to_string())
                            })
                            .collect();
                        format!(
                            "INSERT INTO {table} ({cols}) VALUES ({vals});",
                            cols = col_names.join(", "),
                            vals = vals.join(", ")
                        )
                    })
                    .collect();

                serde_json::json!({
                    "table": table,
                    "rowCount": result.rows.len(),
                    "sql": inserts.join("\n"),
                })
            }
        };

        Ok(ToolResult {
            ok: true,
            data: Some(export),
            requires_confirmation: false,
            message: None,
        })
    }
}
