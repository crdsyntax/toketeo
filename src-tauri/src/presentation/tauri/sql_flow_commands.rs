use crate::application::explorer_service::ExplorerService;
use crate::application::sql_flow_service::SqlFlowService;
use crate::error::AppResult;
use crate::models::sql_flow::SqlFlowGraph;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn parse_sql_flow(query: String, dialect: Option<String>) -> AppResult<SqlFlowGraph> {
    SqlFlowService::parse_query(&query, dialect.as_deref())
}

#[tauri::command]
pub async fn get_sql_schema_flow_data(
    query: String,
    connection_id: Option<String>,
    schema: Option<String>,
    dialect: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<SqlFlowGraph> {
    let driver = if let Some(conn_id) = &connection_id {
        state.get_connection(conn_id).await.ok()
    } else {
        None
    };

    // Disambiguate duplicate column names from `SELECT a.*, b.*` joins so each node
    // keeps its own columns. Falls back to the original query when not rewritable.
    let effective_query = if let Some(driver) = &driver {
        SqlFlowService::qualify_query(&query, driver, dialect.as_deref(), schema.as_deref())
            .await
            .unwrap_or_else(|| query.clone())
    } else {
        query.clone()
    };

    // When a connection is available we MUST surface execution errors instead of
    // swallowing them with `.ok()`. A failed execution previously returned a graph
    // with nodes but `rows: None`, rendering empty nodes with no explanation.
    let query_result = if let Some(conn_id) = &connection_id {
        Some(
            ExplorerService::execute_query(&state, conn_id, &effective_query, schema.clone())
                .await?,
        )
    } else {
        None
    };

    SqlFlowService::get_flow_with_executed_result(
        &query,
        query_result.as_ref(),
        driver.as_ref(),
        dialect.as_deref(),
        schema.as_deref(),
    )
    .await
}
