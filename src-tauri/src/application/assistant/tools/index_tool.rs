use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct IndexTool;

#[async_trait]
impl AssistantTool for IndexTool {
    fn name(&self) -> &str {
        "analyze_indexes"
    }

    fn description(&self) -> &str {
        "Analyze indexes for a table: list current indexes, find missing FK indexes, and suggest optimizations."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Table name to analyze"
                },
                "action": {
                    "type": "string",
                    "enum": ["list", "missing_fk_indexes", "suggest"],
                    "description": "Analysis action"
                }
            },
            "required": ["table", "action"]
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

        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("list");

        match action {
            "list" => {
                let indexes = driver.fetch_indexes(table, None).await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "table": table, "indexes": indexes })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "missing_fk_indexes" | "suggest" => {
                let indexes = driver.fetch_indexes(table, None).await?;
                let fks = driver.fetch_foreign_keys(table, None).await?;

                let indexed_columns: Vec<String> = indexes
                    .iter()
                    .flat_map(|idx| {
                        idx.get("column")
                            .or_else(|| idx.get("column_name"))
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect();

                let mut missing: Vec<String> = vec![];
                for fk in &fks {
                    let fk_col = fk
                        .get("columnName")
                        .or_else(|| fk.get("column_name"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    if !indexed_columns.contains(&fk_col.to_string()) && !fk_col.is_empty() {
                        missing.push(fk_col.to_string());
                    }
                }

                let suggestion = if missing.is_empty() {
                    "All foreign key columns are indexed.".to_string()
                } else {
                    format!("Missing indexes on FK columns: {}", missing.join(", "))
                };

                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({
                        "table": table,
                        "total_indexes": indexes.len(),
                        "indexes": indexes,
                        "missing_fk_indexes": missing,
                        "suggestion": suggestion,
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
