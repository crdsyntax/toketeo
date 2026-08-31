use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::db::{quote_identifier, DbDriver, DbType};
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct DdlTool;

#[async_trait]
impl AssistantTool for DdlTool {
    fn name(&self) -> &str {
        "ddl"
    }

    fn description(&self) -> &str {
        "Schema changes (requires confirmation): 'update' (replace object DDL), 'dropColumn', 'dropIndex', 'renameIndex', 'dropForeignKey', 'dropConstraint', 'createDatabase', 'dropDatabase', 'createSchema', 'dropSchema', 'createCollection'."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["update", "dropColumn", "dropIndex", "renameIndex", "dropForeignKey", "dropConstraint", "createDatabase", "dropDatabase", "createSchema", "dropSchema", "createCollection"],
                    "description": "DDL operation"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID"
                },
                "object": {
                    "type": "string",
                    "description": "Object name (column/index/constraint/database/schema/collection depending on action)"
                },
                "table": {
                    "type": "string",
                    "description": "Table name (required for dropColumn, dropIndex, dropForeignKey, dropConstraint)"
                },
                "object_type": {
                    "type": "string",
                    "description": "Object type for 'update' (table/view/procedure/function/trigger)"
                },
                "new_name": {
                    "type": "string",
                    "description": "New name for 'renameIndex'"
                },
                "sql": {
                    "type": "string",
                    "description": "DDL SQL for 'update'"
                },
                "schema": {
                    "type": "string",
                    "description": "Optional schema"
                }
            },
            "required": ["action", "connection_id"]
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
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("update");
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if cid.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("connection_id is required.".to_string()),
            });
        }

        let obj = args.get("object").and_then(|v| v.as_str()).unwrap_or("");
        let table = args.get("table").and_then(|v| v.as_str()).unwrap_or("");
        let schema = args
            .get("schema")
            .and_then(|v| v.as_str())
            .map(String::from);
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
        let db_type = driver.db_type();
        drop(driver);

        let sql = match action {
            "update" => {
                let sql = args.get("sql").and_then(|v| v.as_str()).unwrap_or("");
                if sql.is_empty() {
                    return missing("'sql' is required for update");
                }
                sql.to_string()
            }
            "dropColumn" => format!(
                "ALTER TABLE {} DROP COLUMN {}",
                quote_identifier(&db_type, table),
                quote_identifier(&db_type, obj)
            ),
            "dropIndex" => match db_type {
                DbType::Postgres => format!("DROP INDEX {}", quote_identifier(&db_type, obj)),
                _ => format!(
                    "ALTER TABLE {} DROP INDEX {}",
                    quote_identifier(&db_type, table),
                    quote_identifier(&db_type, obj)
                ),
            },
            "renameIndex" => {
                let new_name = args.get("new_name").and_then(|v| v.as_str()).unwrap_or("");
                if new_name.is_empty() {
                    return missing("'new_name' is required for renameIndex");
                }
                match db_type {
                    DbType::Postgres => format!(
                        "ALTER INDEX {} RENAME TO {}",
                        quote_identifier(&db_type, obj),
                        quote_identifier(&db_type, new_name)
                    ),
                    DbType::Mysql | DbType::Mariadb => format!(
                        "ALTER TABLE {} RENAME INDEX {} TO {}",
                        quote_identifier(&db_type, table),
                        quote_identifier(&db_type, obj),
                        quote_identifier(&db_type, new_name)
                    ),
                    _ => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(format!("Rename index not supported for {db_type}")),
                        })
                    }
                }
            }
            "dropForeignKey" => match db_type {
                DbType::Postgres => format!(
                    "ALTER TABLE {} DROP CONSTRAINT {}",
                    quote_identifier(&db_type, table),
                    quote_identifier(&db_type, obj)
                ),
                _ => format!(
                    "ALTER TABLE {} DROP FOREIGN KEY {}",
                    quote_identifier(&db_type, table),
                    quote_identifier(&db_type, obj)
                ),
            },
            "dropConstraint" => format!(
                "ALTER TABLE {} DROP CONSTRAINT {}",
                quote_identifier(&db_type, table),
                quote_identifier(&db_type, obj)
            ),
            "createDatabase" => create_database_sql(&db_type, obj),
            "dropDatabase" => drop_database_sql(&db_type, obj),
            "createSchema" => {
                if db_type != DbType::Postgres {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!(
                            "createSchema is only supported for Postgres (got {db_type})"
                        )),
                    });
                }
                format!("CREATE SCHEMA {}", quote_identifier(&db_type, obj))
            }
            "dropSchema" => {
                if db_type != DbType::Postgres {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!(
                            "dropSchema is only supported for Postgres (got {db_type})"
                        )),
                    });
                }
                format!("DROP SCHEMA {}", quote_identifier(&db_type, obj))
            }
            "createCollection" => {
                if db_type != DbType::Mongodb {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!(
                            "createCollection is only supported for MongoDB (got {db_type})"
                        )),
                    });
                }
                serde_json::json!({ "create": obj }).to_string()
            }
            other => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Unknown action: {other}")),
                })
            }
        };

        if sql.is_empty() {
            return missing("Incomplete arguments for the requested action");
        }

        let result =
            ExplorerService::execute_query_with_origin(state, cid, &sql, schema, "assistant").await;
        match result {
            Ok(r) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({
                    "sql": sql,
                    "rowsAffected": r.rows_affected,
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

fn missing(msg: &str) -> AppResult<ToolResult> {
    Ok(ToolResult {
        ok: false,
        data: None,
        requires_confirmation: false,
        message: Some(msg.to_string()),
    })
}

fn create_database_sql(db_type: &DbType, name: &str) -> String {
    match db_type {
        DbType::Mongodb => serde_json::json!({ "create": "_init_", "database": name }).to_string(),
        DbType::Postgres => format!("CREATE DATABASE {}", quote_identifier(db_type, name)),
        DbType::Sqlserver => format!("CREATE DATABASE [{}]", name.replace(']', "]]")),
        _ => format!("CREATE DATABASE `{}`", name.replace('`', "``")),
    }
}

fn drop_database_sql(db_type: &DbType, name: &str) -> String {
    match db_type {
        DbType::Mongodb => serde_json::json!({ "dropDatabase": 1 }).to_string(),
        DbType::Postgres => format!("DROP DATABASE {}", quote_identifier(db_type, name)),
        DbType::Sqlserver => format!("DROP DATABASE [{}]", name.replace(']', "]]")),
        _ => format!("DROP DATABASE `{}`", name.replace('`', "``")),
    }
}
