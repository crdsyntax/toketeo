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
pub async fn get_views(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_views(schema).await
}

#[tauri::command]
pub async fn get_procedures(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_procedures(schema).await
}

#[tauri::command]
pub async fn get_triggers(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_triggers(schema).await
}

#[tauri::command]
pub async fn get_functions(
    id: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_functions(schema).await
}

#[tauri::command]
pub async fn get_columns(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_columns(&table, schema).await
}

#[tauri::command]
pub async fn get_indexes(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_indexes(&table, schema).await
}

#[tauri::command]
pub async fn get_foreign_keys(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_foreign_keys(&table, schema).await
}

#[tauri::command]
pub async fn get_constraints(
    id: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_constraints(&table, schema).await
}

#[tauri::command]
pub async fn get_ddl(
    id: String,
    name: String,
    object_type: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_ddl(&name, &object_type, schema).await
}

#[tauri::command]
pub async fn update_ddl(
    _id: String,
    _name: String,
    _object_type: String,
    _sql: String,
    _schema: Option<String>,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}

#[tauri::command]
pub async fn get_parameters(
    id: String,
    name: String,
    object_type: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<serde_json::Value>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_parameters(&name, &object_type, schema).await
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
    _database: Option<String>,
    name: String,
    object_type: String,
    page: u32,
    page_size: u32,
    _params: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> AppResult<QueryResult> {
    let driver = state.get_connection(&id).await?;
    
    let full_name = if let Some(schema) = _database {
        format!("`{}`.`{}`", schema.replace('`', "``"), name.replace('`', "``"))
    } else {
        format!("`{}`", name.replace('`', "``"))
    };

    let query = match object_type.to_lowercase().as_str() {
        "table" | "view" => {
            let offset = (page - 1) * page_size;
            format!("SELECT * FROM {} LIMIT {} OFFSET {}", full_name, page_size, offset)
        },
        "procedure" => {
            // Very basic procedure execution
            format!("CALL {}()", full_name) // This needs param handling
        },
        _ => return Err(AppError::Internal("Unsupported object type for data execution".into())),
    };

    driver.execute(&query).await
}

#[tauri::command]
pub async fn switch_schema(
    id: String,
    schema: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let driver = state.get_connection(&id).await?;
    driver.switch_schema(&schema).await
}
