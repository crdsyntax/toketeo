use crate::application::audit_service::AuditService;
use crate::application::connection_service::ConnectionService;
use crate::application::explorer_service::ExplorerService;
use crate::application::sql_generator_service::SqlGeneratorService;
use crate::application::model_generator_service::ModelGeneratorService;
use crate::error::{AppError, AppResult};
use crate::models::{CellUpdateInput, DbConnectionConfig, QueryResult, RowContext};
use crate::state::AppState;
use std::process::Command;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

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
                format!("USE `{}`;\n{}", s, sql)
            }
            crate::db::DbType::Postgres => {
                // For Postgres, we still do SET search_path first as it might behave differently with raw_sql
                driver
                    .execute(&format!("SET search_path TO \"{}\";", s))
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

#[tauri::command]
pub async fn drop_column(
    id: String,
    table: String,
    column: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let sql = format!("ALTER TABLE {} DROP COLUMN {}", table, column);
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
    let sql = match driver.db_type() {
        crate::db::DbType::Postgres => format!("DROP INDEX {}", index),
        _ => format!("ALTER TABLE {} DROP INDEX {}", table, index),
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
    let sql = match driver.db_type() {
        crate::db::DbType::Postgres => format!("ALTER INDEX {} RENAME TO {}", old_name, new_name),
        crate::db::DbType::Mysql | crate::db::DbType::Mariadb => format!("ALTER TABLE {} RENAME INDEX {} TO {}", table, old_name, new_name),
        _ => return Err(crate::error::AppError::Validation(format!("Rename index not supported for {:?}", driver.db_type()))),
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
    let sql = match driver.db_type() {
        crate::db::DbType::Postgres => format!("ALTER TABLE {} DROP CONSTRAINT {}", table, constraint),
        _ => format!("ALTER TABLE {} DROP FOREIGN KEY {}", table, constraint),
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
    let sql = format!("ALTER TABLE {} DROP CONSTRAINT {}", table, constraint);
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
    let sql = match driver.db_type() {
        crate::db::DbType::Postgres => format!("ALTER TABLE {} RENAME CONSTRAINT {} TO {}", table, old_name, new_name),
        _ => return Err(crate::error::AppError::Validation(format!("Rename constraint not supported for {:?}", driver.db_type()))),
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
    if matches!(driver.db_type(), crate::db::DbType::Postgres) {
        let schema_quoted = format!("\"{}\"", schema);
        driver.execute(&format!("SET search_path TO {};", schema_quoted)).await?;
    }
    drop(driver);

    ExplorerService::restore_database_selected(&state, &id, &file_path, &tables).await
}
