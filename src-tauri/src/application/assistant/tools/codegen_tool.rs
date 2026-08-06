use async_trait::async_trait;

use crate::application::model_generator_service::ModelGeneratorService;
use crate::application::sql_generator_service::SqlGeneratorService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct CodegenTool;

#[async_trait]
impl AssistantTool for CodegenTool {
    fn name(&self) -> &str {
        "codegen"
    }

    fn description(&self) -> &str {
        "Generate SQL statements or ORM model code from a table schema."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["sql_select", "sql_insert", "sql_update", "sql_delete", "sql_safe_delete", "model_mongoose", "model_typeorm", "model_prisma", "model_sequelize"],
                    "description": "Type of code to generate"
                },
                "table": {
                    "type": "string",
                    "description": "Table name"
                },
                "columns": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Column names (for SELECT/INSERT/UPDATE)"
                }
            },
            "required": ["action", "table"]
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

        let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("");
        let table = args.get("table").and_then(|v| v.as_str()).unwrap_or("");

        if table.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("'table' is required.".to_string()),
            });
        }

        if action.starts_with("model_") {
            return self.generate_model(action, table, driver).await;
        }

        self.generate_sql(action, table, &args, driver).await
    }
}

impl CodegenTool {
    async fn generate_sql(
        &self,
        action: &str,
        table: &str,
        args: &serde_json::Value,
        driver: &dyn DbDriver,
    ) -> AppResult<ToolResult> {
        let columns_raw = driver.fetch_columns(table, None).await?;
        let pk_column = columns_raw
            .iter()
            .find(|c| {
                c.get("isPrimaryKey")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .and_then(|c| c.get("name").and_then(|v| v.as_str()))
            .unwrap_or("id");

        let columns: Vec<String> = args
            .get("columns")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_else(|| {
                columns_raw
                    .iter()
                    .filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(String::from))
                    .collect()
            });

        let db_type = driver.db_type();
        let fake_row = crate::models::RowContext {
            schema: None,
            table: table.to_string(),
            primary_keys: {
                let mut m = std::collections::HashMap::new();
                m.insert(pk_column.to_string(), serde_json::json!(1));
                m
            },
            data: columns
                .iter()
                .map(|c| (c.clone(), serde_json::json!("?")))
                .collect(),
        };

        let sql = match action {
            "sql_select" => SqlGeneratorService::generate_select(db_type, &fake_row),
            "sql_insert" => SqlGeneratorService::generate_insert(db_type, &fake_row),
            "sql_update" => SqlGeneratorService::generate_update(db_type, &fake_row),
            "sql_delete" => SqlGeneratorService::generate_delete(db_type, &fake_row),
            "sql_safe_delete" => {
                let refs = driver.fetch_referenced_by_keys(table, None).await?;
                SqlGeneratorService::generate_safe_delete(db_type, table, None, &refs)
            }
            other => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Unknown SQL action: {other}")),
                })
            }
        };

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({ "sql": sql, "table": table, "action": action })),
            requires_confirmation: false,
            message: None,
        })
    }

    async fn generate_model(
        &self,
        action: &str,
        table: &str,
        driver: &dyn DbDriver,
    ) -> AppResult<ToolResult> {
        let columns = driver.fetch_columns(table, None).await?;

        let framework = match action {
            "model_mongoose" => "mongoose",
            "model_typeorm" => "typeorm",
            "model_prisma" => "prisma",
            "model_sequelize" => "sequelize",
            other => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Unknown model framework: {other}")),
                })
            }
        };

        let code = ModelGeneratorService::generate_model(framework, table, &columns)?;

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({ "code": code, "framework": framework, "table": table })),
            requires_confirmation: false,
            message: None,
        })
    }
}
