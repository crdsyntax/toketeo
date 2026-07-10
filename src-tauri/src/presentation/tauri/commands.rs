use crate::application::audit_service::AuditService;
use crate::application::auth_service;
use crate::application::connection_service::ConnectionService;
use crate::application::explorer_service::ExplorerService;
use crate::application::keyring_service;
use crate::application::totp_service;
use crate::application::sql_generator_service::SqlGeneratorService;
use crate::application::model_generator_service::ModelGeneratorService;
use crate::application::sync::sync_service::SyncService;
use crate::application::sync::strategies::SyncEvent;
use crate::error::{AppError, AppResult};
use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;
use crate::infrastructure::drivers::driver_factory::DriverFactory;
use crate::infrastructure::scheduler::job_engine;
use crate::models::sync::{SyncBatch, SyncCheckpoint, SyncPipeline, SyncRun, SyncRowError, PipelineStatus};
use crate::models::{CellUpdateInput, DbConnectionConfig, QueryResult, RowContext, JobType, ScheduledJob};
use secrecy::ExposeSecret;
use crate::state::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::Manager;
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
pub async fn check_master_password_exists(state: State<'_, AppState>) -> AppResult<bool> {
    auth_service::check_master_password_exists(&state.storage).await
}

#[tauri::command]
pub async fn create_master_password(password: String, state: State<'_, AppState>) -> AppResult<()> {
    match auth_service::create_master_password(&password, &state.storage).await {
        Ok(key) => {
            state.set_master_key(key, 3600).await;
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn unlock_session(password: String, state: State<'_, AppState>) -> AppResult<bool> {
    match auth_service::unlock_master_password(&password, &state.storage).await {
        Ok(key) => {
            state.set_master_key(key, 3600).await;
            Ok(true)
        }
        Err(AppError::Unauthorized(_)) => Ok(false),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn lock_session(state: State<'_, AppState>) -> AppResult<()> {
    state.clear_master_key().await;
    Ok(())
}

#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let key = auth_service::change_master_password(
        &old_password,
        &new_password,
        &state,
        &state.storage,
    )
    .await?;
    state.set_master_key(key, 3600).await;
    Ok(())
}

#[tauri::command]
pub async fn is_session_unlocked(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.is_session_unlocked().await)
}

#[tauri::command]
pub async fn is_windows_hello_available() -> AppResult<bool> {
    Ok(keyring_service::is_available().await)
}

#[tauri::command]
pub async fn store_master_in_keyring(password: String) -> AppResult<()> {
    keyring_service::store_password(&password)
}

#[tauri::command]
pub async fn get_master_from_keyring() -> AppResult<Option<String>> {
    keyring_service::get_password()
}

#[tauri::command]
pub async fn remove_master_from_keyring() -> AppResult<()> {
    keyring_service::delete_password()
}

#[tauri::command]
pub async fn unlock_with_windows_hello(state: State<'_, AppState>, app_handle: AppHandle) -> AppResult<bool> {
    use raw_window_handle::HasWindowHandle;
    let hwnd = app_handle.get_webview_window("main")
        .map(|w| {
            if let Ok(handle) = w.window_handle() {
                if let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_raw() {
                    return win32.hwnd.get();
                }
            }
            0
        })
        .unwrap_or(0);
    let verified = keyring_service::request_verification(hwnd).await?;
    if !verified {
        return Ok(false);
    }

    let password = keyring_service::get_password()?
        .ok_or_else(|| AppError::Auth("No Windows Hello credential stored".into()))?;

    match crate::application::auth_service::unlock_master_password(&password, &state.storage).await {
        Ok(key) => {
            state.set_master_key(key, 3600).await;
            Ok(true)
        }
        Err(AppError::Unauthorized(_)) => Ok(false),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn is_totp_available() -> AppResult<bool> {
    Ok(true)
}

#[tauri::command]
pub async fn generate_totp_setup(state: State<'_, AppState>) -> AppResult<totp_service::TotpSetupResult> {
    totp_service::generate_totp_setup(&state, &state.storage).await
}

#[tauri::command]
pub async fn verify_and_enable_totp(
    secret: String,
    code: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    totp_service::verify_and_enable_totp(&secret, &code, &state, &state.storage).await
}

#[tauri::command]
pub async fn is_totp_enabled(state: State<'_, AppState>) -> AppResult<bool> {
    totp_service::is_totp_enabled(&state.storage).await
}

#[tauri::command]
pub async fn unlock_with_totp(code: String, state: State<'_, AppState>) -> AppResult<bool> {
    totp_service::unlock_with_totp(&code, &state, &state.storage).await
}

#[tauri::command]
pub async fn disable_totp(state: State<'_, AppState>) -> AppResult<()> {
    totp_service::disable_totp(&state.storage).await
}

#[tauri::command]
pub async fn connect(config: DbConnectionConfig, state: State<'_, AppState>) -> AppResult<String> {
    ConnectionService::connect(&state, config).await
}

#[tauri::command]
pub async fn reconnect_connection(id: String, state: State<'_, AppState>) -> AppResult<String> {
    ConnectionService::reconnect(&state, &id).await
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
pub async fn commit_transaction(id: String, state: State<'_, AppState>) -> AppResult<u64> {
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

fn normalize_cron(expr: &str) -> String {
    let trimmed = expr.trim();
    let parts: Vec<&str> = trimmed.split_whitespace().filter(|s| !s.is_empty()).collect();
    if parts.len() == 5 {
        format!("0 {}", trimmed)
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn scheduler_get_databases(connection_id: String, state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let config = state.storage.get_connection(&connection_id).await?;
    let url = ConnectionStringBuilder::build(&config)?;
    let driver = DriverFactory::create(config.db_type.clone(), &url, false, None).await?;
    driver.fetch_databases().await
}

#[tauri::command]
pub async fn scheduler_get_tables(
    connection_id: String,
    database: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let mut config = state.storage.get_connection(&connection_id).await?;
    config.database = Some(database);
    let url = ConnectionStringBuilder::build(&config)?;
    let driver = DriverFactory::create(config.db_type.clone(), &url, false, None).await?;
    driver.fetch_tables(None, None).await
}

#[tauri::command]
pub async fn create_scheduled_job(
    name: String,
    connection_id: String,
    job_type: JobType,
    cron_expression: String,
    config: serde_json::Value,
    state: State<'_, AppState>,
) -> AppResult<ScheduledJob> {
    let cron_expression = normalize_cron(&cron_expression);
    let now = chrono::Utc::now();
    let schedule = cron::Schedule::from_str(&cron_expression)
        .map_err(|e| AppError::Validation(format!("Invalid cron expression: {}", e)))?;

    let next_run = schedule.after(&now).next();

    let conn_id = Uuid::parse_str(&connection_id)
        .map_err(|e| AppError::Validation(format!("Invalid connection ID: {}", e)))?;

    let config = if job_type == JobType::Backup {
        let conn = state.storage.get_connection(&connection_id).await?;
        let mut cfg = config.as_object().cloned().unwrap_or_default();
        cfg.insert("dbType".into(), serde_json::Value::String(conn.db_type.to_string()));
        cfg.insert("host".into(), serde_json::Value::String(conn.host));
        cfg.insert("port".into(), serde_json::Value::Number(conn.port.into()));
        cfg.insert("user".into(), serde_json::Value::String(conn.user));
        if let Some(pw) = &conn.password {
            cfg.insert("password".into(), serde_json::Value::String(pw.expose_secret().to_string()));
        }
        // Only set database from connection if frontend didn't send one
        let has_db = cfg.get("database").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        if !has_db {
            if let Some(db) = &conn.database {
                cfg.insert("database".into(), serde_json::Value::String(db.clone()));
            }
        }
        serde_json::Value::Object(cfg)
    } else {
        config
    };

    let job = ScheduledJob {
        id: Uuid::new_v4(),
        name,
        connection_id: conn_id,
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
        let cron_expression = normalize_cron(&cron_expression);
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
    let storage = state.storage.clone();

    let pipeline_id = pipeline.id.clone().unwrap_or_default();
    state.set_sync_control(&pipeline_id, crate::state::SyncControl::Running).await;

    let controller = state.sync_controller.clone();

    tokio::spawn(async move {
        let source: &dyn crate::db::DataReader = &*source_driver;
        let target: &dyn crate::db::DataWriter = &*target_driver;

        if let Err(e) = SyncService::execute_pipeline(
            &pipeline,
            source,
            target,
            db_type,
            storage,
            Some(tx),
            &controller,
        ).await {
            let _ = app_handle.emit("sync:error", &e.to_string());
        }

        controller.remove(&pipeline_id).await;
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

#[tauri::command]
pub async fn pause_sync(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.set_sync_control(&id, crate::state::SyncControl::Paused).await;
    if let Err(e) = state.storage.update_sync_pipeline_status(&id, PipelineStatus::Paused).await {
        tracing::error!("Failed to update pipeline status to Paused: {e}");
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_sync(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.set_sync_control(&id, crate::state::SyncControl::Running).await;
    if let Err(e) = state.storage.update_sync_pipeline_status(&id, PipelineStatus::Running).await {
        tracing::error!("Failed to update pipeline status to Running: {e}");
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_sync(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.set_sync_control(&id, crate::state::SyncControl::Cancelled).await;
    if let Err(e) = state.storage.update_sync_pipeline_status(&id, PipelineStatus::Cancelled).await {
        tracing::error!("Failed to update pipeline status to Cancelled: {e}");
    }
    Ok(())
}

/// Preview table data (first N rows) for the sync wizard
#[derive(Serialize)]
pub struct TablePreview {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
pub async fn get_table_preview(
    id: String,
    table: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> AppResult<TablePreview> {
    let driver = get_or_connect_driver(&state, &id).await?;
    let limit = limit.unwrap_or(5);
    let safe_table = quote_identifier(&driver.db_type(), &table);
    let sql = format!("SELECT * FROM {safe_table} LIMIT {limit}");
    let result = driver.execute(&sql).await?;

    let columns = result.columns;
    let rows: Vec<Vec<String>> = result
        .rows
        .into_iter()
        .map(|row| match row {
            serde_json::Value::Array(arr) => arr
                .into_iter()
                .map(|v| match v {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::String(s) => s,
                    other => other.to_string(),
                })
                .collect(),
            _ => vec![],
        })
        .collect();

    Ok(TablePreview { columns, rows })
}

// ── Database & Collection Management ──

#[tauri::command]
pub async fn create_database(
    id: String,
    db_name: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = get_or_connect_driver(&state, &id).await?;
    let db_type = driver.db_type();

    match db_type {
        crate::db::DbType::Mongodb => {
            let query = serde_json::json!({
                "create": "_init_",
                "database": db_name,
            }).to_string();
            driver.execute(&query).await?;
        }
        crate::db::DbType::Postgres => {
            driver.execute(&format!("CREATE DATABASE {}", quote_identifier(&db_type, &db_name))).await?;
        }
        crate::db::DbType::Sqlserver => {
            driver.execute(&format!("CREATE DATABASE [{}]", db_name.replace(']', "]]"))).await?;
        }
        _ => {
            driver.execute(&format!("CREATE DATABASE `{}`", db_name.replace('`', "``"))).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn create_collection(
    id: String,
    db_name: String,
    collection_name: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    let db_type = driver.db_type();

    match db_type {
        crate::db::DbType::Mongodb => {
            let query = serde_json::json!({
                "create": collection_name,
                "database": db_name,
            }).to_string();
            driver.execute(&query).await?;
        }
        crate::db::DbType::Postgres => {
            let sql = format!(
                "CREATE TABLE {} (\"id\" BIGSERIAL PRIMARY KEY);",
                quote_identifier(&db_type, &collection_name)
            );
            driver.execute(&sql).await?;
        }
        crate::db::DbType::Sqlserver => {
            let sql = format!(
                "CREATE TABLE [{}] ([id] BIGINT IDENTITY(1,1) PRIMARY KEY);",
                collection_name.replace(']', "]]")
            );
            driver.execute(&sql).await?;
        }
        _ => {
            let sql = format!(
                "CREATE TABLE `{}` (`id` BIGINT AUTO_INCREMENT PRIMARY KEY);",
                collection_name.replace('`', "``")
            );
            driver.execute(&sql).await?;
        }
    }
    Ok(())
}

// ── MongoDB Backup & Restore ──

#[tauri::command]
pub async fn mongo_backup_database(
    id: String,
    db_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Save MongoDB backup")
        .set_file_name(format!("{}.json", db_name))
        .add_filter("JSON Files", &["json"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    let path = match file_path {
        Some(path) => path.into_path().map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let driver = state.get_connection(&id).await?;
    let filename = path.display().to_string();

    let collections = driver.fetch_tables(Some(db_name.clone()), None).await?;

    let mut output = serde_json::Map::new();
    output.insert("database".into(), serde_json::Value::String(db_name.clone()));
    output.insert("exportedAt".into(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));

    let mut colls = serde_json::Map::new();
    for collection in &collections {
        let query = serde_json::json!({
            "collection": collection,
            "database": db_name,
            "find": {},
            "limit": 0,
        }).to_string();
        match driver.execute(&query).await {
            Ok(result) => {
                colls.insert(collection.clone(), serde_json::Value::Array(result.rows));
            }
            Err(e) => {
                colls.insert(collection.clone(), serde_json::Value::String(format!("__error__: {}", e)));
            }
        }
    }
    output.insert("collections".into(), serde_json::Value::Object(colls));

    let json = serde_json::to_string_pretty(&output).unwrap_or_default();
    std::fs::write(&filename, &json)
        .map_err(|e| AppError::Internal(format!("Failed to write backup: {}", e)))?;

    Ok(Some(filename))
}

#[tauri::command]
pub async fn mongo_restore_database(
    id: String,
    db_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<Option<String>> {
    let file_path = app_handle
        .dialog()
        .file()
        .set_title("Select MongoDB backup file to restore")
        .add_filter("JSON Files", &["json"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    let path = match file_path {
        Some(path) => path.into_path().map_err(|e| AppError::Internal(e.to_string()))?,
        None => return Ok(None),
    };

    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("Failed to read backup file: {}", e)))?;

    let backup: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::Validation(format!("Invalid backup JSON: {}", e)))?;

    let collections = backup.get("collections")
        .and_then(|c| c.as_object())
        .ok_or_else(|| AppError::Validation("Invalid backup format: missing 'collections'".into()))?;

    let driver = state.get_connection(&id).await?;
    let mut total = 0u64;

    for (coll_name, docs) in collections {
        let docs_arr = match docs.as_array() {
            Some(arr) => arr,
            None => continue,
        };
        if docs_arr.is_empty() {
            continue;
        }

        // Insert all documents in bulk
        let insert_cmd = serde_json::json!({
            "insert": coll_name,
            "database": db_name,
            "documents": docs_arr,
            "ordered": false,
        }).to_string();
        match driver.execute(&insert_cmd).await {
            Ok(_) => total += docs_arr.len() as u64,
            Err(e) => eprintln!("[mongo_restore] Error inserting into {}: {}", coll_name, e),
        }
    }

    Ok(Some(format!("Restored {} documents into {} collections", total, collections.len())))
}

// ── Character Commands ──

#[tauri::command]
pub async fn get_character(state: State<'_, AppState>) -> AppResult<crate::models::Character> {
    state.storage.get_character().await
}

#[tauri::command]
pub async fn save_character(
    character: crate::models::Character,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.storage.save_character(&character).await
}
