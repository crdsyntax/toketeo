use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Read-only exploration of database metadata: databases, schemas, tables,
/// views, procedures, triggers, functions, columns, indexes, foreign keys,
/// constraints, DDL, row preview and the connection's database type.
pub struct ExplorerTool;

#[async_trait]
impl AssistantTool for ExplorerTool {
    fn name(&self) -> &str {
        "explorer"
    }

    fn description(&self) -> &str {
        "Explore database metadata (read-only): databases, schemas, tables, views, procedures, triggers, functions, columns, indexes, foreign keys, constraints, DDL, row preview, db type."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["dbType", "databases", "schemas", "tables", "views", "procedures", "triggers", "functions", "columns", "indexes", "foreignKeys", "constraints", "ddl", "preview"],
                    "description": "Metadata to fetch. 'preview' returns up to 100 rows of a table."
                },
                "object": {
                    "type": "string",
                    "description": "Object name (table/view/procedure/function/trigger) — required for columns, indexes, foreignKeys, constraints, ddl, preview"
                },
                "schema": {
                    "type": "string",
                    "description": "Optional schema/database name (defaults to the connection's configured database)"
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
                    message: Some(
                        "No database connection available. Provide connection_id.".to_string(),
                    ),
                })
            }
        };

        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("tables");
        let schema = args
            .get("schema")
            .and_then(|v| v.as_str())
            .map(String::from);

        match action {
            "dbType" => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({ "dbType": driver.db_type().to_string() })),
                requires_confirmation: false,
                message: None,
            }),
            "databases" => {
                let dbs = driver.fetch_databases().await?;
                Ok(success(serde_json::json!({ "databases": dbs })))
            }
            "schemas" => {
                let s = driver.fetch_schemas().await?;
                Ok(success(serde_json::json!({ "schemas": s })))
            }
            "tables" => {
                let t = driver.fetch_tables(schema.clone(), None).await?;
                Ok(success(serde_json::json!({ "tables": t })))
            }
            "views" => {
                let v = driver.fetch_views(schema.clone(), None).await?;
                Ok(success(serde_json::json!({ "views": v })))
            }
            "procedures" => {
                let p = driver.fetch_procedures(schema.clone(), None).await?;
                Ok(success(serde_json::json!({ "procedures": p })))
            }
            "triggers" => {
                let t = driver.fetch_triggers(schema.clone(), None).await?;
                Ok(success(serde_json::json!({ "triggers": t })))
            }
            "functions" => {
                let f = driver.fetch_functions(schema.clone(), None).await?;
                Ok(success(serde_json::json!({ "functions": f })))
            }
            "columns" => {
                let object = required_object(&args)?;
                let c = driver.fetch_columns(&object, schema).await?;
                Ok(success(
                    serde_json::json!({ "table": object, "columns": c }),
                ))
            }
            "indexes" => {
                let object = required_object(&args)?;
                let i = driver.fetch_indexes(&object, schema).await?;
                Ok(success(
                    serde_json::json!({ "table": object, "indexes": i }),
                ))
            }
            "foreignKeys" => {
                let object = required_object(&args)?;
                let fk = driver.fetch_foreign_keys(&object, schema).await?;
                Ok(success(
                    serde_json::json!({ "table": object, "foreignKeys": fk }),
                ))
            }
            "constraints" => {
                let object = required_object(&args)?;
                let c = driver.fetch_constraints(&object, schema).await?;
                Ok(success(
                    serde_json::json!({ "table": object, "constraints": c }),
                ))
            }
            "ddl" => {
                let object = required_object(&args)?;
                let ddl = driver.fetch_ddl(&object, "table", schema).await?;
                Ok(success(serde_json::json!({ "object": object, "ddl": ddl })))
            }
            "preview" => {
                let object = required_object(&args)?;
                let columns = driver.fetch_columns(&object, schema.clone()).await?;
                let col_names: Vec<String> = columns
                    .iter()
                    .filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(String::from))
                    .collect();
                let query = format!("SELECT {} FROM {} LIMIT 100", col_names.join(", "), object);
                let result = driver.execute(&query).await?;
                Ok(success(serde_json::json!({
                    "table": object,
                    "columns": col_names,
                    "rows": result.rows,
                })))
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

fn required_object(args: &serde_json::Value) -> AppResult<String> {
    args.get("object")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .ok_or_else(|| {
            crate::error::AppError::Validation("'object' is required for this action".to_string())
        })
}

fn success(data: serde_json::Value) -> ToolResult {
    ToolResult {
        ok: true,
        data: Some(data),
        requires_confirmation: false,
        message: None,
    }
}
