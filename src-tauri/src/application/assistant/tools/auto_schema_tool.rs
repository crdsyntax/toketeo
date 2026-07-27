use async_trait::async_trait;

use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct AutoSchemaTool;

#[async_trait]
impl AssistantTool for AutoSchemaTool {
    fn name(&self) -> &str {
        "auto_schema"
    }

    fn description(&self) -> &str {
        "Generate CREATE TABLE statements for a target dialect based on the current database schema."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Table name to generate CREATE TABLE for"
                },
                "target_dialect": {
                    "type": "string",
                    "enum": ["mysql", "postgres", "sqlite", "sqlserver", "mariadb"],
                    "description": "Target SQL dialect"
                }
            },
            "required": ["table", "target_dialect"]
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
        let target = args
            .get("target_dialect")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if table.is_empty() || target.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("'table' and 'target_dialect' are required.".to_string()),
            });
        }

        let columns = driver.fetch_columns(table, None).await?;
        let indexes = driver.fetch_indexes(table, None).await?;
        let fks = driver.fetch_foreign_keys(table, None).await?;
        let ddl = driver.fetch_ddl(table, "table", None).await.ok();

        let source_type = driver.db_type();

        let create_stmt = generate_create_table(
            table,
            &columns,
            &indexes,
            &fks,
            &source_type,
            target,
        );

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({
                "table": table,
                "targetDialect": target,
                "sourceDialect": source_type.to_string(),
                "ddl": create_stmt,
                "originalDdl": ddl,
            })),
            requires_confirmation: false,
            message: None,
        })
    }
}

fn generate_create_table(
    table: &str,
    columns: &[serde_json::Value],
    _indexes: &[serde_json::Value],
    fks: &[serde_json::Value],
    _source: &DbType,
    target: &str,
) -> String {
    let mut stmt = String::new();
    stmt.push_str(&format!("CREATE TABLE {} (\n", table));

    let mut col_defs: Vec<String> = Vec::new();
    for col in columns {
        let name = col.get("name").and_then(|v| v.as_str()).unwrap_or("?");
        let col_type = col.get("type").and_then(|v| v.as_str()).unwrap_or("TEXT");
        let nullable = col
            .get("isNullable")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let is_pk = col
            .get("isPrimaryKey")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let default = col
            .get("defaultValue")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let mapped = map_type(col_type, target);
        let mut def = format!("  {name} {mapped}");

        if !nullable {
            def.push_str(" NOT NULL");
        }
        if is_pk {
            def.push_str(" PRIMARY KEY");
        }
        if !default.is_empty() && !is_pk {
            def.push_str(&format!(" DEFAULT {default}"));
        }

        col_defs.push(def);
    }

    stmt.push_str(&col_defs.join(",\n"));

    // Add FK constraints
    for fk in fks {
        let fk_name = fk
            .get("constraintName")
            .or_else(|| fk.get("constraint_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("fk");
        let fk_col = fk
            .get("columnName")
            .or_else(|| fk.get("column_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ref_table = fk
            .get("referencedTable")
            .or_else(|| fk.get("referencedTableName"))
            .or_else(|| fk.get("referenced_table_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ref_col = fk
            .get("referencedColumn")
            .or_else(|| fk.get("referencedColumnName"))
            .or_else(|| fk.get("referenced_column_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if !fk_col.is_empty() && !ref_table.is_empty() {
            let idx_suffix = match target {
                "mysql" | "mariadb" => ",\n  INDEX idx_{fk_col} ({fk_col})",
                _ => "",
            };
            stmt.push_str(&format!(
                ",\n  CONSTRAINT {fk_name} FOREIGN KEY ({fk_col}) REFERENCES {ref_table}({ref_col}){idx_suffix}",
                fk_name = fk_name,
                fk_col = fk_col,
                ref_table = ref_table,
                ref_col = ref_col,
            ));
        }
    }

    stmt.push_str(&format!("\n);"));

    stmt
}

fn map_type(sql_type: &str, target: &str) -> String {
    let upper = sql_type.to_uppercase();
    match target {
        "postgres" => match upper.as_str() {
            t if t.contains("INT") && !t.contains("BIG") && !t.contains("SMALL") && !t.contains("TINY") => "INTEGER".to_string(),
            t if t.contains("TINYINT") || t.contains("BOOL") => "BOOLEAN".to_string(),
            t if t.contains("BIGINT") => "BIGINT".to_string(),
            t if t.contains("SMALLINT") => "SMALLINT".to_string(),
            t if t.contains("VARCHAR") => {
                let len = t.trim_start_matches("VARCHAR(").trim_end_matches(')').parse::<u32>().unwrap_or(255);
                if len > 8000 {
                    "TEXT".to_string()
                } else {
                    format!("VARCHAR({len})")
                }
            }
            t if t.contains("TEXT") || t.contains("LONGTEXT") || t.contains("MEDIUMTEXT") => "TEXT".to_string(),
            t if t.contains("DATETIME") || t.contains("TIMESTAMP") => "TIMESTAMP".to_string(),
            t if t.contains("BLOB") || t.contains("LONGBLOB") || t.contains("MEDIUMBLOB") => "BYTEA".to_string(),
            t if t.contains("FLOAT") || t.contains("DOUBLE") => "DOUBLE PRECISION".to_string(),
            t if t.contains("DECIMAL") || t.contains("NUMERIC") => {
                let inner = t.trim_start_matches("DECIMAL(").trim_start_matches("NUMERIC(");
                if inner.contains(')') {
                    let parts = inner.trim_end_matches(')').split(',').collect::<Vec<_>>();
                    if parts.len() == 2 {
                        format!("NUMERIC({},{})", parts[0].trim(), parts[1].trim())
                    } else {
                        format!("NUMERIC({})", parts[0].trim())
                    }
                } else {
                    "NUMERIC".to_string()
                }
            }
            _ => sql_type.to_string(),
        },
        "sqlite" => match upper.as_str() {
            t if t.contains("INT") => "INTEGER".to_string(),
            t if t.contains("VARCHAR") || t.contains("TEXT") || t.contains("CHAR") => "TEXT".to_string(),
            t if t.contains("BLOB") || t.contains("LONGBLOB") || t.contains("MEDIUMBLOB") => "BLOB".to_string(),
            t if t.contains("FLOAT") || t.contains("DOUBLE") || t.contains("DECIMAL") => "REAL".to_string(),
            t if t.contains("DATETIME") || t.contains("TIMESTAMP") => "TEXT".to_string(),
            _ => sql_type.to_string(),
        },
        "sqlserver" => match upper.as_str() {
            t if t.contains("TINYINT") => "TINYINT".to_string(),
            t if t.contains("BIGINT") => "BIGINT".to_string(),
            t if t.contains("SMALLINT") => "SMALLINT".to_string(),
            t if t.contains("INT") => "INT".to_string(),
            t if t.contains("VARCHAR") => sql_type.to_string(),
            t if t.contains("TEXT") || t.contains("LONGTEXT") || t.contains("MEDIUMTEXT") => "NVARCHAR(MAX)".to_string(),
            t if t.contains("DATETIME") || t.contains("TIMESTAMP") => "DATETIME2".to_string(),
            t if t.contains("BLOB") || t.contains("LONGBLOB") => "VARBINARY(MAX)".to_string(),
            t if t.contains("FLOAT") || t.contains("DOUBLE") => "FLOAT".to_string(),
            t if t.contains("DECIMAL") || t.contains("NUMERIC") => sql_type.to_string(),
            _ => sql_type.to_string(),
        },
        // mysql / mariadb — keep original
        _ => sql_type.to_string(),
    }
}
