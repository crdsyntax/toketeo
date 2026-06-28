use crate::application::audit_service::AuditService;
use crate::application::connection_service::ConnectionService;
use crate::application::explorer_service::ExplorerService;
use crate::application::sql_generator_service::SqlGeneratorService;
use crate::application::model_generator_service::ModelGeneratorService;
use crate::application::sync::sync_service::SyncService;
use crate::application::sync::strategies::SyncEvent;
use crate::error::{AppError, AppResult};
use crate::infrastructure::scheduler::job_engine;
use crate::models::sync::{SyncBatch, SyncCheckpoint, SyncPipeline, SyncRun, SyncRowError};
use crate::models::{CellUpdateInput, DbConnectionConfig, QueryResult, RowContext, JobType, ScheduledJob};
use crate::state::AppState;
use std::sync::Arc;
use std::process::Command;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

#[tauri::command]
pub async fn generate_sql(
    id: String,
    action: String,
    context: RowContext,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();

    match action.to_lowercase().as_str() {
        "select" => Ok(SqlGeneratorService::generate_select(db_type, &context)),
        "update" => Ok(SqlGeneratorService::generate_update(db_type, &context)),
        "insert" => Ok(SqlGeneratorService::generate_insert(db_type, &context)),
        "delete" => Ok(SqlGeneratorService::generate_delete(db_type, &context)),
        _ => Err(AppError::Validation("Invalid action".into())),
    }
}

#[tauri::command]
pub async fn generate_model(
    id: String,
    framework: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let columns = ExplorerService::get_columns(&state, &id, &table, schema).await?;
    ModelGeneratorService::generate_model(&framework, &table, &columns)
}

#[tauri::command]
pub async fn get_table_sizes(
    id: String,
    schema: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<Vec<serde_json::Value>>> {
    let sizes = ExplorerService::get_table_sizes(&state, &id, &schema).await?;
    Ok(sizes
        .into_iter()
        .map(|(name, size)| {
            vec![
                serde_json::Value::String(name),
                serde_json::Value::Number(serde_json::Number::from(size)),
            ]
        })
        .collect())
}

#[tauri::command]
pub async fn open_in_file_manager(
    path: String,
) -> AppResult<()> {
    let parent = std::path::Path::new(&path)
        .parent()
        .ok_or_else(|| AppError::Internal("Invalid file path".into()))?;

    let status = {
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open").arg(parent).status()
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg(parent).status()
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer").arg(parent).status()
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "unsupported platform"))
        }
    };

    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err(AppError::Internal("Failed to open file manager".into())),
    }
}

#[tauri::command]
pub async fn get_db_type(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<crate::db::DbType> {
    let driver = state.get_connection(&id).await?;
    Ok(driver.db_type())
}

#[tauri::command]
pub async fn update_cell(
    id: String,
    input: CellUpdateInput,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    let driver = state.get_connection(&id).await?;
    let sql = SqlGeneratorService::generate_cell_update(driver.db_type(), &input)?;
    ExplorerService::execute_query(&state, &id, &sql, None).await
}

#[tauri::command]
pub async fn save_connection(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    ConnectionService::save_connection(&state, config).await
}

#[tauri::command]
pub async fn get_connections(state: State<'_, AppState>) -> AppResult<Vec<DbConnectionConfig>> {
    ConnectionService::get_connections(&state).await
}

#[tauri::command]
pub async fn get_connection(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<DbConnectionConfig> {
    ConnectionService::get_connection(&state, &id).await
}

#[tauri::command]
pub async fn delete_connection(id: String, state: State<'_, AppState>) -> AppResult<()> {
    ConnectionService::delete_connection(&state, &id).await
}

#[tauri::command]
pub async fn connect(config: DbConnectionConfig, state: State<'_, AppState>) -> AppResult<String> {
    ConnectionService::connect(&state, config).await
}

#[tauri::command]
pub async fn disconnect(id: String, state: State<'_, AppState>) -> AppResult<()> {
    ConnectionService::disconnect(&state, &id).await
}

#[tauri::command]
pub async fn disconnect_all(state: State<'_, AppState>) -> AppResult<()> {
    ConnectionService::disconnect_all(&state).await
}

#[tauri::command]
pub async fn export_connection(
    id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ConnectionService::export_connection(&state, &id, &file_path).await
}

#[tauri::command]
pub async fn export_all_connections(
    file_path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ConnectionService::export_all_connections(&state, &file_path).await
}

#[tauri::command]
pub async fn import_connections(
    file_path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ConnectionService::import_connections(&state, &file_path).await
}

#[tauri::command]
pub async fn export_connection_dialog(
    id: String,
    default_file_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Export connection")
        .set_file_name(default_file_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let file_path = path.display().to_string();
    ConnectionService::export_connection(&state, &id, &file_path).await?;
    Ok(Some(file_path))
}

#[tauri::command]
pub async fn open_file_dialog(
    filter_name: Option<String>,
    filter_ext: Option<String>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let mut dialog = app_handle
        .dialog()
        .file()
        .set_title("Open File");

    if let (Some(name), Some(ext)) = (filter_name, filter_ext) {
        dialog = dialog.add_filter(name, &[&ext]);
    }

    dialog = dialog.add_filter("All Files", &["*"]);

    let file_path = dialog.blocking_pick_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("Failed to read file: {}", e)))?;

    Ok(Some(content))
}

#[tauri::command]
pub async fn save_file_dialog(
    content: String,
    default_file_name: String,
    filter_name: Option<String>,
    filter_ext: Option<String>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let mut dialog = app_handle
        .dialog()
        .file()
        .set_title("Save File")
        .set_file_name(default_file_name);
        
    if let (Some(name), Some(ext)) = (filter_name, filter_ext) {
        dialog = dialog.add_filter(name, &[&ext]);
    }
    
    dialog = dialog.add_filter("All Files", &["*"]);

    let file_path = dialog.blocking_save_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    std::fs::write(&path, content).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub async fn export_all_connections_dialog(
    default_file_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Export all connections")
        .set_file_name(default_file_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let file_path = path.display().to_string();
    ConnectionService::export_all_connections(&state, &file_path).await?;
    Ok(Some(file_path))
}

#[tauri::command]
pub async fn import_connections_dialog(
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Vec<String>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Import connections")
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(Vec::new()),
    };

    let file_path = path.display().to_string();
    ConnectionService::import_connections(&state, &file_path).await
}

#[tauri::command]
pub async fn execute_query(
    id: String,
    query: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    ExplorerService::execute_query(&state, &id, &query, schema).await
}

#[tauri::command]
pub async fn get_schemas(id: String, state: State<'_, AppState>) -> AppResult<Vec<String>> {
    ExplorerService::get_schemas(&state, &id).await
}

#[tauri::command]
pub async fn get_databases(id: String, state: State<'_, AppState>) -> AppResult<Vec<String>> {
    ExplorerService::get_databases(&state, &id).await
}

#[tauri::command]
pub async fn diagnose_connection(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    ConnectionService::diagnose_connection(&state, &id).await
}

#[tauri::command]
pub async fn switch_database(
    id: String,
    new_db: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ConnectionService::switch_database(&state, &id, &new_db).await
}

#[tauri::command]
pub async fn get_tables(
    id: String,
    schema: Option<String>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_tables(&state, &id, schema, filter).await
}

#[tauri::command]
pub async fn get_views(
    id: String,
    schema: Option<String>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_views(&state, &id, schema, filter).await
}

#[tauri::command]
pub async fn get_procedures(
    id: String,
    schema: Option<String>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_procedures(&state, &id, schema, filter).await
}

#[tauri::command]
pub async fn get_triggers(
    id: String,
    schema: Option<String>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_triggers(&state, &id, schema, filter).await
}

#[tauri::command]
pub async fn get_functions(
    id: String,
    schema: Option<String>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_functions(&state, &id, schema, filter).await
}

#[tauri::command]
pub async fn get_columns(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    ExplorerService::get_columns(&state, &id, &table, schema).await
}

#[tauri::command]
pub async fn get_indexes(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    ExplorerService::get_indexes(&state, &id, &table, schema).await
}

#[tauri::command]
pub async fn get_foreign_keys(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    ExplorerService::get_foreign_keys(&state, &id, &table, schema).await
}

#[tauri::command]
pub async fn get_constraints(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    ExplorerService::get_constraints(&state, &id, &table, schema).await
}

#[tauri::command]
pub async fn get_ddl(
    id: String,
    name: String,
    object_type: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    ExplorerService::get_ddl(&state, &id, &name, &object_type, schema).await
}

#[tauri::command]
pub async fn get_parameters(
    id: String,
    name: String,
    object_type: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    ExplorerService::get_parameters(&state, &id, &name, &object_type, schema).await
}

#[tauri::command]
pub async fn update_ddl(
    id: String,
    name: String,
    object_type: String,
    sql: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    let start = std::time::Instant::now();

    let final_sql = if let Some(ref s) = schema {
        match db_type {
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => {
                format!("USE {};\n{}", quote_identifier(&db_type, s), sql)
            }
            crate::db::DbType::Postgres => {
                driver
                    .execute(&format!("SET search_path TO {};", quote_identifier(&db_type, s)))
                    .await?;
                sql
            }
            _ => sql,
        }
    } else {
        sql
    };

    let result = driver.execute(&final_sql).await;

    // Log the DDL update in audit
    let status = if result.is_ok() { "success" } else { "error" };
    let error_msg = result.as_ref().err().map(|e| e.to_string());

    let _ = AuditService::log_query(
        &state,
        id.clone(),
        format!("UPDATE DDL ({} {}): {}", object_type, name, final_sql),
        start.elapsed().as_millis() as u64,
        status.to_string(),
        error_msg,
    )
    .await;

    if result.is_ok() {
        ExplorerService::invalidate_metadata_cache(&state, &id, &name, schema.as_deref()).await;
    }

    result.map(|_| ())
}

#[tauri::command]
pub async fn commit_transaction(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.commit_transaction(&id).await
}

#[tauri::command]
pub async fn rollback_transaction(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.rollback_transaction(&id).await
}

#[tauri::command]
pub async fn edit_column(
    id: String,
    _table: String,
    sql: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

fn quote_identifier(db_type: &crate::db::DbType, name: &str) -> String {
    match db_type {
        crate::db::DbType::Postgres => crate::db::postgres::quote_pg(name),
        crate::db::DbType::Mysql | crate::db::DbType::Mariadb => crate::db::mysql::quote_mysql(name),
        crate::db::DbType::Sqlserver => crate::db::sqlserver::quote_ss(name),
        _ => name.to_string(),
    }
}

#[tauri::command]
pub async fn drop_column(
    id: String,
    table: String,
    column: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = format!("ALTER TABLE {} DROP COLUMN {}",
        quote_identifier(&db_type, &table),
        quote_identifier(&db_type, &column));
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn drop_index(
    id: String,
    table: String,
    index: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = match db_type {
        crate::db::DbType::Postgres => format!("DROP INDEX {}", quote_identifier(&db_type, &index)),
        _ => format!("ALTER TABLE {} DROP INDEX {}",
            quote_identifier(&db_type, &table),
            quote_identifier(&db_type, &index)),
    };
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn rename_index(
    id: String,
    table: String,
    old_name: String,
    new_name: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = match db_type {
        crate::db::DbType::Postgres => format!("ALTER INDEX {} RENAME TO {}",
            quote_identifier(&db_type, &old_name),
            quote_identifier(&db_type, &new_name)),
        crate::db::DbType::Mysql | crate::db::DbType::Mariadb => format!("ALTER TABLE {} RENAME INDEX {} TO {}",
            quote_identifier(&db_type, &table),
            quote_identifier(&db_type, &old_name),
            quote_identifier(&db_type, &new_name)),
        _ => return Err(crate::error::AppError::Validation(format!("Rename index not supported for {:?}", db_type))),
    };
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn drop_foreign_key(
    id: String,
    table: String,
    constraint: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = match db_type {
        crate::db::DbType::Postgres => format!("ALTER TABLE {} DROP CONSTRAINT {}",
            quote_identifier(&db_type, &table),
            quote_identifier(&db_type, &constraint)),
        _ => format!("ALTER TABLE {} DROP FOREIGN KEY {}",
            quote_identifier(&db_type, &table),
            quote_identifier(&db_type, &constraint)),
    };
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn drop_constraint(
    id: String,
    table: String,
    constraint: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = format!("ALTER TABLE {} DROP CONSTRAINT {}",
        quote_identifier(&db_type, &table),
        quote_identifier(&db_type, &constraint));
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn rename_foreign_key(
    id: String,
    table: String,
    old_name: String,
    new_name: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    drop(driver);
    let sql = match db_type {
        crate::db::DbType::Postgres => format!("ALTER TABLE {} RENAME CONSTRAINT {} TO {}",
            quote_identifier(&db_type, &table),
            quote_identifier(&db_type, &old_name),
            quote_identifier(&db_type, &new_name)),
        _ => return Err(crate::error::AppError::Validation(format!("Rename constraint not supported for {:?}", db_type))),
    };
    ExplorerService::execute_query(&state, &id, &sql, schema)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn execute_explorer(
    id: String,
    database: Option<String>,
    name: String,
    object_type: String,
    page: Option<u32>,
    page_size: Option<u32>,
    filter: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    let page = page.unwrap_or(0);
    let page_size = page_size.unwrap_or(50);
    ExplorerService::execute_explorer(
        &state,
        &id,
        database,
        &name,
        object_type,
        page,
        page_size,
        filter,
    )
    .await
}

#[tauri::command]
pub async fn get_audit_logs(
    limit: u32,
    offset: u32,
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::application::audit_service::AuditEntry>> {
    crate::application::audit_service::AuditService::get_logs(&state, limit, offset).await
}

#[tauri::command]
pub async fn switch_schema(
    id: String,
    schema: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ExplorerService::switch_schema(&state, &id, schema).await
}

#[tauri::command]
pub async fn get_mongo_structure(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    ExplorerService::get_mongo_structure(&state, &id).await
}

#[tauri::command]
pub async fn dump_schema_dialog(
    id: String,
    schema: String,
    selection: crate::models::DumpSelection,
    default_file_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Option<serde_json::Value>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Save schema dump")
        .set_file_name(default_file_name)
        .add_filter("SQL Files", &["sql"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let file_path = path.display().to_string();

    let total_tables = selection.tables.len()
        + selection.views.len()
        + selection.triggers.len()
        + selection.procedures.len()
        + selection.functions.len();

    ExplorerService::dump_schema(&state, &id, &schema, &selection, &file_path).await?;

    let integrity = ExplorerService::verify_dump_integrity(&file_path, total_tables)?;

    Ok(Some(serde_json::json!({
        "filePath": file_path,
        "integrity": integrity,
    })))
}

#[tauri::command]
pub async fn get_schema_diagram_data(
    id: String,
    schema: String,
    table_names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    ExplorerService::get_schema_diagram_data(&state, &id, &schema, table_names).await
}

#[tauri::command]
pub async fn pick_and_parse_dump_file(
    app_handle: AppHandle,
) -> AppResult<Option<serde_json::Value>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Select SQL dump file to restore")
        .add_filter("SQL Files", &["sql"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    let path = match file_path {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let file_path_str = path.display().to_string();
    let content = std::fs::read_to_string(&file_path_str)
        .map_err(|e| AppError::Internal(format!("Failed to read dump file: {}", e)))?;

    let tables = ExplorerService::parse_dump_tables(&content);

    Ok(Some(serde_json::json!({
        "filePath": file_path_str,
        "tables": tables,
    })))
}

#[tauri::command]
pub async fn restore_database_selected(
    id: String,
    schema: String,
    file_path: String,
    tables: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();
    if matches!(db_type, crate::db::DbType::Postgres) {
        driver.execute(&format!("SET search_path TO {};", quote_identifier(&db_type, &schema))).await?;
    }
    drop(driver);

    ExplorerService::restore_database_selected(&state, &id, &file_path, &tables).await
}

// ===================== Scheduled Jobs =====================

#[tauri::command]
pub async fn create_scheduled_job(
    name: String,
    connection_id: String,
    job_type: JobType,
    cron_expression: String,
    config: serde_json::Value,
    state: State<'_, AppState>,
) -> AppResult<ScheduledJob> {
    let now = chrono::Utc::now();
    let schedule = cron::Schedule::from_str(&cron_expression)
        .map_err(|e| AppError::Validation(format!("Invalid cron expression: {}", e)))?;

    let next_run = schedule.after(&now).next();

    let job = ScheduledJob {
        id: Uuid::new_v4(),
        name,
        connection_id: Uuid::parse_str(&connection_id)
            .map_err(|e| AppError::Validation(format!("Invalid connection ID: {}", e)))?,
        job_type,
        cron_expression,
        config,
        enabled: true,
        last_run: None,
        next_run,
        created_at: now,
    };

    state.storage.save_scheduled_job(&job).await?;
    Ok(job)
}

#[tauri::command]
pub async fn update_scheduled_job(
    id: String,
    name: Option<String>,
    cron_expression: Option<String>,
    config: Option<serde_json::Value>,
    enabled: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<ScheduledJob> {
    let mut job = state.storage.get_scheduled_job(&id).await?;

    if let Some(name) = name {
        job.name = name;
    }

    if let Some(cron_expression) = cron_expression {
        let _ = cron::Schedule::from_str(&cron_expression)
            .map_err(|e| AppError::Validation(format!("Invalid cron expression: {}", e)))?;
        job.cron_expression = cron_expression;
        job.next_run = cron::Schedule::from_str(&job.cron_expression)
            .ok()
            .and_then(|s| s.after(&chrono::Utc::now()).next());
    }

    if let Some(config) = config {
        job.config = config;
    }

    if let Some(enabled) = enabled {
        job.enabled = enabled;
    }

    state.storage.save_scheduled_job(&job).await?;
    Ok(job)
}

#[tauri::command]
pub async fn delete_scheduled_job(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.storage.delete_scheduled_job(&id).await
}

#[tauri::command]
pub async fn get_scheduled_jobs(state: State<'_, AppState>) -> AppResult<Vec<ScheduledJob>> {
    state.storage.get_all_scheduled_jobs().await
}

#[tauri::command]
pub async fn run_job_now(id: String, state: State<'_, AppState>, app_handle: AppHandle) -> AppResult<()> {
    let storage = state.storage.clone();
    let app_handle = Some(app_handle);

    tokio::spawn(async move {
        if let Err(e) = job_engine::execute_job_now(&storage, &app_handle, &id).await {
            eprintln!("[run_job_now] Error: {}", e);
        }
    });

    Ok(())
}

// ── Sync Commands ──

#[tauri::command]
pub async fn save_sync_pipeline(
    pipeline: SyncPipeline,
    state: State<'_, AppState>,
) -> AppResult<SyncPipeline> {
    state.storage.save_sync_pipeline(&pipeline).await
}

#[tauri::command]
pub async fn list_sync_pipelines(state: State<'_, AppState>) -> AppResult<Vec<SyncPipeline>> {
    state.storage.list_sync_pipelines().await
}

#[tauri::command]
pub async fn get_sync_pipeline(id: String, state: State<'_, AppState>) -> AppResult<SyncPipeline> {
    state.storage.get_sync_pipeline(&id).await
}

#[tauri::command]
pub async fn delete_sync_pipeline(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.storage.delete_sync_pipeline(&id).await
}

#[tauri::command]
pub async fn validate_sync_pipeline(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<crate::models::sync::ValidationReport> {
    let pipeline = state.storage.get_sync_pipeline(&id).await?;
    let source = get_or_connect_driver(&state, &pipeline.source_connection_id).await?;
    let target = get_or_connect_driver(&state, &pipeline.target_connection_id).await?;
    SyncService::validate(&pipeline, source.as_ref(), target.as_ref()).await
}

#[tauri::command]
pub async fn validate_sync_config(
    source_connection_id: String,
    target_connection_id: String,
    tables: Vec<crate::models::sync::SyncTableConfig>,
    mode: crate::models::sync::SyncMode,
    batch_size: Option<usize>,
    state: State<'_, AppState>,
) -> AppResult<crate::models::sync::ValidationReport> {
    let source = get_or_connect_driver(&state, &source_connection_id).await?;
    let target = get_or_connect_driver(&state, &target_connection_id).await?;

    let pipeline = crate::models::sync::SyncPipeline {
        id: None,
        name: String::new(),
        source_connection_id,
        target_connection_id,
        mode,
        status: crate::models::sync::PipelineStatus::Draft,
        tables,
        batch_size: batch_size.unwrap_or(1000),
        created_at: None,
        updated_at: None,
    };

    SyncService::validate(&pipeline, source.as_ref(), target.as_ref()).await
}

/// Get a driver from the runtime HashMap; if not found or the connection is dead, reconnect.
async fn get_or_connect_driver(state: &AppState, conn_id: &str) -> AppResult<Arc<dyn crate::db::DbDriver>> {
    if let Ok(driver) = state.get_connection(conn_id).await {
        // Quick health check — lightweight query to verify the connection is alive
        let healthy = match driver.db_type() {
            // SQL databases all support SELECT 1
            crate::db::DbType::Postgres
            | crate::db::DbType::Mysql
            | crate::db::DbType::Mariadb
            | crate::db::DbType::Sqlite
            | crate::db::DbType::Sqlserver => driver.execute("SELECT 1").await.is_ok(),
            // MongoDB doesn't support SQL — use fetch_databases instead
            crate::db::DbType::Mongodb => driver.fetch_databases().await.is_ok(),
        };
        if healthy {
            return Ok(driver);
        }
        // Connection is stale — fall through to reconnect
        tracing::warn!("Connection {conn_id} is stale, reconnecting...");
    }

    let config = state.storage.get_connection(conn_id).await?;
    // Drop the stale entry before reconnecting
    let _ = state.remove_connection(conn_id).await;
    ConnectionService::connect(state, config).await?;
    state.get_connection(conn_id).await
}

#[tauri::command]
pub async fn start_sync(
    id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let pipeline = state.storage.get_sync_pipeline(&id).await?;
    let source_driver = get_or_connect_driver(&state, &pipeline.source_connection_id).await?;
    let target_driver = get_or_connect_driver(&state, &pipeline.target_connection_id).await?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();
    let emit_handle = app_handle.clone();

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let payload = serde_json::to_value(&event).unwrap_or_default();
            let _ = emit_handle.emit("sync:event", &payload);
        }
    });

    let db_type = source_driver.db_type();

    tokio::spawn(async move {
        let source: &dyn crate::db::DataReader = &*source_driver;
        let target: &dyn crate::db::DataWriter = &*target_driver;

        if let Err(e) = SyncService::execute_pipeline(
            &pipeline,
            source,
            target,
            db_type,
            Some(tx),
        ).await {
            let _ = app_handle.emit("sync:error", &e.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn list_sync_runs(
    pipeline_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<SyncRun>> {
    state.storage.list_sync_runs(&pipeline_id).await
}

#[tauri::command]
pub async fn get_sync_run(id: String, state: State<'_, AppState>) -> AppResult<SyncRun> {
    state.storage.get_sync_run(&id).await
}

#[tauri::command]
pub async fn list_sync_batches(
    run_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<SyncBatch>> {
    state.storage.list_sync_batches(&run_id).await
}

#[tauri::command]
pub async fn list_sync_row_errors(
    batch_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<SyncRowError>> {
    state.storage.list_sync_row_errors(&batch_id).await
}

#[tauri::command]
pub async fn get_checkpoint(
    pipeline_id: String,
    state: State<'_, AppState>,
) -> AppResult<Option<SyncCheckpoint>> {
    state.storage.get_latest_checkpoint(&pipeline_id).await
}
