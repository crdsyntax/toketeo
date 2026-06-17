use tauri::{State, AppHandle};
use tauri_plugin_dialog::DialogExt;
use crate::error::{AppError, AppResult};
use crate::models::{DbConnectionConfig, QueryResult};
use crate::state::AppState;
use crate::application::connection_service::ConnectionService;
use crate::application::explorer_service::ExplorerService;
use crate::application::audit_service::AuditService;

#[tauri::command]
pub async fn save_connection(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    ConnectionService::save_connection(&state, config).await
}

#[tauri::command]
pub async fn get_connections(
    state: State<'_, AppState>,
) -> AppResult<Vec<DbConnectionConfig>> {
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
pub async fn delete_connection(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    ConnectionService::delete_connection(&state, &id).await
}

#[tauri::command]
pub async fn connect(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    ConnectionService::connect(&state, config).await
}

#[tauri::command]
pub async fn disconnect(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
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
        Some(path) => path.into_path().map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let file_path = path.display().to_string();
    ConnectionService::export_connection(&state, &id, &file_path).await?;
    Ok(Some(file_path))
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
        Some(path) => path.into_path().map_err(|e| AppError::Internal(e.to_string()))?,
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
        Some(path) => path.into_path().map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(Vec::new()),
    };

    let file_path = path.display().to_string();
    ConnectionService::import_connections(&state, &file_path).await
}

#[tauri::command]
pub async fn execute_query(
    id: String,
    query: String,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    ExplorerService::execute_query(&state, &id, &query).await
}

#[tauri::command]
pub async fn get_schemas(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_schemas(&state, &id).await
}

#[tauri::command]
pub async fn get_tables(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_tables(&state, &id, schema).await
}

#[tauri::command]
pub async fn get_views(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_views(&state, &id, schema).await
}

#[tauri::command]
pub async fn get_procedures(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_procedures(&state, &id, schema).await
}

#[tauri::command]
pub async fn get_triggers(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_triggers(&state, &id, schema).await
}

#[tauri::command]
pub async fn get_functions(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    ExplorerService::get_functions(&state, &id, schema).await
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

    let final_sql = if let Some(s) = schema {
        match db_type {
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => {
                format!("USE `{}`;\n{}", s, sql)
            },
            crate::db::DbType::Postgres => {
                // For Postgres, we still do SET search_path first as it might behave differently with raw_sql
                driver.execute(&format!("SET search_path TO \"{}\";", s)).await?;
                sql
            },
            _ => sql
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
        id,
        format!("UPDATE DDL ({} {}): {}", object_type, name, final_sql),
        start.elapsed().as_millis() as u64,
        status.to_string(),
        error_msg
    ).await;

    result.map(|_| ())
}

#[tauri::command]
pub async fn commit_transaction(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.commit_transaction(&id).await
}

#[tauri::command]
pub async fn rollback_transaction(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.rollback_transaction(&id).await
}

#[tauri::command]
pub async fn edit_column(
    _id: String,
    _table: String,
    _sql: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn drop_column(
    _id: String,
    _table: String,
    _column: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn drop_index(
    _id: String,
    _table: String,
    _index: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn rename_index(
    _id: String,
    _table: String,
    _old_name: String,
    _new_name: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn drop_foreign_key(
    _id: String,
    _table: String,
    _constraint: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn drop_constraint(
    _id: String,
    _table: String,
    _constraint: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn execute_explorer(
    id: String,
    database: Option<String>,
    name: String,
    object_type: String,
    page: u32,
    page_size: u32,
    _params: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    ExplorerService::execute_explorer(&state, &id, database, &name, object_type, page, page_size).await
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
