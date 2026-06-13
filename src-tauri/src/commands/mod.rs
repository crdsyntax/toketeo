use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{DbConnectionConfig, QueryResult};
use crate::state::AppState;
use crate::db::DbType;
use crate::db::postgres::PostgresDriver;
use crate::db::mysql::MySqlDriver;

#[tauri::command]
pub async fn save_connection(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    state.storage.save_connection(config).await
}

#[tauri::command]
pub async fn get_connections(
    state: State<'_, AppState>,
) -> AppResult<Vec<DbConnectionConfig>> {
    state.storage.get_all_connections().await
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.storage.delete_connection(&id).await
}

#[tauri::command]
pub async fn connect(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let id = config.id.unwrap_or_else(Uuid::new_v4).to_string();
    
    let password = config.password.as_deref().unwrap_or("");
    let database = config.database.as_deref().unwrap_or("");
    
    let driver: Arc<dyn crate::db::DbDriver> = match config.db_type {
        DbType::Postgres => {
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                config.user, password, config.host, config.port, database
            );
            Arc::new(PostgresDriver::new(&url).await?)
        }
        DbType::Mysql | DbType::Mariadb => {
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                config.user, password, config.host, config.port, database
            );
            Arc::new(MySqlDriver::new(&url).await?)
        }
        _ => return Err(AppError::Internal("Driver not yet implemented".into())),
    };

    state.add_connection(id.clone(), driver).await;
    Ok(id)
}

#[tauri::command]
pub async fn disconnect(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.remove_connection(&id).await
}

#[tauri::command]
pub async fn execute_query(
    id: String,
    query: String,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    let driver = state.get_connection(&id).await?;
    driver.execute(&query).await
}

#[tauri::command]
pub async fn get_schemas(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_schemas().await
}

#[tauri::command]
pub async fn get_tables(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_tables(schema).await
}

#[tauri::command]
pub async fn get_columns(
    _id: String,
    _table: String,
    _state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(vec![]) // TODO
}

#[tauri::command]
pub async fn get_indexes(
    _id: String,
    _table: String,
    _state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(vec![]) // TODO
}

#[tauri::command]
pub async fn get_foreign_keys(
    _id: String,
    _table: String,
    _state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(vec![]) // TODO
}

#[tauri::command]
pub async fn get_constraints(
    _id: String,
    _table: String,
    _state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(vec![]) // TODO
}

#[tauri::command]
pub async fn get_ddl(
    _id: String,
    _name: String,
    _type: String,
    _state: State<'_, AppState>,
) -> AppResult<String> {
    Ok("".into()) // TODO
}

#[tauri::command]
pub async fn update_ddl(
    _id: String,
    _name: String,
    _type: String,
    _sql: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn get_parameters(
    _id: String,
    _name: String,
    _type: String,
    _state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(vec![]) // TODO
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
pub async fn switch_schema(
    _id: String,
    _schema: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}
