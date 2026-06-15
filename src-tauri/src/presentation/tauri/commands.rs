use tauri::State;
use crate::error::AppResult;
use crate::models::{DbConnectionConfig, QueryResult};
use crate::state::AppState;
use crate::application::connection_service::ConnectionService;
use crate::application::explorer_service::ExplorerService;

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
    ExplorerService::get_parameters(&state, &id, &name, &object_type, schema).await
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
pub async fn switch_schema(
    _id: String,
    _schema: String,
    _state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(()) // TODO
}
