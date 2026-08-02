use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::DumpSelection;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Backup and restore databases. SQL engines: 'dump' (schema to file) and
/// 'restore' (from a dump file, requires confirmation). MongoDB: 'mongoBackup'
/// and 'mongoRestore' (JSON file, restore requires confirmation).
pub struct BackupTool;

#[async_trait]
impl AssistantTool for BackupTool {
    fn name(&self) -> &str {
        "backup"
    }

    fn description(&self) -> &str {
        "Backup and restore databases. 'dump': export schema to a file (connection_id, schema, file_path, optional tables). 'restore': restore a database from a dump file (destructive — requires confirmation). 'mongoBackup': export a MongoDB database to a JSON file (connection_id, database, file_path). 'mongoRestore': import a MongoDB JSON backup (destructive)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["dump", "restore", "mongoBackup", "mongoRestore"],
                    "description": "Operation"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID"
                },
                "schema": {
                    "type": "string",
                    "description": "Schema name to back up"
                },
                "database": {
                    "type": "string",
                    "description": "Database name (MongoDB operations)"
                },
                "file_path": {
                    "type": "string",
                    "description": "Full path for the backup file"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Table names to include in dump/restore (all if omitted)"
                }
            },
            "required": ["connection_id", "file_path"]
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
            .unwrap_or("dump");
        let connection_id = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if connection_id.is_empty() || file_path.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("connection_id and file_path are required.".to_string()),
            });
        }

        let tables: Vec<String> = args
            .get("tables")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        match action {
            "dump" => {
                let schema = args
                    .get("schema")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if schema.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'schema' is required for dump.".to_string()),
                    });
                }
                let selection = DumpSelection {
                    tables,
                    views: vec![],
                    triggers: vec![],
                    procedures: vec![],
                    functions: vec![],
                };
                match ExplorerService::dump_schema(
                    state,
                    connection_id,
                    schema,
                    &selection,
                    file_path,
                )
                .await
                {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "filePath": file_path })),
                        requires_confirmation: false,
                        message: Some(format!("Schema backed up to {file_path}")),
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "restore" => {
                let schema = args
                    .get("schema")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match ExplorerService::restore_database_selected(
                    state,
                    connection_id,
                    file_path,
                    &tables,
                    schema,
                )
                .await
                {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "filePath": file_path })),
                        requires_confirmation: false,
                        message: Some("Database restored.".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "mongoBackup" => {
                let database = args
                    .get("database")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if database.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'database' is required for mongoBackup.".to_string()),
                    });
                }
                match mongo_backup(state, connection_id, database, file_path).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "filePath": file_path })),
                        requires_confirmation: false,
                        message: Some(format!("MongoDB backup written to {file_path}")),
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "mongoRestore" => {
                let database = args
                    .get("database")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if database.is_empty() {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'database' is required for mongoRestore.".to_string()),
                    });
                }
                match mongo_restore(state, connection_id, database, file_path).await {
                    Ok(total) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "documentsRestored": total })),
                        requires_confirmation: false,
                        message: Some(format!("Restored {total} documents.")),
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
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

/// Export every collection of a MongoDB database to a JSON file.
async fn mongo_backup(
    state: &AppState,
    connection_id: &str,
    db_name: &str,
    file_path: &str,
) -> AppResult<()> {
    let driver = state.get_connection(connection_id).await?;
    let collections = driver.fetch_tables(Some(db_name.to_string()), None).await?;

    let mut output = serde_json::Map::new();
    output.insert(
        "database".into(),
        serde_json::Value::String(db_name.to_string()),
    );
    output.insert(
        "exportedAt".into(),
        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
    );

    let mut colls = serde_json::Map::new();
    for collection in &collections {
        let query = serde_json::json!({
            "collection": collection,
            "database": db_name,
            "find": {},
            "limit": 0,
        })
        .to_string();
        match driver.execute(&query).await {
            Ok(result) => {
                colls.insert(collection.clone(), serde_json::Value::Array(result.rows));
            }
            Err(e) => {
                colls.insert(
                    collection.clone(),
                    serde_json::Value::String(format!("__error__: {e}")),
                );
            }
        }
    }
    output.insert("collections".into(), serde_json::Value::Object(colls));

    let json = serde_json::to_string_pretty(&output).unwrap_or_default();
    std::fs::write(file_path, &json)
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to write backup: {e}")))
}

/// Import a MongoDB JSON backup into a database.
async fn mongo_restore(
    state: &AppState,
    connection_id: &str,
    db_name: &str,
    file_path: &str,
) -> AppResult<u64> {
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to read backup file: {e}")))?;
    let backup: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| crate::error::AppError::Validation(format!("Invalid backup JSON: {e}")))?;

    let collections = backup
        .get("collections")
        .and_then(|c| c.as_object())
        .ok_or_else(|| {
            crate::error::AppError::Validation("Invalid backup format: missing 'collections'".into())
        })?;

    let driver = state.get_connection(connection_id).await?;
    let mut total = 0u64;
    for (coll_name, docs) in collections {
        let Some(docs_arr) = docs.as_array() else {
            continue;
        };
        if docs_arr.is_empty() {
            continue;
        }
        let insert_cmd = serde_json::json!({
            "insert": coll_name,
            "database": db_name,
            "documents": docs_arr,
            "ordered": false,
        })
        .to_string();
        match driver.execute(&insert_cmd).await {
            Ok(_) => total += docs_arr.len() as u64,
            Err(e) => {
                tracing::error!("[mongo_restore] Error inserting into {}: {}", coll_name, e);
            }
        }
    }
    Ok(total)
}
