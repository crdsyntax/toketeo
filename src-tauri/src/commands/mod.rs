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
pub async fn connect(
    config: DbConnectionConfig,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let id = config.id.unwrap_or_else(Uuid::new_v4).to_string();
    
    // Construir URL de conexión (Simplificado, en prod manejar caracteres especiales)
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
        DbType::Mysql => {
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
pub async fn get_tables(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let driver = state.get_connection(&id).await?;
    driver.fetch_tables().await
}
